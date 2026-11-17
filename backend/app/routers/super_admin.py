import secrets
import string
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from ..core.database import get_db
from ..core.dependencies import require_role
from ..core.security import hash_password
from ..models.user import User, UserRole
from ..models.restaurant import Restaurant, RestaurantStatus
from ..models.tariff import Tariff
from ..models.order import Order, OrderStatus
from ..models.table import Table
from ..models.payment import Payment
from ..models.feedback import Feedback
from ..models.activity_log import ActivityLog
from ..models.subscription import SubscriptionHistory, SubscriptionPayment
from ..models.waiter_call import WaiterCall
from ..schemas.restaurant import (
    RestaurantCreate, RestaurantUpdate, RestaurantResponse,
    RestaurantStatusUpdate, RestaurantAssignTariff, RestaurantSettingsUpdate,
)
from ..schemas.user import UserCreate, UserResponse
from ..schemas.base import BaseSchema
from ..services.activity_log_service import log_action
import re


class SuperDashboardResponse(BaseSchema):
    total_restaurants: int
    active_restaurants: int
    blocked_restaurants: int
    expired_restaurants: int
    total_orders: int
    total_revenue: float = 0.0


class TableToggleBody(BaseSchema):
    is_active: bool | None = None


router = APIRouter(prefix="/super", tags=["Super Admin"])


def _slug_is_valid(slug: str) -> bool:
    return bool(re.match(r'^[a-z0-9-]+$', slug))


def _since(period: str | None) -> datetime | None:
    if not period or period == 'all':
        return None
    now = datetime.now(timezone.utc)
    if period == 'today':
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    return now - timedelta(days=14)


