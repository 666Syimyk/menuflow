from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from ..core.database import get_db
from ..core.dependencies import require_role
from ..models.user import User, UserRole
from ..models.order import Order, OrderStatus, PaymentStatus
from ..models.payment import Payment, PaymentMethod, PaymentRecordStatus
from ..schemas.payment import PaymentCreate, PaymentResponse
from ..schemas.base import BaseSchema
from ..services.activity_log_service import log_action
from ..websockets.manager import ws_manager

router = APIRouter(prefix="/payments", tags=["Payments"])

PAYMENT_ROLES = (UserRole.RESTAURANT_ADMIN, UserRole.CASHIER, UserRole.WAITER)


class DailyReportResponse(BaseSchema):
    total: float
    count: int
    by_method: dict[str, float]
    payments: list[PaymentResponse]


@router.get("/daily", response_model=DailyReportResponse)
async def daily_report(
    date_str: str | None = Query(None, alias="date", description="YYYY-MM-DD, defaults to today"),
    user: User = Depends(require_role(*PAYMENT_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")
    try:
        target_date = date.fromisoformat(date_str) if date_str else date.today()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, expected YYYY-MM-DD")

    day_start = datetime(target_date.year, target_date.month, target_date.day, tzinfo=timezone.utc)
    day_end = datetime(target_date.year, target_date.month, target_date.day, 23, 59, 59, tzinfo=timezone.utc)

    result = await db.execute(
        select(Payment)
        .where(
            Payment.restaurant_id == user.restaurant_id,
            Payment.created_at >= day_start,
            Payment.created_at <= day_end,
        )
        .order_by(Payment.created_at.desc())
    )
    payments = result.scalars().all()

    total = sum(float(p.amount) for p in payments)
    by_method: dict[str, float] = {}
    for p in payments:
        key = p.method.value if hasattr(p.method, "value") else str(p.method)
        by_method[key] = by_method.get(key, 0.0) + float(p.amount)

    return DailyReportResponse(
        total=total,
        count=len(payments),
        by_method=by_method,
        payments=list(payments),
    )


@router.get("", response_model=list[PaymentResponse])
async def list_payments(
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    user: User = Depends(require_role(*PAYMENT_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")
    result = await db.execute(
        select(Payment)
        .where(Payment.restaurant_id == user.restaurant_id)
        .order_by(Payment.created_at.desc())
        .offset(offset).limit(limit)
    )
    return result.scalars().all()


@router.post("", response_model=PaymentResponse, status_code=201)
async def record_payment(
    body: PaymentCreate,
    user: User = Depends(require_role(*PAYMENT_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")
    order_result = await db.execute(
        select(Order).where(Order.id == body.order_id, Order.restaurant_id == user.restaurant_id)
    )
    order = order_result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    payment = Payment(
        restaurant_id=user.restaurant_id,
        order_id=order.id,
        amount=body.amount,
        method=body.method,
        status=PaymentRecordStatus.PAID,
        paid_by_user_id=user.id,
    )
    db.add(payment)
    order.payment_status = PaymentStatus.PAID
    order.status = OrderStatus.PAID
    await log_action(db, "record_payment", user=user, entity_type="payment", description=f"Payment {body.amount} for order #{order.order_number}")
    paid_event = {"orderId": str(order.id), "orderNumber": order.order_number, "status": "paid"}
    await ws_manager.broadcast_to_restaurant(str(user.restaurant_id), "waiter", "order_paid", paid_event)
    await ws_manager.broadcast_to_restaurant(str(user.restaurant_id), "admin", "order_paid", paid_event)
    await ws_manager.broadcast_order_update(order.public_token, "order_paid", paid_event)
    await db.commit()
    await db.refresh(payment)
    return payment
