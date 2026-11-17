from datetime import datetime, timezone, timedelta
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, cast, Integer, case
from ..core.database import get_db
from ..core.dependencies import require_role
from ..models.user import User, UserRole
from ..models.order import Order, OrderItem, OrderStatus
from ..models.table import Table
from ..models.restaurant import Restaurant
from ..schemas.base import BaseSchema

router = APIRouter(prefix="/reports", tags=["Reports"])

RU_DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]


class ReportSlot(BaseSchema):
    label: str
    revenue: float
    orders: int


class TopDish(BaseSchema):
    name: str
    quantity: int
    revenue: float


class WaiterOrderBrief(BaseSchema):
    order_number: int
    table_number: int | None
    table_zone: str | None
    status: str
    total_amount: float
    created_at: datetime


class WaiterStat(BaseSchema):
    waiter_id: str
    waiter_name: str
    total_orders: int
    paid_orders: int
    cancelled_orders: int
    revenue: float
    orders: list[WaiterOrderBrief]


class ReportResponse(BaseSchema):
    total_revenue: float
    total_orders: int
    paid_orders: int
    cancelled_orders: int
    avg_order_value: float
    currency: str
    slots: list[ReportSlot]
    top_dishes: list[TopDish]
    waiter_stats: list[WaiterStat]


@router.get("", response_model=ReportResponse)
async def get_reports(
    period: Literal["day", "week", "month"] = Query("day"),
    user: User = Depends(require_role(UserRole.RESTAURANT_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")

    rid = user.restaurant_id
    now = datetime.now(timezone.utc)

    if period == "day":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        start = (now - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        start = (now - timedelta(days=29)).replace(hour=0, minute=0, second=0, microsecond=0)

    rest_result = await db.execute(select(Restaurant).where(Restaurant.id == rid))
    restaurant = rest_result.scalar_one_or_none()
    currency = "KGS"

    # All orders in period (with table loaded via selectin)
    orders_result = await db.execute(
        select(Order).where(Order.restaurant_id == rid, Order.created_at >= start)
    )
    orders_list = orders_result.scalars().all()

    total_orders = len(orders_list)
    paid_orders = sum(1 for o in orders_list if o.status == OrderStatus.PAID)
    cancelled_orders = sum(1 for o in orders_list if o.status == OrderStatus.CANCELLED)
    total_revenue = sum(float(o.total_amount) for o in orders_list if o.status == OrderStatus.PAID)
    avg_order_value = round(total_revenue / paid_orders, 2) if paid_orders > 0 else 0

    # Slot breakdown
    paid_revenue_expr = func.coalesce(
        func.sum(case((Order.status == OrderStatus.PAID, Order.total_amount), else_=0)), 0
    )

    if period == "day":
        slot_result = await db.execute(
            select(
                cast(func.extract("hour", Order.created_at), Integer).label("slot"),
                func.count(Order.id).label("orders"),
                paid_revenue_expr.label("revenue"),
            )
            .where(Order.restaurant_id == rid, Order.created_at >= start)
            .group_by("slot")
            .order_by("slot")
        )
        slots = [
            ReportSlot(label=f"{row.slot:02d}:00", revenue=float(row.revenue), orders=row.orders)
            for row in slot_result.all()
        ]
    else:
        slot_result = await db.execute(
            select(
                func.date_trunc("day", Order.created_at).label("slot"),
                func.count(Order.id).label("orders"),
                paid_revenue_expr.label("revenue"),
            )
            .where(Order.restaurant_id == rid, Order.created_at >= start)
            .group_by("slot")
            .order_by("slot")
        )
        slots = []
        for row in slot_result.all():
            dt = row.slot
            label = RU_DAYS[dt.weekday()] if period == "week" else dt.strftime("%d.%m")
            slots.append(ReportSlot(label=label, revenue=float(row.revenue), orders=row.orders))

    # Top 10 dishes (by quantity sold)
    top_result = await db.execute(
        select(
            OrderItem.item_name_snapshot.label("name"),
            func.sum(OrderItem.quantity).label("quantity"),
            func.coalesce(func.sum(OrderItem.total_price), 0).label("revenue"),
        )
        .join(Order, OrderItem.order_id == Order.id)
        .where(
            Order.restaurant_id == rid,
            Order.created_at >= start,
            Order.status == OrderStatus.PAID,
            OrderItem.is_cancelled == False,
        )
        .group_by(OrderItem.item_name_snapshot)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(10)
    )
    top_dishes = [
        TopDish(name=r.name, quantity=int(r.quantity), revenue=float(r.revenue))
        for r in top_result.all()
    ]

    # Waiter stats — group orders by assigned waiter via table
    waiter_agg_result = await db.execute(
        select(
            User.id.label("waiter_id"),
            User.name.label("waiter_name"),
            func.count(Order.id).label("total_orders"),
            func.count(case((Order.status == OrderStatus.PAID, Order.id))).label("paid_orders"),
            func.count(case((Order.status == OrderStatus.CANCELLED, Order.id))).label("cancelled_orders"),
            func.coalesce(
                func.sum(case((Order.status == OrderStatus.PAID, Order.total_amount), else_=0)), 0
            ).label("revenue"),
        )
        .join(Table, Order.table_id == Table.id)
        .join(User, Table.waiter_id == User.id)
        .where(Order.restaurant_id == rid, Order.created_at >= start)
        .group_by(User.id, User.name)
        .order_by(func.coalesce(
            func.sum(case((Order.status == OrderStatus.PAID, Order.total_amount), else_=0)), 0
        ).desc())
    )
    agg_rows = waiter_agg_result.all()

    # Fetch individual orders per waiter
    waiter_stats: list[WaiterStat] = []
    for row in agg_rows:
        orders_q = await db.execute(
            select(Order)
            .join(Table, Order.table_id == Table.id)
            .where(
                Order.restaurant_id == rid,
                Order.created_at >= start,
                Table.waiter_id == row.waiter_id,
            )
            .order_by(Order.created_at.desc())
        )
        waiter_orders = orders_q.scalars().all()
        order_briefs = [
            WaiterOrderBrief(
                order_number=o.order_number,
                table_number=o.table_number,
                table_zone=o.table_zone,
                status=o.status.value,
                total_amount=float(o.total_amount),
                created_at=o.created_at,
            )
            for o in waiter_orders
        ]
        waiter_stats.append(WaiterStat(
            waiter_id=str(row.waiter_id),
            waiter_name=row.waiter_name,
            total_orders=row.total_orders,
            paid_orders=row.paid_orders,
            cancelled_orders=row.cancelled_orders,
            revenue=float(row.revenue),
            orders=order_briefs,
        ))

    return ReportResponse(
        total_revenue=total_revenue,
        total_orders=total_orders,
        paid_orders=paid_orders,
        cancelled_orders=cancelled_orders,
        avg_order_value=avg_order_value,
        currency=currency,
        slots=slots,
        top_dishes=top_dishes,
        waiter_stats=waiter_stats,
    )