def _days_left(ends_at: datetime | None) -> int:
    if not ends_at:
        return 0
    aware = ends_at.replace(tzinfo=timezone.utc) if ends_at.tzinfo is None else ends_at
    diff = aware - datetime.now(timezone.utc)
    return max(0, int(diff.total_seconds() // 86400))


# ─── Dashboard ────────────────────────────────────────────────────────────────

@router.get("/dashboard", response_model=SuperDashboardResponse)
async def super_dashboard(
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    total_restaurants = (await db.execute(select(func.count(Restaurant.id)))).scalar() or 0
    active = (await db.execute(select(func.count(Restaurant.id)).where(Restaurant.status == RestaurantStatus.ACTIVE))).scalar() or 0
    blocked = (await db.execute(select(func.count(Restaurant.id)).where(Restaurant.status == RestaurantStatus.BLOCKED))).scalar() or 0
    expired = (await db.execute(select(func.count(Restaurant.id)).where(Restaurant.status == RestaurantStatus.EXPIRED))).scalar() or 0
    total_orders = (await db.execute(select(func.count(Order.id)))).scalar() or 0
    total_revenue = (await db.execute(select(func.coalesce(func.sum(Order.total_amount), 0)).where(Order.status == "paid"))).scalar() or 0
    return SuperDashboardResponse(
        total_restaurants=int(total_restaurants),
        active_restaurants=int(active),
        blocked_restaurants=int(blocked),
        expired_restaurants=int(expired),
        total_orders=int(total_orders),
        total_revenue=float(total_revenue),
    )


# ─── Restaurant List ──────────────────────────────────────────────────────────

@router.get("/restaurants", response_model=list[RestaurantResponse])
async def list_restaurants(
    status: RestaurantStatus | None = Query(None),
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    q = select(Restaurant)
    if status:
        q = q.where(Restaurant.status == status)
    result = await db.execute(q.order_by(Restaurant.created_at.desc()))
    return result.scalars().all()


# ─── Create Restaurant ────────────────────────────────────────────────────────

@router.post("/restaurants", response_model=RestaurantResponse, status_code=201)
async def create_restaurant(
    body: RestaurantCreate,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    if not _slug_is_valid(body.slug):
        raise HTTPException(status_code=400, detail="Slug must contain only lowercase letters, numbers, and hyphens")
    existing = await db.execute(select(Restaurant).where(Restaurant.slug == body.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Slug already taken")
    restaurant = Restaurant(**body.model_dump())
    db.add(restaurant)
    await db.flush()
    await log_action(db, "create_restaurant", user=user, entity_type="restaurant", entity_id=str(restaurant.id), description=f"Created restaurant: {restaurant.name}")
    await db.commit()
    await db.refresh(restaurant)
    return restaurant


# ─── Restaurant Detail ────────────────────────────────────────────────────────

@router.get("/restaurants/{restaurant_id}")
async def get_restaurant(
    restaurant_id: str,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    tariff = None
    if r.tariff_id:
        t_res = await db.execute(select(Tariff).where(Tariff.id == r.tariff_id))
        tariff = t_res.scalar_one_or_none()

    # Last activity
    last_order_res = await db.execute(
        select(Order).where(Order.restaurant_id == r.id)
        .order_by(Order.created_at.desc()).limit(1)
    )
    last_order = last_order_res.scalar_one_or_none()

    last_call_res = await db.execute(
        select(WaiterCall).where(WaiterCall.restaurant_id == r.id)
        .order_by(WaiterCall.created_at.desc()).limit(1)
    )
    last_call = last_call_res.scalar_one_or_none()

    last_feedback_res = await db.execute(
        select(Feedback).where(Feedback.restaurant_id == r.id)
        .order_by(Feedback.created_at.desc()).limit(1)
    )
    last_feedback = last_feedback_res.scalar_one_or_none()

    last_admin_login_res = await db.execute(
        select(ActivityLog)
        .where(
            ActivityLog.restaurant_id == r.id,
            ActivityLog.action == "login",
            ActivityLog.role == UserRole.RESTAURANT_ADMIN.value,
        )
        .order_by(ActivityLog.created_at.desc()).limit(1)
    )
    last_admin_log = last_admin_login_res.scalar_one_or_none()

    last_staff_login_res = await db.execute(
        select(ActivityLog)
        .where(
            ActivityLog.restaurant_id == r.id,
            ActivityLog.action == "login",
            ActivityLog.role != UserRole.RESTAURANT_ADMIN.value,
        )
        .order_by(ActivityLog.created_at.desc()).limit(1)
    )
    last_staff_log = last_staff_login_res.scalar_one_or_none()

    def _log_to_session(log: ActivityLog | None) -> dict | None:
        if not log:
            return None
        return {
            "id": str(log.id),
            "sessionId": str(log.id),
            "isActive": False,
            "ipAddress": log.ip_address,
            "userAgent": log.user_agent,
            "createdAt": log.created_at.isoformat(),
            "lastSeenAt": log.created_at.isoformat(),
            "status": "expired",
            "role": log.role,
        }

    restaurant_data = {
        "id": str(r.id),
        "name": r.name,
        "slug": r.slug,
        "phone": r.phone,
        "address": r.address,
        "city": r.city,
        "status": r.status.value.upper(),
        "tariffId": str(r.tariff_id) if r.tariff_id else None,
        "subscriptionStartedAt": r.subscription_started_at.isoformat() if r.subscription_started_at else None,
        "subscriptionEndsAt": r.subscription_ends_at.isoformat() if r.subscription_ends_at else None,
        "currency": r.currency,
        "language": r.language,
        "adminLimit": r.admin_limit,
        "adminSessionPolicy": r.admin_session_policy,
        "allowOrders": r.allow_orders,
        "allowWaiterCalls": r.allow_waiter_calls,
        "allowBillRequests": r.allow_bill_requests,
        "createdAt": r.created_at.isoformat(),
        "tariff": {
            "id": str(tariff.id),
            "name": tariff.name,
            "limits": {
                "tables": tariff.max_tables,
                "staff": tariff.max_staff,
                "dishes": tariff.max_menu_items,
            }
        } if tariff else None,
    }

    return {
        "restaurant": restaurant_data,
        "lastActivity": {
            "lastOrder": {"id": str(last_order.id), "createdAt": last_order.created_at.isoformat(), "status": last_order.status.value} if last_order else None,
            "lastCall": {"id": str(last_call.id), "createdAt": last_call.created_at.isoformat(), "type": last_call.call_type.value} if last_call else None,
            "lastFeedback": {"id": str(last_feedback.id), "createdAt": last_feedback.created_at.isoformat(), "rating": last_feedback.rating} if last_feedback else None,
            "lastAdminLogin": _log_to_session(last_admin_log),
            "lastStaffLogin": _log_to_session(last_staff_log),
        }
    }


# ─── Restaurant Summary ───────────────────────────────────────────────────────

@router.get("/restaurants/{restaurant_id}/summary")
async def get_restaurant_summary(
    restaurant_id: str,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    days14_ago = now - timedelta(days=14)

    # Staff counts
    staff_res = await db.execute(select(User).where(User.restaurant_id == r.id))
    all_staff = staff_res.scalars().all()
    admins = [u for u in all_staff if u.role == UserRole.RESTAURANT_ADMIN]
    waiters = [u for u in all_staff if u.role == UserRole.WAITER]
    cooks = [u for u in all_staff if u.role == UserRole.COOK]
    cashiers = [u for u in all_staff if u.role == UserRole.CASHIER]

    # Tables
    tables_res = await db.execute(select(Table).where(Table.restaurant_id == r.id))
    all_tables = tables_res.scalars().all()
    active_tables = [t for t in all_tables if t.is_active]

    # Orders
    orders_total = (await db.execute(select(func.count(Order.id)).where(Order.restaurant_id == r.id))).scalar() or 0
    orders_today = (await db.execute(select(func.count(Order.id)).where(Order.restaurant_id == r.id, Order.created_at >= today_start))).scalar() or 0
    orders_14d = (await db.execute(select(func.count(Order.id)).where(Order.restaurant_id == r.id, Order.created_at >= days14_ago))).scalar() or 0

    # Payments
    payments_today = (await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.restaurant_id == r.id, Payment.created_at >= today_start, Payment.status == "paid")
    )).scalar() or 0
    payments_14d = (await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.restaurant_id == r.id, Payment.created_at >= days14_ago, Payment.status == "paid")
    )).scalar() or 0
    unpaid_orders = (await db.execute(
        select(func.count(Order.id))
        .where(Order.restaurant_id == r.id, Order.status.notin_(["paid", "cancelled"]))
    )).scalar() or 0

    # Logins
    logins_14d = (await db.execute(
        select(func.count(ActivityLog.id))
        .where(ActivityLog.restaurant_id == r.id, ActivityLog.action == "login", ActivityLog.created_at >= days14_ago)
    )).scalar() or 0

    # Last logins
    last_admin_log = (await db.execute(
        select(ActivityLog)
        .where(ActivityLog.restaurant_id == r.id, ActivityLog.action == "login", ActivityLog.role == UserRole.RESTAURANT_ADMIN.value)
        .order_by(ActivityLog.created_at.desc()).limit(1)
    )).scalar_one_or_none()

    last_staff_log = (await db.execute(
        select(ActivityLog)
        .where(ActivityLog.restaurant_id == r.id, ActivityLog.action == "login", ActivityLog.role != UserRole.RESTAURANT_ADMIN.value)
        .order_by(ActivityLog.created_at.desc()).limit(1)
    )).scalar_one_or_none()

    def _log_to_session(log: ActivityLog | None) -> dict | None:
        if not log:
            return None
        return {
            "id": str(log.id),
            "sessionId": str(log.id),
            "isActive": False,
            "ipAddress": log.ip_address,
            "createdAt": log.created_at.isoformat(),
            "lastSeenAt": log.created_at.isoformat(),
            "status": "expired",
        }

    return {
        "adminsCount": len(admins),
        "adminLimit": r.admin_limit,
        "staffCount": len(all_staff) - len(admins),
        "waitersCount": len(waiters),
        "cooksCount": len(cooks),
        "cashiersCount": len(cashiers),
        "tablesCount": len(all_tables),
        "activeTablesCount": len(active_tables),
        "inactiveTablesCount": len(all_tables) - len(active_tables),
        "ordersTotal": int(orders_total),
        "ordersToday": int(orders_today),
        "ordersLast14Days": int(orders_14d),
        "paymentsToday": float(payments_today),
        "paymentsLast14Days": float(payments_14d),
        "unpaidOrders": int(unpaid_orders),
        "lastAdminLogin": _log_to_session(last_admin_log),
        "lastStaffLogin": _log_to_session(last_staff_log),
        "loginsLast14Days": int(logins_14d),
    }


# ─── Restaurant Tab: Admins ───────────────────────────────────────────────────

@router.get("/restaurants/{restaurant_id}/admins")
async def get_restaurant_admins(
    restaurant_id: str,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    return await _get_restaurant_users(restaurant_id, [UserRole.RESTAURANT_ADMIN], None, db)


# ─── Restaurant Tab: Staff ────────────────────────────────────────────────────

@router.get("/restaurants/{restaurant_id}/staff")
async def get_restaurant_staff(
    restaurant_id: str,
    role: str | None = Query(None),
    status: str | None = Query(None),
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    roles = [UserRole.WAITER, UserRole.COOK, UserRole.CASHIER, UserRole.RESTAURANT_ADMIN]
    if role and role != 'ALL':
        try:
            roles = [UserRole(role)]
        except ValueError:
            pass
    is_active = None
    if status == 'ACTIVE':
        is_active = True
    elif status == 'BLOCKED':
        is_active = False
    return await _get_restaurant_users(restaurant_id, roles, is_active, db)


async def _get_restaurant_users(restaurant_id: str, roles: list[UserRole], is_active: bool | None, db: AsyncSession) -> list[dict]:
    q = select(User).where(User.restaurant_id == restaurant_id, User.role.in_(roles))
    if is_active is not None:
        q = q.where(User.is_active == is_active)
    result = await db.execute(q.order_by(User.created_at.desc()))
    users = result.scalars().all()

    days14_ago = datetime.now(timezone.utc) - timedelta(days=14)
    out = []
    for u in users:
        # Last login from activity logs
        last_log_res = await db.execute(
            select(ActivityLog)
            .where(ActivityLog.user_id == u.id, ActivityLog.action == "login")
            .order_by(ActivityLog.created_at.desc()).limit(1)
        )
        last_log = last_log_res.scalar_one_or_none()

        # Login count last 14 days
        login_count = (await db.execute(
            select(func.count(ActivityLog.id))
            .where(ActivityLog.user_id == u.id, ActivityLog.action == "login", ActivityLog.created_at >= days14_ago)
        )).scalar() or 0

        last_login = None
        if last_log:
            last_login = {
                "id": str(last_log.id),
                "sessionId": str(last_log.id),
                "isActive": False,
                "ipAddress": last_log.ip_address,
                "createdAt": last_log.created_at.isoformat(),
                "lastSeenAt": last_log.created_at.isoformat(),
                "status": "expired",
            }

        out.append({
            "id": str(u.id),
            "name": u.name,
            "login": u.username or "",
            "email": u.email,
            "phone": u.phone,
            "role": u.role.value,
            "isActive": u.is_active,
            "createdAt": u.created_at.isoformat(),
            "lastLogin": last_login,
            "activeSessionCount": 0,
            "loginCountLast14Days": int(login_count),
        })
    return out


# ─── Restaurant Tab: Tables ───────────────────────────────────────────────────

@router.get("/restaurants/{restaurant_id}/tables")
async def get_restaurant_tables(
    restaurant_id: str,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Table).where(Table.restaurant_id == restaurant_id).order_by(Table.number)
    )
    tables = result.scalars().all()

    out = []
    for t in tables:
        # Order count
        order_count = (await db.execute(
            select(func.count(Order.id)).where(Order.table_id == t.id)
        )).scalar() or 0

        # Recent orders
        recent_res = await db.execute(
            select(Order).where(Order.table_id == t.id)
            .order_by(Order.created_at.desc()).limit(5)
        )
        recent_orders = recent_res.scalars().all()

        out.append({
            "id": str(t.id),
            "number": t.number,
            "isActive": t.is_active,
            "createdAt": t.created_at.isoformat(),
            "hall": {"name": t.zone} if t.zone else None,
            "qrCodes": [{"token": t.public_token}],
            "_count": {"orders": int(order_count)},
            "orders": [
                {"id": str(o.id), "createdAt": o.created_at.isoformat(), "status": o.status.value}
                for o in recent_orders
            ],
        })
    return out


# ─── Toggle Table Active ──────────────────────────────────────────────────────

@router.patch("/restaurants/{restaurant_id}/tables/{table_id}")
async def toggle_table_active(
    restaurant_id: str,
    table_id: str,
    body: TableToggleBody,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Table).where(Table.id == table_id, Table.restaurant_id == restaurant_id)
    )
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    if body.is_active is not None:
        table.is_active = body.is_active
    await db.commit()
    return {"id": str(table.id), "number": table.number, "isActive": table.is_active}


# ─── Restaurant Tab: Orders ───────────────────────────────────────────────────

@router.get("/restaurants/{restaurant_id}/orders")
async def get_restaurant_orders(
    restaurant_id: str,
    period: str | None = Query("14d"),
    status: str | None = Query(None),
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    since = _since(period)
    q = select(Order).where(Order.restaurant_id == restaurant_id)
    if since:
        q = q.where(Order.created_at >= since)
    if status and status != 'ALL':
        try:
            q = q.where(Order.status == OrderStatus(status.lower()))
        except ValueError:
            pass
    result = await db.execute(q.order_by(Order.created_at.desc()).limit(200))
    orders = result.scalars().all()

    out = []
    for o in orders:
        # Table number
        table_number = None
        if o.table_id:
            t_res = await db.execute(select(Table).where(Table.id == o.table_id))
            t = t_res.scalar_one_or_none()
            table_number = t.number if t else None

        # Waiter name
        waiter_name = None
        if o.table_id:
            t_res2 = await db.execute(select(Table).where(Table.id == o.table_id))
            t2 = t_res2.scalar_one_or_none()
            if t2 and t2.waiter_id:
                w_res = await db.execute(select(User).where(User.id == t2.waiter_id))
                w = w_res.scalar_one_or_none()
                waiter_name = w.name if w else None

        # Payments
        pay_res = await db.execute(select(Payment).where(Payment.order_id == o.id))
        payments = pay_res.scalars().all()

        out.append({
            "id": str(o.id),
            "status": o.status.value.upper(),
            "total": float(o.total_amount),
            "createdAt": o.created_at.isoformat(),
            "updatedAt": o.updated_at.isoformat() if o.updated_at else o.created_at.isoformat(),
            "table": {"number": table_number or 0},
            "waiter": {"name": waiter_name} if waiter_name else None,
            "payments": [{"status": p.status.value.upper(), "amount": float(p.amount), "method": p.method.value} for p in payments],
            "statusHistory": [],
        })
    return out


# ─── Restaurant Tab: Payments ─────────────────────────────────────────────────

@router.get("/restaurants/{restaurant_id}/payments")
async def get_restaurant_payments(
    restaurant_id: str,
    period: str | None = Query("14d"),
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    since = _since(period)
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    days14_ago = now - timedelta(days=14)

    q = select(Payment).where(Payment.restaurant_id == restaurant_id)
    if since:
        q = q.where(Payment.created_at >= since)
    result = await db.execute(q.order_by(Payment.created_at.desc()).limit(500))
    payments = result.scalars().all()

    total_sum = (await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.restaurant_id == restaurant_id, Payment.status == "paid")
    )).scalar() or 0
    today_sum = (await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.restaurant_id == restaurant_id, Payment.status == "paid", Payment.created_at >= today_start)
    )).scalar() or 0
    last14_sum = (await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.restaurant_id == restaurant_id, Payment.status == "paid", Payment.created_at >= days14_ago)
    )).scalar() or 0
    paid_orders = (await db.execute(
        select(func.count(Order.id)).where(Order.restaurant_id == restaurant_id, Order.status == "paid")
    )).scalar() or 0
    unpaid_orders = (await db.execute(
        select(func.count(Order.id)).where(Order.restaurant_id == restaurant_id, Order.status.notin_(["paid", "cancelled"]))
    )).scalar() or 0

    items = []
    for p in payments:
        # Order and table info
        order_id_str = str(p.order_id)
        table_number = 0
        o_res = await db.execute(
            select(Order).where(Order.id == p.order_id)
        )
        o = o_res.scalar_one_or_none()
        if o and o.table_id:
            t_res = await db.execute(select(Table).where(Table.id == o.table_id))
            t = t_res.scalar_one_or_none()
            table_number = t.number if t else 0

        # Who accepted payment
        accepted_by = None
        if p.paid_by_user_id:
            u_res = await db.execute(select(User).where(User.id == p.paid_by_user_id))
            u = u_res.scalar_one_or_none()
            if u:
                accepted_by = {"name": u.name, "login": u.username or ""}

        items.append({
            "id": str(p.id),
            "amount": float(p.amount),
            "method": p.method.value,
            "status": p.status.value,
            "createdAt": p.created_at.isoformat(),
            "createdBy": accepted_by,
            "order": {"id": order_id_str, "table": {"number": table_number}},
        })

    return {
        "items": items,
        "stats": {
            "total": float(total_sum),
            "today": float(today_sum),
            "last14Days": float(last14_sum),
            "paidOrders": int(paid_orders),
            "unpaidOrders": int(unpaid_orders),
        }
    }


# ─── Restaurant Tab: Feedback ─────────────────────────────────────────────────

@router.get("/restaurants/{restaurant_id}/feedback")
async def get_restaurant_feedback(
    restaurant_id: str,
    period: str | None = Query("14d"),
    status: str | None = Query(None),
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    since = _since(period)
    q = select(Feedback).where(Feedback.restaurant_id == restaurant_id)
    if since:
        q = q.where(Feedback.created_at >= since)
    if status and status not in ('ALL', None):
        try:
            min_rating = int(status)
            q = q.where(Feedback.rating == min_rating)
        except ValueError:
            if status == 'LOW':
                q = q.where(Feedback.rating <= 3)
    result = await db.execute(q.order_by(Feedback.created_at.desc()).limit(200))
    feedbacks = result.scalars().all()

    out = []
    for f in feedbacks:
        order_data = None
        if f.order_id:
            o_res = await db.execute(select(Order).where(Order.id == f.order_id))
            o = o_res.scalar_one_or_none()
            if o and o.table_id:
                t_res = await db.execute(select(Table).where(Table.id == o.table_id))
                t = t_res.scalar_one_or_none()
                order_data = {"id": str(o.id), "table": {"number": t.number if t else 0}}

        out.append({
            "id": str(f.id),
            "rating": f.rating,
            "comment": f.comment,
            "isReviewed": f.is_reviewed,
            "createdAt": f.created_at.isoformat(),
            "order": order_data,
        })
    return out


# ─── Restaurant Tab: Login History ────────────────────────────────────────────

@router.get("/restaurants/{restaurant_id}/login-history")
async def get_restaurant_login_history(
    restaurant_id: str,
    period: str | None = Query("14d"),
    status: str | None = Query(None),
    role: str | None = Query(None),
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    since = _since(period)
    q = select(ActivityLog).where(
        ActivityLog.restaurant_id == restaurant_id,
        ActivityLog.action == "login",
    )
    if since:
        q = q.where(ActivityLog.created_at >= since)
    if role and role != 'ALL':
        q = q.where(ActivityLog.role == role)
    result = await db.execute(q.order_by(ActivityLog.created_at.desc()).limit(200))
    logs = result.scalars().all()

    out = []
    for log in logs:
        user_data = None
        if log.user_id:
            u_res = await db.execute(select(User).where(User.id == log.user_id))
            u = u_res.scalar_one_or_none()
            if u:
                user_data = {
                    "id": str(u.id),
                    "name": u.name,
                    "login": u.username or "",
                    "role": u.role.value,
                    "isActive": u.is_active,
                    "createdAt": u.created_at.isoformat(),
                    "activeSessionCount": 0,
                    "loginCountLast14Days": 0,
                }
        out.append({
            "id": str(log.id),
            "sessionId": str(log.id),
            "isActive": False,
            "ipAddress": log.ip_address,
            "userAgent": log.user_agent,
            "createdAt": log.created_at.isoformat(),
            "lastSeenAt": log.created_at.isoformat(),
            "logoutAt": None,
            "revokedAt": None,
            "expiresAt": log.created_at.isoformat(),
            "status": "expired",
            "role": log.role,
            "endReason": None,
            "user": user_data,
        })
    return out


# ─── Restaurant Tab: Activity Logs ────────────────────────────────────────────

@router.get("/restaurants/{restaurant_id}/activity-logs")
async def get_restaurant_activity_logs(
    restaurant_id: str,
    period: str | None = Query("14d"),
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    since = _since(period)
    q = select(ActivityLog).where(ActivityLog.restaurant_id == restaurant_id)
    if since:
        q = q.where(ActivityLog.created_at >= since)
    result = await db.execute(q.order_by(ActivityLog.created_at.desc()).limit(200))
    logs = result.scalars().all()

    out = []
    for log in logs:
        user_data = None
        if log.user_id:
            u_res = await db.execute(select(User).where(User.id == log.user_id))
            u = u_res.scalar_one_or_none()
            if u:
                user_data = {"name": u.name, "login": u.username or "", "role": u.role.value}
        out.append({
            "id": str(log.id),
            "action": log.action,
            "entity": log.entity_type or "",
            "entityId": log.entity_id,
            "ipAddress": log.ip_address,
            "userAgent": log.user_agent,
            "createdAt": log.created_at.isoformat(),
            "user": user_data,
        })
    return out


# ─── Restaurant Tab: Subscription ────────────────────────────────────────────

@router.get("/restaurants/{restaurant_id}/subscription")
async def get_restaurant_subscription(
    restaurant_id: str,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    tariff = None
    if r.tariff_id:
        t_res = await db.execute(select(Tariff).where(Tariff.id == r.tariff_id))
        tariff = t_res.scalar_one_or_none()

    current = None
    if r.subscription_ends_at and tariff:
        current = {
            "startsAt": r.subscription_started_at.isoformat() if r.subscription_started_at else None,
            "endsAt": r.subscription_ends_at.isoformat(),
            "status": r.status.value,
            "plan": {
                "name": tariff.name,
                "limits": {
                    "tables": tariff.max_tables,
                    "staff": tariff.max_staff,
                    "dishes": tariff.max_menu_items,
                    "users": tariff.max_staff,
                }
            }
        }

    history_res = await db.execute(
        select(SubscriptionHistory)
        .where(SubscriptionHistory.restaurant_id == r.id)
        .order_by(SubscriptionHistory.created_at.desc())
        .limit(20)
    )
    history_items = history_res.scalars().all()

    history = []
    for h in history_items:
        t_name = tariff.name if tariff else "—"
        if h.tariff_id_after:
            ta_res = await db.execute(select(Tariff).where(Tariff.id == h.tariff_id_after))
            ta = ta_res.scalar_one_or_none()
            t_name = ta.name if ta else t_name
        history.append({
            "id": str(h.id),
            "startsAt": h.new_start_date.isoformat() if h.new_start_date else (r.subscription_started_at.isoformat() if r.subscription_started_at else None),
            "endsAt": h.new_end_date.isoformat() if h.new_end_date else None,
            "status": "completed",
            "plan": {"name": t_name},
        })

    return {
        "restaurantStatus": r.status.value.upper(),
        "adminLimit": r.admin_limit,
        "daysRemaining": _days_left(r.subscription_ends_at),
        "current": current,
        "history": history,
    }


# ─── Restaurant Settings ──────────────────────────────────────────────────────

@router.patch("/restaurants/{restaurant_id}/settings")
async def update_restaurant_settings(
    restaurant_id: str,
    body: RestaurantSettingsUpdate,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))
    restaurant = result.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    data = body.model_dump(exclude_unset=True)
    for field, value in data.items():
        if field == 'status' and isinstance(value, str):
            try:
                value = RestaurantStatus(value.lower())
            except ValueError:
                pass
        setattr(restaurant, field, value)

    await log_action(db, "update_restaurant_settings", user=user, entity_type="restaurant", entity_id=restaurant_id)
    await db.commit()
    await db.refresh(restaurant)
    return {"id": str(restaurant.id), "name": restaurant.name, "slug": restaurant.slug, "status": restaurant.status.value}


# ─── Activate / Block Restaurant ──────────────────────────────────────────────

@router.post("/restaurants/{restaurant_id}/activate")
@router.patch("/restaurants/{restaurant_id}/activate")
async def activate_restaurant(
    restaurant_id: str,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))
    restaurant = result.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    restaurant.status = RestaurantStatus.ACTIVE
    await log_action(db, "activate_restaurant", user=user, entity_type="restaurant", entity_id=restaurant_id, description=f"Activated: {restaurant.name}")
    await db.commit()
    await db.refresh(restaurant)
    return {"id": str(restaurant.id), "status": restaurant.status.value}


@router.post("/restaurants/{restaurant_id}/block")
@router.patch("/restaurants/{restaurant_id}/block")
async def block_restaurant(
    restaurant_id: str,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))
    restaurant = result.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    restaurant.status = RestaurantStatus.BLOCKED
    await log_action(db, "block_restaurant", user=user, entity_type="restaurant", entity_id=restaurant_id, description=f"Blocked: {restaurant.name}")
    await db.commit()
    await db.refresh(restaurant)
    return {"id": str(restaurant.id), "status": restaurant.status.value}


@router.patch("/restaurants/{restaurant_id}/unblock")
async def unblock_restaurant(
    restaurant_id: str,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))
    restaurant = result.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    restaurant.status = RestaurantStatus.ACTIVE
    await log_action(db, "unblock_restaurant", user=user, entity_type="restaurant", entity_id=restaurant_id, description=f"Unblocked: {restaurant.name}")
    await db.commit()
    await db.refresh(restaurant)
    return {"id": str(restaurant.id), "status": restaurant.status.value}


# ─── Update Restaurant (generic PATCH) ───────────────────────────────────────

@router.patch("/restaurants/{restaurant_id}", response_model=RestaurantResponse)
async def update_restaurant(
    restaurant_id: str,
    body: RestaurantUpdate,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))
    restaurant = result.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(restaurant, field, value)
    await log_action(db, "update_restaurant", user=user, entity_type="restaurant", entity_id=restaurant_id)
    await db.commit()
    await db.refresh(restaurant)
    return restaurant


