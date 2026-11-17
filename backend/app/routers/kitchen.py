from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..core.database import get_db
from ..core.dependencies import require_role
from ..models.user import User, UserRole
from ..models.order import Order, OrderItem, OrderStatus
from ..schemas.order import OrderResponse, OrderStatusUpdate
from ..services.activity_log_service import log_action
from ..websockets.manager import ws_manager

router = APIRouter(prefix="/kitchen", tags=["Kitchen"])

# Kitchen only sees orders the waiter has already accepted
KITCHEN_STATUSES = [OrderStatus.ACCEPTED, OrderStatus.COOKING, OrderStatus.READY]

COOK_TRANSITIONS = {
    OrderStatus.ACCEPTED: {OrderStatus.COOKING, OrderStatus.CANCELLED},
    OrderStatus.COOKING: {OrderStatus.READY, OrderStatus.CANCELLED},
}


@router.get("/orders", response_model=list[OrderResponse])
async def kitchen_orders(
    status: OrderStatus | None = Query(None),
    user: User = Depends(require_role(UserRole.COOK, UserRole.RESTAURANT_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")
    statuses = [status] if status else KITCHEN_STATUSES
    result = await db.execute(
        select(Order)
        .where(Order.restaurant_id == user.restaurant_id, Order.status.in_(statuses))
        .order_by(Order.created_at)
    )
    return result.scalars().all()


@router.patch("/orders/{order_id}/status", response_model=OrderResponse)
async def kitchen_update_status(
    order_id: str,
    body: OrderStatusUpdate,
    user: User = Depends(require_role(UserRole.COOK, UserRole.RESTAURANT_ADMIN)),
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
    allowed = COOK_TRANSITIONS.get(order.status, set())
    if body.status not in allowed:
        raise HTTPException(status_code=400, detail=f"Cannot transition from {order.status} to {body.status}")
    order.status = body.status
    await log_action(db, "kitchen_update_order", user=user, entity_type="order", entity_id=order_id,
                     description=f"Order #{order.order_number} → {body.status}")

    event_data = {"orderId": str(order.id), "orderNumber": order.order_number, "status": body.status.value}
    if body.status == OrderStatus.COOKING:
        await ws_manager.broadcast_order_update(order.public_token, "order_cooking", event_data)
    elif body.status == OrderStatus.READY:
        await ws_manager.broadcast_to_restaurant(str(user.restaurant_id), "waiter", "order_ready", event_data)
        await ws_manager.broadcast_to_restaurant(str(user.restaurant_id), "admin", "order_ready", event_data)
        await ws_manager.broadcast_order_update(order.public_token, "order_ready", event_data)
    elif body.status == OrderStatus.CANCELLED:
        kitchen_cancel_data = {
            **event_data,
            "tableNumber": order.table_number,
            "tableZone": order.table_zone,
        }
        await ws_manager.broadcast_to_restaurant(str(user.restaurant_id), "waiter", "order_cancelled_by_kitchen", kitchen_cancel_data)
        await ws_manager.broadcast_to_restaurant(str(user.restaurant_id), "admin", "order_cancelled", event_data)
        await ws_manager.broadcast_order_update(order.public_token, "order_cancelled", event_data)

    await db.commit()
    await db.refresh(order)
    return order


@router.patch("/orders/{order_id}/items/{item_id}/cancel", response_model=OrderResponse)
async def kitchen_cancel_item(
    order_id: str,
    item_id: str,
    user: User = Depends(require_role(UserRole.COOK, UserRole.RESTAURANT_ADMIN)),
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
    if order.status not in (OrderStatus.ACCEPTED, OrderStatus.COOKING):
        raise HTTPException(status_code=400, detail="Can only cancel items from accepted/cooking orders")

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

    await log_action(db, "kitchen_cancel_item", user=user, entity_type="order", entity_id=order_id,
                     description=f"Removed 1× '{item.item_name_snapshot}' from order #{order.order_number}")

    event_data = {
        "orderId": str(order.id),
        "orderNumber": order.order_number,
        "itemId": str(item.id),
        "itemName": item.item_name_snapshot,
        "totalAmount": float(order.total_amount),
    }

    # If all items cancelled — cancel the whole order
    all_cancelled = all(i.is_cancelled for i in order.items)
    if all_cancelled:
        order.status = OrderStatus.CANCELLED
        cancel_data = {"orderId": str(order.id), "orderNumber": order.order_number, "status": "cancelled"}
        kitchen_cancel_data = {
            **cancel_data,
            "tableNumber": order.table_number,
            "tableZone": order.table_zone,
        }
        await ws_manager.broadcast_to_restaurant(str(user.restaurant_id), "waiter", "order_cancelled_by_kitchen", kitchen_cancel_data)
        await ws_manager.broadcast_to_restaurant(str(user.restaurant_id), "admin", "order_cancelled", cancel_data)
        await ws_manager.broadcast_order_update(order.public_token, "order_cancelled", cancel_data)
    else:
        await ws_manager.broadcast_to_restaurant(str(user.restaurant_id), "waiter", "order_item_cancelled", event_data)
        await ws_manager.broadcast_to_restaurant(str(user.restaurant_id), "admin", "order_item_cancelled", event_data)

    await db.commit()
    await db.refresh(order)
    return order
