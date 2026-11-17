from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..core.database import get_db
from ..core.dependencies import require_role
from ..models.user import User, UserRole
from ..models.order import Order, OrderItem, OrderStatus, PaymentStatus
from ..schemas.order import OrderResponse, OrderStatusUpdate, OrderPaymentStatusUpdate
from ..services.activity_log_service import log_action
from ..websockets.manager import ws_manager

router = APIRouter(prefix="/orders", tags=["Orders"])

STAFF_ROLES = (UserRole.RESTAURANT_ADMIN, UserRole.WAITER, UserRole.COOK, UserRole.CASHIER)

# Valid status transitions enforced on backend
VALID_TRANSITIONS: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.NEW: {OrderStatus.ACCEPTED, OrderStatus.CANCELLED},
    OrderStatus.ACCEPTED: {OrderStatus.COOKING, OrderStatus.CANCELLED},
    OrderStatus.COOKING: {OrderStatus.READY},
    OrderStatus.READY: {OrderStatus.SERVED},
    OrderStatus.SERVED: {OrderStatus.PAID},
    OrderStatus.PAID: set(),
    OrderStatus.CANCELLED: set(),
}


@router.get("", response_model=list[OrderResponse])
async def list_orders(
    status: OrderStatus | None = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    user: User = Depends(require_role(*STAFF_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")
    q = select(Order).where(Order.restaurant_id == user.restaurant_id)
    if status:
        q = q.where(Order.status == status)
    result = await db.execute(q.order_by(Order.created_at.desc()).offset(offset).limit(limit))
    return result.scalars().all()


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: str,
    user: User = Depends(require_role(*STAFF_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.restaurant_id == user.restaurant_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.patch("/{order_id}/status", response_model=OrderResponse)
async def update_order_status(
    order_id: str,
    body: OrderStatusUpdate,
    user: User = Depends(require_role(*STAFF_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.restaurant_id == user.restaurant_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if body.status not in VALID_TRANSITIONS.get(order.status, set()):
        raise HTTPException(status_code=400, detail=f"Cannot transition from {order.status} to {body.status}")
    order.status = body.status
    await log_action(db, "update_order_status", user=user, entity_type="order", entity_id=order_id, description=f"Order #{order.order_number} → {body.status}")

    # Broadcast to relevant parties — all keys in camelCase
    event_data = {"orderId": str(order.id), "orderNumber": order.order_number, "status": body.status.value}
    if body.status == OrderStatus.ACCEPTED:
        await ws_manager.broadcast_order_update(order.public_token, "order_accepted", event_data)
        await ws_manager.broadcast_to_restaurant(str(user.restaurant_id), "kitchen", "new_order", event_data)
    elif body.status == OrderStatus.COOKING:
        await ws_manager.broadcast_order_update(order.public_token, "order_cooking", event_data)
    elif body.status == OrderStatus.READY:
        await ws_manager.broadcast_to_restaurant(str(user.restaurant_id), "waiter", "order_ready", event_data)
        await ws_manager.broadcast_to_restaurant(str(user.restaurant_id), "admin", "order_ready", event_data)
        await ws_manager.broadcast_order_update(order.public_token, "order_ready", event_data)
    elif body.status == OrderStatus.SERVED:
        await ws_manager.broadcast_to_restaurant(str(user.restaurant_id), "waiter", "order_served", event_data)
        await ws_manager.broadcast_order_update(order.public_token, "order_served", event_data)
    elif body.status == OrderStatus.PAID:
        await ws_manager.broadcast_to_restaurant(str(user.restaurant_id), "waiter", "order_paid", event_data)
        await ws_manager.broadcast_to_restaurant(str(user.restaurant_id), "admin", "order_paid", event_data)
        await ws_manager.broadcast_order_update(order.public_token, "order_paid", event_data)
    elif body.status == OrderStatus.CANCELLED:
        await ws_manager.broadcast_to_restaurant(str(user.restaurant_id), "waiter", "order_cancelled", event_data)
        await ws_manager.broadcast_to_restaurant(str(user.restaurant_id), "admin", "order_cancelled", event_data)
        await ws_manager.broadcast_to_restaurant(str(user.restaurant_id), "kitchen", "order_cancelled", event_data)
        await ws_manager.broadcast_order_update(order.public_token, "order_cancelled", event_data)

    await db.commit()
    await db.refresh(order)
    return order


@router.patch("/{order_id}/items/{item_id}/cancel", response_model=OrderResponse)
async def cancel_order_item(
    order_id: str,
    item_id: str,
    user: User = Depends(require_role(UserRole.RESTAURANT_ADMIN, UserRole.WAITER)),
    db: AsyncSession = Depends(get_db),
):
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")

    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.restaurant_id == user.restaurant_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status not in (OrderStatus.NEW, OrderStatus.ACCEPTED):
        raise HTTPException(status_code=400, detail="Can only cancel items from new/accepted orders")

    item_result = await db.execute(
        select(OrderItem).where(OrderItem.id == item_id, OrderItem.order_id == order_id)
    )
    item = item_result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.is_cancelled:
        raise HTTPException(status_code=400, detail="Item already cancelled")

    if item.quantity > 1:
        item.quantity -= 1
        item.total_price = float(item.item_price_snapshot) * item.quantity
    else:
        item.is_cancelled = True

    order.total_amount = sum(float(i.total_price) for i in order.items if not i.is_cancelled)

    await log_action(db, "waiter_cancel_item", user=user, entity_type="order", entity_id=order_id,
                     description=f"Removed 1× '{item.item_name_snapshot}' from order #{order.order_number}")

    event_data = {
        "orderId": str(order.id),
        "orderNumber": order.order_number,
        "itemId": str(item.id),
        "itemName": item.item_name_snapshot,
        "totalAmount": float(order.total_amount),
    }

    all_cancelled = all(i.is_cancelled for i in order.items)
    if all_cancelled:
        order.status = OrderStatus.CANCELLED
        cancel_data = {"orderId": str(order.id), "orderNumber": order.order_number, "status": "cancelled"}
        await ws_manager.broadcast_to_restaurant(str(user.restaurant_id), "kitchen", "order_cancelled", cancel_data)
        await ws_manager.broadcast_to_restaurant(str(user.restaurant_id), "admin", "order_cancelled", cancel_data)
        await ws_manager.broadcast_order_update(order.public_token, "order_cancelled", cancel_data)
    else:
        await ws_manager.broadcast_to_restaurant(str(user.restaurant_id), "kitchen", "order_item_cancelled", event_data)
        await ws_manager.broadcast_to_restaurant(str(user.restaurant_id), "admin", "order_item_cancelled", event_data)

    await db.commit()
    await db.refresh(order)
    return order


@router.patch("/{order_id}/payment-status", response_model=OrderResponse)
async def update_payment_status(
    order_id: str,
    body: OrderPaymentStatusUpdate,
    user: User = Depends(require_role(UserRole.RESTAURANT_ADMIN, UserRole.CASHIER)),
    db: AsyncSession = Depends(get_db),
):
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.restaurant_id == user.restaurant_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order.payment_status = body.payment_status
    if body.payment_status == PaymentStatus.PAID:
        order.status = OrderStatus.PAID
    await log_action(db, "update_payment_status", user=user, entity_type="order", entity_id=order_id, description=f"Payment status → {body.payment_status}")
    await db.commit()
    await db.refresh(order)
    return order