# ─── Assign Tariff ────────────────────────────────────────────────────────────

@router.patch("/restaurants/{restaurant_id}/assign-tariff", response_model=RestaurantResponse)
async def assign_tariff(
    restaurant_id: str,
    body: RestaurantAssignTariff,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))
    restaurant = result.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    tariff_res = await db.execute(select(Tariff).where(Tariff.id == body.tariff_id))
    tariff = tariff_res.scalar_one_or_none()
    if not tariff:
        raise HTTPException(status_code=404, detail="Tariff not found")
    restaurant.tariff_id = body.tariff_id
    if body.subscription_ends_at:
        restaurant.subscription_ends_at = body.subscription_ends_at
    else:
        restaurant.subscription_ends_at = datetime.now(timezone.utc) + timedelta(days=tariff.period_days)
    restaurant.status = RestaurantStatus.ACTIVE
    await log_action(db, "assign_tariff", user=user, entity_type="restaurant", entity_id=restaurant_id, description=f"Assigned tariff {tariff.name} to {restaurant.name}")
    await db.commit()
    await db.refresh(restaurant)
    return restaurant


# ─── Create Admin for Restaurant ─────────────────────────────────────────────

@router.post("/restaurants/{restaurant_id}/admin", response_model=UserResponse, status_code=201)
async def create_restaurant_admin(
    restaurant_id: str,
    body: UserCreate,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Restaurant not found")
    new_user = User(
        name=body.name,
        username=body.username,
        email=body.email,
        password_hash=hash_password(body.password),
        role=UserRole.RESTAURANT_ADMIN,
        restaurant_id=restaurant_id,
    )
    db.add(new_user)
    await db.flush()
    await log_action(db, "create_staff", user=user, entity_type="user", entity_id=str(new_user.id), description=f"Created admin for restaurant {restaurant_id}")
    await db.commit()
    await db.refresh(new_user)
    return new_user


# ─── Users ────────────────────────────────────────────────────────────────────

class UserListResponse(BaseSchema):
    items: list[UserResponse]
    total: int


@router.get("/users", response_model=UserListResponse)
async def list_all_users(
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    role: str | None = Query(None),
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    q = select(User)
    if role:
        q = q.where(User.role == role)
    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar() or 0
    result = await db.execute(q.order_by(User.created_at.desc()).offset(offset).limit(limit))
    items = result.scalars().all()
    return UserListResponse(items=list(items), total=int(total))


@router.patch("/users/{user_id}/activate", response_model=UserResponse)
async def activate_user(
    user_id: str,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.is_active = True
    await db.commit()
    await db.refresh(target)
    return target


@router.patch("/users/{user_id}/deactivate", response_model=UserResponse)
async def deactivate_user(
    user_id: str,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.is_active = False
    await db.commit()
    await db.refresh(target)
    return target


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    alphabet = string.ascii_letters + string.digits
    new_password = ''.join(secrets.choice(alphabet) for _ in range(12))
    target.password_hash = hash_password(new_password)
    await log_action(db, "reset_password", user=user, entity_type="user", entity_id=user_id, description=f"Password reset for {target.name}")
    await db.commit()
    return {"password": new_password}


@router.post("/users/{user_id}/revoke-sessions")
async def revoke_user_sessions(
    user_id: str,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    await log_action(db, "revoke_sessions", user=user, entity_type="user", entity_id=user_id, description=f"Sessions revoked for {target.name}")
    await db.commit()
    return {"revoked": True}


# ─── Activity Logs (super admin global) ──────────────────────────────────────

@router.get("/activity-logs")
async def get_activity_logs(
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ActivityLog).order_by(ActivityLog.created_at.desc()).offset(offset).limit(limit)
    )
    return result.scalars().all()
