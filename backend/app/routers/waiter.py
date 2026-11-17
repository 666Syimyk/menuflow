import secrets
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from ..core.database import get_db
from ..core.dependencies import require_role
from ..models.user import User, UserRole
from ..models.order import Order, OrderItem, OrderStatus
from ..models.menu import MenuItem
from ..models.table import Table
from ..models.waiter_call import WaiterCall, WaiterCallStatus, CallType
from ..models.bill_request import BillRequest, BillRequestStatus
from ..schemas.order import OrderResponse, OrderItemInput
from ..schemas.waiter import WaiterCallResponse, WaiterCallStatusUpdate, BillRequestResponse, BillRequestStatusUpdate
from ..schemas.table import TableResponse
from ..schemas.base import BaseSchema
from ..services.activity_log_service import log_action
from ..websockets.manager import ws_manager

router = APIRouter(prefix="/waiter", tags=["Waiter"])

WAITER_ROLES = (UserRole.WAITER, UserRole.RESTAURANT_ADMIN)


class WaiterCallAdminRequest(BaseSchema):
    table_id: str | None = None


async def _get_assigned_table_ids(db: AsyncSession, user: User) -> list:
    """Returns IDs of tables assigned to this waiter. Admins see all tables."""
    if user.role == UserRole.RESTAURANT_ADMIN:
        result = await db.execute(
            select(Table.id).where(Table.restaurant_id == user.restaurant_id)
        )
    else:
        result = await db.execute(
            select(Table.id).where(
                Table.restaurant_id == user.restaurant_id,
                Table.waiter_id == user.id,
            )
        )
    return [row[0] for row in result.all()]


