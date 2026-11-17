from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, cast, Integer
from ..core.database import get_db
from ..core.dependencies import require_role
from ..core.security import hash_password
from ..models.user import User, UserRole
from ..models.restaurant import Restaurant
from ..models.order import Order, OrderStatus
from ..models.table import Table
from ..models.waiter_call import WaiterCall, WaiterCallStatus, CallType
from ..schemas.restaurant import RestaurantUpdate, RestaurantResponse
from ..schemas.user import StaffCreate, StaffUpdate, UserResponse
from ..schemas.waiter import WaiterCallResponse, WaiterCallStatusUpdate
from ..schemas.base import BaseSchema
from ..services.activity_log_service import log_action
from ..services.upload_service import save_upload


class DashboardResponse(BaseSchema):
    today_orders: int
    active_orders: int
    total_revenue: float
    active_tables: int
    hourly_activity: list[int]

router = APIRouter(prefix="/admin", tags=["Restaurant Admin"])


def _check_owns_restaurant(user: User) -> None:
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")


@router.get("/dashboard", response_model=DashboardResponse)
async def admin_dashboard(
    user: User = Depends(require_role(UserRole.RESTAURANT_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    _check_owns_restaurant(user)
    rid = user.restaurant_id
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    today_orders = (await db.execute(
        select(func.count(Order.id)).where(
            Order.restaurant_id == rid,
            Order.created_at >= today_start,
        )
    )).scalar() or 0
    active_orders = (await db.execute(
        select(func.count(Order.id)).where(
            Order.restaurant_id == rid,
            Order.status.notin_([OrderStatus.PAID, OrderStatus.CANCELLED])
        )
    )).scalar() or 0
    total_revenue = (await db.execute(
        select(func.coalesce(func.sum(Order.total_amount), 0)).where(
            Order.restaurant_id == rid,
            Order.status == OrderStatus.PAID,
            Order.created_at >= today_start,
        )
    )).scalar() or 0
    active_tables = (await db.execute(
        select(func.count(Table.id)).where(
            Table.restaurant_id == rid,
            Table.is_active == True
        )
    )).scalar() or 0

    hourly_result = await db.execute(
        select(
            cast(func.extract("hour", Order.created_at), Integer).label("hour"),
            func.count(Order.id).label("cnt"),
        )
        .where(
            Order.restaurant_id == rid,
            Order.created_at >= today_start,
            Order.status != OrderStatus.CANCELLED,
        )
        .group_by("hour")
        .order_by("hour")
    )
    hourly_map = {row.hour: row.cnt for row in hourly_result.all()}
    hourly_activity = [hourly_map.get(h, 0) for h in range(24)]

    return DashboardResponse(
        today_orders=int(today_orders),
        active_orders=int(active_orders),
        total_revenue=float(total_revenue),
        active_tables=int(active_tables),
        hourly_activity=hourly_activity,
    )


@router.get("/restaurant", response_model=RestaurantResponse)
async def get_my_restaurant(
    user: User = Depends(require_role(UserRole.RESTAURANT_ADMIN, UserRole.WAITER, UserRole.COOK, UserRole.CASHIER)),
    db: AsyncSession = Depends(get_db),
):
    _check_owns_restaurant(user)
    result = await db.execute(select(Restaurant).where(Restaurant.id == user.restaurant_id))
    restaurant = result.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return restaurant


@router.patch("/restaurant", response_model=RestaurantResponse)
async def update_my_restaurant(
    body: RestaurantUpdate,
    user: User = Depends(require_role(UserRole.RESTAURANT_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    _check_owns_restaurant(user)
    result = await db.execute(select(Restaurant).where(Restaurant.id == user.restaurant_id))
    restaurant = result.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(restaurant, field, value)
    await log_action(db, "update_restaurant", user=user, description="Admin updated restaurant profile")
    await db.commit()
    await db.refresh(restaurant)
    return restaurant


@router.get("/staff", response_model=list[UserResponse])
async def list_staff(
    user: User = Depends(require_role(UserRole.RESTAURANT_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    _check_owns_restaurant(user)
    result = await db.execute(
        select(User).where(
            User.restaurant_id == user.restaurant_id,
            User.role.in_([UserRole.WAITER, UserRole.COOK, UserRole.CASHIER])
        )
    )
    return result.scalars().all()


@router.post("/staff", response_model=UserResponse, status_code=201)
async def create_staff(
    body: StaffCreate,
    user: User = Depends(require_role(UserRole.RESTAURANT_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    _check_owns_restaurant(user)
    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already taken")
    new_user = User(
        name=body.name,
        username=body.username,
        password_hash=hash_password(body.password),
        role=body.role,
        restaurant_id=user.restaurant_id,
    )
    db.add(new_user)
    await db.flush()
    await log_action(db, "create_staff", user=user, entity_type="user", entity_id=str(new_user.id), description=f"Created {body.role} staff: {body.name}")
    await db.commit()
    await db.refresh(new_user)
    return new_user


@router.patch("/staff/{user_id}", response_model=UserResponse)
async def update_staff(
    user_id: str,
    body: StaffUpdate,
    user: User = Depends(require_role(UserRole.RESTAURANT_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    _check_owns_restaurant(user)
    result = await db.execute(
        select(User).where(User.id == user_id, User.restaurant_id == user.restaurant_id)
    )
    staff = result.scalar_one_or_none()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
    updates = body.model_dump(exclude_unset=True)
    if "password" in updates:
        staff.password_hash = hash_password(updates.pop("password"))
    for field, value in updates.items():
        setattr(staff, field, value)
    await log_action(db, "update_staff", user=user, entity_type="user", entity_id=user_id)
    await db.commit()
    await db.refresh(staff)
    return staff


@router.delete("/staff/{user_id}", status_code=204)
async def delete_staff(
    user_id: str,
    user: User = Depends(require_role(UserRole.RESTAURANT_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    _check_owns_restaurant(user)
    result = await db.execute(
        select(User).where(User.id == user_id, User.restaurant_id == user.restaurant_id)
    )
    staff = result.scalar_one_or_none()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
    await db.delete(staff)
    await log_action(db, "delete_staff", user=user, entity_type="user", entity_id=user_id)
    await db.commit()


@router.post("/staff/{user_id}/avatar", response_model=UserResponse)
async def upload_staff_avatar(
    user_id: str,
    file: UploadFile = File(...),
    user: User = Depends(require_role(UserRole.RESTAURANT_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    _check_owns_restaurant(user)
    result = await db.execute(
        select(User).where(User.id == user_id, User.restaurant_id == user.restaurant_id)
    )
    staff = result.scalar_one_or_none()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
    url = await save_upload(file, subfolder="avatars")
    staff.avatar_url = url
    await db.commit()
    await db.refresh(staff)
    return staff


@router.get("/calls", response_model=list[WaiterCallResponse])
async def admin_calls(
    user: User = Depends(require_role(UserRole.RESTAURANT_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Returns pending calls directed to the admin (from guests or waiters)."""
    _check_owns_restaurant(user)
    result = await db.execute(
        select(WaiterCall).where(
            WaiterCall.restaurant_id == user.restaurant_id,
            WaiterCall.call_type == CallType.ADMIN,
            WaiterCall.status.in_([WaiterCallStatus.NEW, WaiterCallStatus.SEEN]),
        ).order_by(WaiterCall.created_at)
    )
    return result.scalars().all()


@router.patch("/calls/{call_id}", response_model=WaiterCallResponse)
async def resolve_admin_call(
    call_id: str,
    body: WaiterCallStatusUpdate,
    user: User = Depends(require_role(UserRole.RESTAURANT_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    _check_owns_restaurant(user)
    result = await db.execute(
        select(WaiterCall).where(
            WaiterCall.id == call_id,
            WaiterCall.restaurant_id == user.restaurant_id,
            WaiterCall.call_type == CallType.ADMIN,
        )
    )
    call = result.scalar_one_or_none()
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    call.status = body.status
    if body.status == WaiterCallStatus.COMPLETED:
        call.completed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(call)
    return call
