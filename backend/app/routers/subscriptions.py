"""
Super Admin subscription management endpoints.
All endpoints require SUPER_ADMIN role.
"""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from ..core.database import get_db
from ..core.dependencies import require_role
from ..models.user import User, UserRole
from ..models.restaurant import Restaurant, RestaurantStatus
from ..models.tariff import Tariff
from ..models.subscription import (
    SubscriptionHistory, SubscriptionPayment,
    SubscriptionAction, SubscriptionPaymentStatus,
)
from ..schemas.subscriptions import (
    SubscriptionSummary, SubscriptionDetail,
    ExtendSubscriptionRequest, ReduceSubscriptionRequest,
    SetExpiryRequest, ChangeTariffRequest, AddPaymentRequest,
    SubscriptionHistoryResponse, SubscriptionPaymentResponse,
)
from ..services.activity_log_service import log_action

router = APIRouter(prefix="/super/subscriptions", tags=["Subscriptions"])


def _days_left(ends_at: datetime | None) -> int | None:
    if ends_at is None:
        return None
    diff = ends_at.replace(tzinfo=timezone.utc) - datetime.now(timezone.utc)
    return int(diff.total_seconds() // 86400)


async def _get_subscription_summary(restaurant: Restaurant, db: AsyncSession) -> dict:
    """Build a subscription summary dict for a restaurant."""
    tariff = None
    if restaurant.tariff_id:
        t_res = await db.execute(select(Tariff).where(Tariff.id == restaurant.tariff_id))
        tariff = t_res.scalar_one_or_none()

    # Last payment
    last_pay = await db.execute(
        select(SubscriptionPayment)
        .where(SubscriptionPayment.restaurant_id == restaurant.id)
        .order_by(SubscriptionPayment.created_at.desc())
        .limit(1)
    )
    last_payment = last_pay.scalar_one_or_none()

    # Last extension
    last_ext = await db.execute(
        select(SubscriptionHistory)
        .where(
            SubscriptionHistory.restaurant_id == restaurant.id,
            SubscriptionHistory.action == SubscriptionAction.EXTENDED,
        )
        .order_by(SubscriptionHistory.created_at.desc())
        .limit(1)
    )
    last_extension = last_ext.scalar_one_or_none()

    last_extended_by = None
    if last_extension and last_extension.changed_by_user_id:
        u_res = await db.execute(select(User).where(User.id == last_extension.changed_by_user_id))
        u = u_res.scalar_one_or_none()
        last_extended_by = u.name if u else None

    return {
        "restaurant_id": restaurant.id,
        "restaurant_name": restaurant.name,
        "restaurant_slug": restaurant.slug,
        "restaurant_status": restaurant.status.value,
        "tariff_id": restaurant.tariff_id,
        "tariff_name": tariff.name if tariff else None,
        "tariff_price": float(tariff.price) if tariff else None,
        "subscription_started_at": restaurant.subscription_started_at,
        "subscription_ends_at": restaurant.subscription_ends_at,
        "days_left": _days_left(restaurant.subscription_ends_at),
        "last_payment_at": last_payment.created_at if last_payment else None,
        "last_extension_at": last_extension.created_at if last_extension else None,
        "last_extended_by": last_extended_by,
        "tariff_max_tables": tariff.max_tables if tariff else None,
        "tariff_max_staff": tariff.max_staff if tariff else None,
        "tariff_max_menu_items": tariff.max_menu_items if tariff else None,
        "tariff_analytics_enabled": tariff.analytics_enabled if tariff else None,
        "tariff_feedback_enabled": tariff.feedback_enabled if tariff else None,
        "tariff_branding_enabled": tariff.branding_enabled if tariff else None,
    }


def _compute_new_end_date(current_ends_at: datetime | None, days: int) -> datetime:
    """Extend from current end date (if in future) or from today."""
    now = datetime.now(timezone.utc)
    if current_ends_at:
        base = current_ends_at.replace(tzinfo=timezone.utc) if current_ends_at.tzinfo is None else current_ends_at
        base = max(base, now)
    else:
        base = now
    return base + timedelta(days=days)


def _record_history(
    db: AsyncSession,
    restaurant: Restaurant,
    action: SubscriptionAction,
    user: User,
    old_end_date: datetime | None = None,
    new_end_date: datetime | None = None,
    tariff_id_before: str | None = None,
    tariff_id_after: str | None = None,
    days_delta: int | None = None,
    payment_amount: float | None = None,
    payment_currency: str | None = None,
    payment_method: str | None = None,
    payment_status: str | None = None,
    transaction_reference: str | None = None,
    comment: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> SubscriptionHistory:
    entry = SubscriptionHistory(
        restaurant_id=restaurant.id,
        tariff_id_before=tariff_id_before,
        tariff_id_after=tariff_id_after,
        action=action,
        old_end_date=old_end_date,
        new_end_date=new_end_date,
        days_delta=days_delta,
        payment_amount=payment_amount,
        payment_currency=payment_currency,
        payment_method=payment_method,
        payment_status=payment_status,
        transaction_reference=transaction_reference,
        comment=comment,
        changed_by_user_id=user.id,
        changed_by_role=user.role.value,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(entry)
    return entry


# =====================
# LIST SUBSCRIPTIONS
# =====================

@router.get("", response_model=list[SubscriptionSummary])
async def list_subscriptions(
    status: str | None = Query(None),
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    q = select(Restaurant)
    if status:
        try:
            q = q.where(Restaurant.status == RestaurantStatus(status))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
    result = await db.execute(q.order_by(Restaurant.created_at.desc()))
    restaurants = result.scalars().all()

    summaries = []
    for r in restaurants:
        summaries.append(await _get_subscription_summary(r, db))
    return summaries


# =====================
# DETAIL
# =====================

@router.get("/{restaurant_id}", response_model=SubscriptionDetail)
async def get_subscription_detail(
    restaurant_id: str,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))
    restaurant = res.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return await _get_subscription_summary(restaurant, db)


# =====================
# HISTORY
# =====================

@router.get("/{restaurant_id}/history", response_model=list[SubscriptionHistoryResponse])
async def get_subscription_history(
    restaurant_id: str,
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Restaurant not found")

    history_res = await db.execute(
        select(SubscriptionHistory)
        .where(SubscriptionHistory.restaurant_id == restaurant_id)
        .order_by(SubscriptionHistory.created_at.desc())
        .offset(offset).limit(limit)
    )
    history_items = history_res.scalars().all()

    # Enrich with tariff names and user name
    result = []
    for h in history_items:
        tariff_before_name = None
        tariff_after_name = None
        if h.tariff_id_before:
            t = await db.execute(select(Tariff).where(Tariff.id == h.tariff_id_before))
            tb = t.scalar_one_or_none()
            tariff_before_name = tb.name if tb else None
        if h.tariff_id_after:
            t = await db.execute(select(Tariff).where(Tariff.id == h.tariff_id_after))
            ta = t.scalar_one_or_none()
            tariff_after_name = ta.name if ta else None
        changed_by_name = None
        if h.changed_by_user_id:
            u = await db.execute(select(User).where(User.id == h.changed_by_user_id))
            u_obj = u.scalar_one_or_none()
            changed_by_name = u_obj.name if u_obj else None
        result.append(SubscriptionHistoryResponse(
            id=h.id,
            restaurant_id=h.restaurant_id,
            action=h.action.value,
            tariff_before=tariff_before_name,
            tariff_after=tariff_after_name,
            old_end_date=h.old_end_date,
            new_end_date=h.new_end_date,
            days_delta=h.days_delta,
            payment_amount=float(h.payment_amount) if h.payment_amount else None,
            payment_currency=h.payment_currency,
            payment_method=h.payment_method,
            payment_status=h.payment_status,
            transaction_reference=h.transaction_reference,
            comment=h.comment,
            changed_by_name=changed_by_name,
            changed_by_role=h.changed_by_role,
            ip_address=h.ip_address,
            created_at=h.created_at,
        ))
    return result


# =====================
# PAYMENTS
# =====================

@router.get("/{restaurant_id}/payments", response_model=list[SubscriptionPaymentResponse])
async def get_subscription_payments(
    restaurant_id: str,
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Restaurant not found")

    pay_res = await db.execute(
        select(SubscriptionPayment)
        .where(SubscriptionPayment.restaurant_id == restaurant_id)
        .order_by(SubscriptionPayment.created_at.desc())
        .offset(offset).limit(limit)
    )
    payments = pay_res.scalars().all()

    result = []
    for p in payments:
        tariff_name = None
        if p.tariff_id:
            t = await db.execute(select(Tariff).where(Tariff.id == p.tariff_id))
            tb = t.scalar_one_or_none()
            tariff_name = tb.name if tb else None
        accepted_by_name = None
        if p.accepted_by_user_id:
            u = await db.execute(select(User).where(User.id == p.accepted_by_user_id))
            u_obj = u.scalar_one_or_none()
            accepted_by_name = u_obj.name if u_obj else None
        result.append(SubscriptionPaymentResponse(
            id=p.id,
            restaurant_id=p.restaurant_id,
            tariff_name=tariff_name,
            amount=float(p.amount),
            currency=p.currency,
            payment_method=p.payment_method,
            payment_status=p.payment_status,
            paid_days=p.paid_days,
            paid_from=p.paid_from,
            paid_until=p.paid_until,
            transaction_reference=p.transaction_reference,
            comment=p.comment,
            accepted_by_name=accepted_by_name,
            created_at=p.created_at,
            paid_at=p.paid_at,
        ))
    return result


# =====================
# EXTEND
# =====================

@router.post("/{restaurant_id}/extend", response_model=SubscriptionDetail)
async def extend_subscription(
    restaurant_id: str,
    body: ExtendSubscriptionRequest,
    request: Request,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))
    restaurant = res.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    old_end_date = restaurant.subscription_ends_at
    new_end_date = _compute_new_end_date(old_end_date, body.days)

    restaurant.subscription_ends_at = new_end_date
    restaurant.last_subscription_change_at = datetime.now(timezone.utc)
    if restaurant.subscription_started_at is None:
        restaurant.subscription_started_at = datetime.now(timezone.utc)

    # Activate if requested and restaurant is blocked
    if body.activate_if_blocked and restaurant.status == RestaurantStatus.BLOCKED:
        restaurant.status = RestaurantStatus.ACTIVE
    elif restaurant.status in (RestaurantStatus.EXPIRED, RestaurantStatus.TRIAL):
        restaurant.status = RestaurantStatus.ACTIVE

    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    _record_history(
        db, restaurant,
        action=SubscriptionAction.EXTENDED,
        user=user,
        old_end_date=old_end_date,
        new_end_date=new_end_date,
        tariff_id_before=str(restaurant.tariff_id) if restaurant.tariff_id else None,
        tariff_id_after=str(restaurant.tariff_id) if restaurant.tariff_id else None,
        days_delta=body.days,
        payment_amount=body.amount,
        payment_currency=body.currency if body.amount else None,
        payment_method=body.payment_method if body.amount else None,
        payment_status=body.payment_status if body.amount else None,
        transaction_reference=body.transaction_reference,
        comment=body.comment,
        ip_address=ip,
        user_agent=ua,
    )

    # Record payment if amount provided
    if body.amount:
        payment = SubscriptionPayment(
            restaurant_id=restaurant.id,
            tariff_id=restaurant.tariff_id,
            amount=body.amount,
            currency=body.currency,
            payment_method=body.payment_method or "cash",
            payment_status=body.payment_status or "paid",
            paid_days=body.days,
            paid_from=old_end_date or datetime.now(timezone.utc),
            paid_until=new_end_date,
            transaction_reference=body.transaction_reference,
            comment=body.comment,
            accepted_by_user_id=user.id,
            paid_at=datetime.now(timezone.utc),
        )
        db.add(payment)

    await log_action(
        db, "subscription_extended", user=user,
        restaurant_id=restaurant.id,
        entity_type="restaurant", entity_id=str(restaurant.id),
        description=f"Subscription extended by {body.days} days for {restaurant.name}. New end: {new_end_date.date()}",
        ip_address=ip, user_agent=ua,
    )
    await db.commit()
    return await _get_subscription_summary(restaurant, db)


# =====================
# REDUCE
# =====================

@router.post("/{restaurant_id}/reduce", response_model=SubscriptionDetail)
async def reduce_subscription(
    restaurant_id: str,
    body: ReduceSubscriptionRequest,
    request: Request,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))
    restaurant = res.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    if not restaurant.subscription_ends_at:
        raise HTTPException(status_code=400, detail="No active subscription to reduce")

    old_end_date = restaurant.subscription_ends_at
    ends_at_aware = old_end_date.replace(tzinfo=timezone.utc) if old_end_date.tzinfo is None else old_end_date
    new_end_date = ends_at_aware - timedelta(days=body.days)

    restaurant.subscription_ends_at = new_end_date
    restaurant.last_subscription_change_at = datetime.now(timezone.utc)

    # If new end date is in the past, mark as expired
    if new_end_date < datetime.now(timezone.utc):
        restaurant.status = RestaurantStatus.EXPIRED

    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    _record_history(
        db, restaurant,
        action=SubscriptionAction.REDUCED,
        user=user,
        old_end_date=old_end_date,
        new_end_date=new_end_date,
        days_delta=-body.days,
        comment=body.comment,
        ip_address=ip,
        user_agent=ua,
    )

    await log_action(
        db, "subscription_reduced", user=user,
        restaurant_id=restaurant.id,
        entity_type="restaurant", entity_id=str(restaurant.id),
        description=f"Subscription reduced by {body.days} days for {restaurant.name}. Reason: {body.comment}",
        ip_address=ip, user_agent=ua,
    )
    await db.commit()
    return await _get_subscription_summary(restaurant, db)


# =====================
# SET EXPIRY DATE
# =====================

@router.patch("/{restaurant_id}/set-expiry", response_model=SubscriptionDetail)
async def set_subscription_expiry(
    restaurant_id: str,
    body: SetExpiryRequest,
    request: Request,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))
    restaurant = res.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    old_end_date = restaurant.subscription_ends_at
    new_end_date = body.subscription_ends_at
    if new_end_date.tzinfo is None:
        new_end_date = new_end_date.replace(tzinfo=timezone.utc)

    now = datetime.now(timezone.utc)
    if new_end_date >= now:
        if body.activate_if_blocked or restaurant.status != RestaurantStatus.BLOCKED:
            restaurant.status = RestaurantStatus.ACTIVE
    else:
        restaurant.status = RestaurantStatus.EXPIRED

    restaurant.subscription_ends_at = new_end_date
    restaurant.last_subscription_change_at = now
    if restaurant.subscription_started_at is None:
        restaurant.subscription_started_at = now

    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    _record_history(
        db, restaurant,
        action=SubscriptionAction.SET_EXPIRY_DATE,
        user=user,
        old_end_date=old_end_date,
        new_end_date=new_end_date,
        comment=body.comment,
        ip_address=ip,
        user_agent=ua,
    )

    await log_action(
        db, "subscription_expiry_set", user=user,
        restaurant_id=restaurant.id,
        entity_type="restaurant", entity_id=str(restaurant.id),
        description=f"Subscription expiry set to {new_end_date.date()} for {restaurant.name}",
        ip_address=ip, user_agent=ua,
    )
    await db.commit()
    return await _get_subscription_summary(restaurant, db)


# =====================
# CHANGE TARIFF
# =====================

@router.patch("/{restaurant_id}/change-tariff", response_model=SubscriptionDetail)
async def change_subscription_tariff(
    restaurant_id: str,
    body: ChangeTariffRequest,
    request: Request,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))
    restaurant = res.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    tariff_res = await db.execute(select(Tariff).where(Tariff.id == body.tariff_id))
    tariff = tariff_res.scalar_one_or_none()
    if not tariff:
        raise HTTPException(status_code=404, detail="Tariff not found")

    old_tariff_id = restaurant.tariff_id
    restaurant.tariff_id = tariff.id
    restaurant.last_subscription_change_at = datetime.now(timezone.utc)

    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    _record_history(
        db, restaurant,
        action=SubscriptionAction.TARIFF_CHANGED,
        user=user,
        old_end_date=restaurant.subscription_ends_at,
        new_end_date=restaurant.subscription_ends_at,
        tariff_id_before=str(old_tariff_id) if old_tariff_id else None,
        tariff_id_after=str(tariff.id),
        comment=body.comment,
        ip_address=ip,
        user_agent=ua,
    )

    await log_action(
        db, "subscription_tariff_changed", user=user,
        restaurant_id=restaurant.id,
        entity_type="restaurant", entity_id=str(restaurant.id),
        description=f"Tariff changed to {tariff.name} for {restaurant.name}",
        ip_address=ip, user_agent=ua,
    )
    await db.commit()
    return await _get_subscription_summary(restaurant, db)


# =====================
# ADD PAYMENT
# =====================

@router.post("/{restaurant_id}/payments", response_model=SubscriptionPaymentResponse)
async def add_subscription_payment(
    restaurant_id: str,
    body: AddPaymentRequest,
    request: Request,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))
    restaurant = res.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    now = datetime.now(timezone.utc)
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    paid_until = None
    if body.extend_subscription and body.paid_days:
        old_end = restaurant.subscription_ends_at
        new_end = _compute_new_end_date(old_end, body.paid_days)
        restaurant.subscription_ends_at = new_end
        restaurant.last_subscription_change_at = now
        if restaurant.subscription_started_at is None:
            restaurant.subscription_started_at = now
        if restaurant.status in (RestaurantStatus.EXPIRED, RestaurantStatus.TRIAL):
            restaurant.status = RestaurantStatus.ACTIVE
        paid_until = new_end
        _record_history(
            db, restaurant,
            action=SubscriptionAction.EXTENDED,
            user=user,
            old_end_date=old_end,
            new_end_date=new_end,
            days_delta=body.paid_days,
            payment_amount=body.amount,
            payment_currency=body.currency,
            payment_method=body.payment_method,
            payment_status=body.payment_status,
            transaction_reference=body.transaction_reference,
            comment=body.comment,
            ip_address=ip,
            user_agent=ua,
        )

    payment = SubscriptionPayment(
        restaurant_id=restaurant.id,
        tariff_id=restaurant.tariff_id,
        amount=body.amount,
        currency=body.currency,
        payment_method=body.payment_method,
        payment_status=body.payment_status,
        paid_days=body.paid_days,
        paid_from=restaurant.subscription_ends_at if not body.extend_subscription else None,
        paid_until=paid_until,
        transaction_reference=body.transaction_reference,
        comment=body.comment,
        accepted_by_user_id=user.id,
        paid_at=now if body.payment_status == "paid" else None,
    )
    db.add(payment)
    await db.flush()

    await log_action(
        db, "subscription_payment_added", user=user,
        restaurant_id=restaurant.id,
        entity_type="subscription_payment", entity_id=str(payment.id),
        description=f"Payment {body.amount} {body.currency} added for {restaurant.name}",
        ip_address=ip, user_agent=ua,
    )

    # Enrich response
    tariff_name = None
    if restaurant.tariff_id:
        t = await db.execute(select(Tariff).where(Tariff.id == restaurant.tariff_id))
        tb = t.scalar_one_or_none()
        tariff_name = tb.name if tb else None

    await db.commit()

    return SubscriptionPaymentResponse(
        id=payment.id,
        restaurant_id=payment.restaurant_id,
        tariff_name=tariff_name,
        amount=float(payment.amount),
        currency=payment.currency,
        payment_method=payment.payment_method,
        payment_status=payment.payment_status,
        paid_days=payment.paid_days,
        paid_from=payment.paid_from,
        paid_until=payment.paid_until,
        transaction_reference=payment.transaction_reference,
        comment=payment.comment,
        accepted_by_name=user.name,
        created_at=payment.created_at,
        paid_at=payment.paid_at,
    )