@router.get("/my-tables", response_model=list[TableResponse])
async def my_tables(
    user: User = Depends(require_role(*WAITER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")
    result = await db.execute(
        select(Table)
        .where(Table.restaurant_id == user.restaurant_id, Table.waiter_id == user.id)
        .options(selectinload(Table.waiter))
        .order_by(Table.number)
    )
    return result.scalars().all()


@router.get("/orders", response_model=list[OrderResponse])
async def waiter_orders(
    status: OrderStatus | None = Query(None),
    table_id: str | None = Query(None),
    user: User = Depends(require_role(*WAITER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")

    table_ids = await _get_assigned_table_ids(db, user)

    # All statuses — waiter sees full shift history
    all_statuses = [
        OrderStatus.NEW, OrderStatus.ACCEPTED, OrderStatus.COOKING,
        OrderStatus.READY, OrderStatus.SERVED, OrderStatus.PAID, OrderStatus.CANCELLED,
    ]
    statuses = [status] if status else all_statuses

    # Shift = orders created today (from midnight UTC)
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    query = select(Order).where(
        Order.restaurant_id == user.restaurant_id,
        Order.status.in_(statuses),
        Order.created_at >= today_start,
    )
    if user.role == UserRole.WAITER:
        if not table_ids:
            return []
        query = query.where(Order.table_id.in_(table_ids))

    if table_id:
        query = query.where(Order.table_id == table_id)

    result = await db.execute(query.order_by(Order.created_at.desc()))
    return result.scalars().all()


@router.get("/calls", response_model=list[WaiterCallResponse])
async def waiter_calls(
    history: bool = Query(False),
    user: User = Depends(require_role(*WAITER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")

    table_ids = await _get_assigned_table_ids(db, user)

    if history:
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        query = select(WaiterCall).where(
            WaiterCall.restaurant_id == user.restaurant_id,
            WaiterCall.status.in_([WaiterCallStatus.NEW, WaiterCallStatus.SEEN, WaiterCallStatus.COMPLETED]),
            WaiterCall.call_type == CallType.WAITER,
            WaiterCall.created_at >= today_start,
        )
    else:
        query = select(WaiterCall).where(
            WaiterCall.restaurant_id == user.restaurant_id,
            WaiterCall.status.in_([WaiterCallStatus.NEW, WaiterCallStatus.SEEN]),
            WaiterCall.call_type == CallType.WAITER,
        )

    if user.role == UserRole.WAITER:
        if not table_ids:
            return []
        query = query.where(WaiterCall.table_id.in_(table_ids))

    result = await db.execute(query.order_by(WaiterCall.created_at.desc()))
    return result.scalars().all()


@router.patch("/calls/{call_id}", response_model=WaiterCallResponse)
async def update_call(
    call_id: str,
    body: WaiterCallStatusUpdate,
    user: User = Depends(require_role(*WAITER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")
    result = await db.execute(
        select(WaiterCall).where(WaiterCall.id == call_id, WaiterCall.restaurant_id == user.restaurant_id)
    )
    call = result.scalar_one_or_none()
    if not call:
        raise HTTPException(status_code=404, detail="Waiter call not found")
    call.status = body.status
    if body.status == WaiterCallStatus.COMPLETED:
        call.completed_at = datetime.now(timezone.utc)
    await log_action(db, "update_waiter_call", user=user, entity_type="waiter_call", entity_id=call_id)
    await db.commit()
    await db.refresh(call)
    return call


@router.post("/call-admin", response_model=WaiterCallResponse, status_code=201)
async def waiter_call_admin(
    body: WaiterCallAdminRequest,
    user: User = Depends(require_role(*WAITER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """Waiter calls the admin for help (optionally specifying a table)."""
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")

    table_id = None
    if body.table_id:
        table_result = await db.execute(
            select(Table).where(Table.id == body.table_id, Table.restaurant_id == user.restaurant_id)
        )
        tbl = table_result.scalar_one_or_none()
        if not tbl:
            raise HTTPException(status_code=404, detail="Table not found")
        table_id = tbl.id

    call = WaiterCall(
        restaurant_id=user.restaurant_id,
        table_id=table_id,
        call_type=CallType.ADMIN,
    )
    db.add(call)
    await db.flush()

    await ws_manager.broadcast_to_restaurant(
        str(user.restaurant_id), "admin", "admin_call_created",
        {
            "call_id": str(call.id),
            "waiter_name": user.name,
            "table_id": str(table_id) if table_id else None,
            "from": "waiter",
        },
    )
    await db.commit()
    await db.refresh(call)
    return call


@router.get("/bill-requests", response_model=list[BillRequestResponse])
async def bill_requests(
    user: User = Depends(require_role(*WAITER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")

    table_ids = await _get_assigned_table_ids(db, user)

    query = select(BillRequest).where(
        BillRequest.restaurant_id == user.restaurant_id,
        BillRequest.status.in_([BillRequestStatus.NEW, BillRequestStatus.SEEN]),
    )
    if user.role == UserRole.WAITER:
        if not table_ids:
            return []
        query = query.where(BillRequest.table_id.in_(table_ids))

    result = await db.execute(query.order_by(BillRequest.created_at))
    return result.scalars().all()


@router.patch("/bill-requests/{req_id}", response_model=BillRequestResponse)
async def update_bill_request(
    req_id: str,
    body: BillRequestStatusUpdate,
    user: User = Depends(require_role(*WAITER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")
    result = await db.execute(
        select(BillRequest).where(BillRequest.id == req_id, BillRequest.restaurant_id == user.restaurant_id)
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Bill request not found")
    req.status = body.status
    if body.status == BillRequestStatus.COMPLETED:
        req.completed_at = datetime.now(timezone.utc)
    await log_action(db, "complete_bill_request", user=user, entity_type="bill_request", entity_id=req_id)
    await db.commit()
    await db.refresh(req)

    if body.status == BillRequestStatus.COMPLETED and req.order_id:
        order_res = await db.execute(select(Order).where(Order.id == req.order_id))
        order = order_res.scalar_one_or_none()
        if order:
            await ws_manager.broadcast_order_update(
                order.public_token, "bill_completed",
                {"billRequestId": str(req.id), "tableNumber": req.table_number},
            )

    return req


class WaiterOrderCreate(BaseSchema):
    table_id: str
    items: list[OrderItemInput]
    customer_comment: str | None = None


@router.post("/orders", response_model=OrderResponse, status_code=201)
async def create_waiter_order(
    body: WaiterOrderCreate,
    user: User = Depends(require_role(*WAITER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """Waiter places an order on behalf of a guest."""
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")

    table_result = await db.execute(
        select(Table).where(Table.id == body.table_id, Table.restaurant_id == user.restaurant_id)
    )
    table = table_result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    item_ids = [i.menu_item_id for i in body.items]
    items_result = await db.execute(
        select(MenuItem).where(
            MenuItem.id.in_(item_ids),
            MenuItem.restaurant_id == user.restaurant_id,
            MenuItem.is_available == True,
        )
    )
    db_items = {str(i.id): i for i in items_result.scalars().all()}
    if len(db_items) != len(set(str(i.menu_item_id) for i in body.items)):
        raise HTTPException(status_code=400, detail="One or more items are unavailable")

    max_num = await db.execute(
        select(func.coalesce(func.max(Order.order_number), 0)).where(Order.restaurant_id == user.restaurant_id)
    )
    order_number = max_num.scalar() + 1
    public_token = secrets.token_urlsafe(24)

    order = Order(
        restaurant_id=user.restaurant_id,
        table_id=table.id,
        order_number=order_number,
        public_token=public_token,
        customer_comment=body.customer_comment,
        total_amount=0,
    )
    db.add(order)
    await db.flush()

    total = 0.0
    for input_item in body.items:
        db_item = db_items[str(input_item.menu_item_id)]
        line_total = float(db_item.price) * input_item.quantity
        db.add(OrderItem(
            order_id=order.id,
            menu_item_id=db_item.id,
            item_name_snapshot=db_item.name,
            item_price_snapshot=float(db_item.price),
            quantity=input_item.quantity,
            comment=input_item.comment,
            total_price=line_total,
        ))
        total += line_total

    order.total_amount = total
    await db.flush()
    await db.refresh(order)

    await log_action(db, "waiter_create_order", user=user, entity_type="order", entity_id=str(order.id),
                     description=f"Waiter created order #{order_number} for table {table.number}")

    order_data = {
        "orderId": str(order.id),
        "orderNumber": order.order_number,
        "tableNumber": table.number,
        "totalAmount": total,
        "status": order.status.value,
    }
    await ws_manager.broadcast_to_restaurant(str(user.restaurant_id), "waiter", "new_order", order_data)
    await ws_manager.broadcast_to_restaurant(str(user.restaurant_id), "admin", "new_order", order_data)

    await db.commit()
    await db.refresh(order)
    return order
