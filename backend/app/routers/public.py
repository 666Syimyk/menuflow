import secrets
import asyncio
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from ..core.database import get_db
from ..models.restaurant import Restaurant, RestaurantStatus
from ..models.table import Table
from ..models.menu import MenuCategory, MenuItem
from ..models.order import Order, OrderItem, OrderStatus, PaymentStatus
from ..models.waiter_call import WaiterCall, CallType
from ..models.bill_request import BillRequest
from ..models.feedback import Feedback
from ..schemas.menu import MenuCategoryWithItems, MenuItemPublic
from ..schemas.order import OrderCreate, OrderResponse, OrderStatusResponse
from ..schemas.waiter import WaiterCallResponse, BillRequestResponse
from ..schemas.feedback import FeedbackCreate, FeedbackResponse
from ..websockets.manager import ws_manager

router = APIRouter(prefix="/public", tags=["Public QR Menu"])


async def _get_restaurant_and_table_by_token(
    table_token: str,
    db: AsyncSession,
) -> tuple[Restaurant, Table]:
    table_result = await db.execute(select(Table).where(Table.public_token == table_token))
    table = table_result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    if not table.is_active:
        raise HTTPException(status_code=403, detail="Table is not active")
    res_result = await db.execute(select(Restaurant).where(Restaurant.id == table.restaurant_id))
    restaurant = res_result.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    if restaurant.status != RestaurantStatus.ACTIVE:
        raise HTTPException(status_code=403, detail="Restaurant is not accepting orders")
    return restaurant, table


@router.get("/table/{table_token}/menu")
async def get_menu_by_token(table_token: str, db: AsyncSession = Depends(get_db)):
    restaurant, table = await _get_restaurant_and_table_by_token(table_token, db)
    cats_result = await db.execute(
        select(MenuCategory)
        .where(MenuCategory.restaurant_id == restaurant.id, MenuCategory.is_active == True)
        .order_by(MenuCategory.sort_order, MenuCategory.name)
    )
    categories = cats_result.scalars().all()
    items_result = await db.execute(
        select(MenuItem)
        .where(MenuItem.restaurant_id == restaurant.id, MenuItem.is_available == True)
        .order_by(MenuItem.sort_order, MenuItem.name)
    )
    items = items_result.scalars().all()
    items_by_cat: dict = {}
    for item in items:
        key = str(item.category_id) if item.category_id else "__uncategorized__"
        items_by_cat.setdefault(key, []).append(item)
    menu = []
    for cat in categories:
        cat_items = items_by_cat.get(str(cat.id), [])
        menu.append({
            "id": str(cat.id),
            "name": cat.name,
            "sortOrder": cat.sort_order,
            "items": [MenuItemPublic.model_validate(i).model_dump(by_alias=True) for i in cat_items],
        })
    return {
        "restaurant": {"id": str(restaurant.id), "name": restaurant.name, "logoUrl": restaurant.logo_url, "currency": restaurant.currency},
        "table": {"id": str(table.id), "number": table.number, "zone": table.zone},
        "menu": menu,
    }


@router.post("/table/{table_token}/orders", response_model=OrderResponse, status_code=201)
async def create_order_by_token(
    table_token: str,
    body: OrderCreate,
    db: AsyncSession = Depends(get_db),
):
    restaurant, table = await _get_restaurant_and_table_by_token(table_token, db)
    item_ids = [i.menu_item_id for i in body.items]
    items_result = await db.execute(
        select(MenuItem).where(
            MenuItem.id.in_(item_ids),
            MenuItem.restaurant_id == restaurant.id,
            MenuItem.is_available == True,
        )
    )
    db_items = {str(i.id): i for i in items_result.scalars().all()}
    if len(db_items) != len(set(str(i.menu_item_id) for i in body.items)):
        raise HTTPException(status_code=400, detail="One or more items are unavailable or not from this restaurant")
    max_num = await db.execute(
        select(func.coalesce(func.max(Order.order_number), 0)).where(Order.restaurant_id == restaurant.id)
    )
    order_number = max_num.scalar() + 1
    public_token = secrets.token_urlsafe(24)
    order = Order(
        restaurant_id=restaurant.id,
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
        order_item = OrderItem(
            order_id=order.id,
            menu_item_id=db_item.id,
            item_name_snapshot=db_item.name,
            item_price_snapshot=float(db_item.price),
            quantity=input_item.quantity,
            comment=input_item.comment,
            total_price=line_total,
        )
        db.add(order_item)
        total += line_total
    order.total_amount = total
    await db.flush()
    await db.refresh(order)
    order_data = {
        "orderId": str(order.id),
        "orderNumber": order.order_number,
        "tableNumber": table.number,
        "totalAmount": total,
        "status": order.status.value,
    }
    await ws_manager.broadcast_to_restaurant(str(restaurant.id), "waiter", "new_order", order_data)
    await ws_manager.broadcast_to_restaurant(str(restaurant.id), "admin", "new_order", order_data)
    await db.commit()
    await db.refresh(order)
    return order


@router.post("/table/{table_token}/call-waiter", response_model=WaiterCallResponse, status_code=201)
async def call_waiter_by_token(table_token: str, db: AsyncSession = Depends(get_db)):
    restaurant, table = await _get_restaurant_and_table_by_token(table_token, db)
    call = WaiterCall(restaurant_id=restaurant.id, table_id=table.id)
    db.add(call)
    await db.flush()
    await ws_manager.broadcast_to_restaurant(
        str(restaurant.id), "waiter", "waiter_call_created",
        {"callId": str(call.id), "tableNumber": table.number, "tableId": str(table.id)}
    )
    await db.commit()
    await db.refresh(call)
    return call


@router.post("/table/{table_token}/bill-request", response_model=BillRequestResponse, status_code=201)
async def request_bill_by_token(table_token: str, db: AsyncSession = Depends(get_db)):
    restaurant, table = await _get_restaurant_and_table_by_token(table_token, db)
    order_result = await db.execute(
        select(Order).where(
            Order.table_id == table.id,
            Order.status.notin_([OrderStatus.PAID, OrderStatus.CANCELLED])
        ).order_by(Order.created_at.desc()).limit(1)
    )
    order = order_result.scalar_one_or_none()
    bill = BillRequest(restaurant_id=restaurant.id, table_id=table.id, order_id=order.id if order else None)
    db.add(bill)
    await db.flush()
    await ws_manager.broadcast_to_restaurant(
        str(restaurant.id), "waiter", "bill_requested",
        {"billRequestId": str(bill.id), "tableNumber": table.number, "orderId": str(order.id) if order else None}
    )
    await db.commit()
    await db.refresh(bill)
    return bill


@router.post("/table/{table_token}/feedback", response_model=FeedbackResponse, status_code=201)
async def submit_feedback_by_token(
    table_token: str,
    body: FeedbackCreate,
    db: AsyncSession = Depends(get_db),
):
    restaurant, table = await _get_restaurant_and_table_by_token(table_token, db)
    order_result = await db.execute(
        select(Order).where(Order.table_id == table.id).order_by(Order.created_at.desc()).limit(1)
    )
    order = order_result.scalar_one_or_none()
    feedback = Feedback(
        restaurant_id=restaurant.id,
        table_id=table.id,
        order_id=order.id if order else None,
        **body.model_dump(),
    )
    db.add(feedback)
    await db.flush()
    await ws_manager.broadcast_to_restaurant(
        str(restaurant.id), "admin", "feedback_created",
        {"rating": feedback.rating, "tableNumber": table.number}
    )
    await db.commit()
    await db.refresh(feedback)
    return feedback


async def _get_active_restaurant_and_table(
    restaurant_slug: str,
    table_token: str,
    db: AsyncSession,
) -> tuple[Restaurant, Table]:
    res_result = await db.execute(select(Restaurant).where(Restaurant.slug == restaurant_slug))
    restaurant = res_result.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    if restaurant.status != RestaurantStatus.ACTIVE:
        raise HTTPException(status_code=403, detail="Restaurant is not accepting orders")
    table_result = await db.execute(
        select(Table).where(Table.public_token == table_token, Table.restaurant_id == restaurant.id)
    )
    table = table_result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    if not table.is_active:
        raise HTTPException(status_code=403, detail="Table is not active")
    return restaurant, table


@router.get("/{restaurant_slug}/table/{table_token}/menu")
async def get_public_menu(
    restaurant_slug: str,
    table_token: str,
    db: AsyncSession = Depends(get_db),
):
    restaurant, table = await _get_active_restaurant_and_table(restaurant_slug, table_token, db)
    cats_result = await db.execute(
        select(MenuCategory)
        .where(MenuCategory.restaurant_id == restaurant.id, MenuCategory.is_active == True)
        .order_by(MenuCategory.sort_order, MenuCategory.name)
    )
    categories = cats_result.scalars().all()
    items_result = await db.execute(
        select(MenuItem)
        .where(MenuItem.restaurant_id == restaurant.id, MenuItem.is_available == True)
        .order_by(MenuItem.sort_order, MenuItem.name)
    )
    items = items_result.scalars().all()
    items_by_cat: dict = {}
    for item in items:
        key = str(item.category_id) if item.category_id else "__uncategorized__"
        items_by_cat.setdefault(key, []).append(item)
    menu = []
    for cat in categories:
        cat_items = items_by_cat.get(str(cat.id), [])
        menu.append({
            "id": str(cat.id),
            "name": cat.name,
            "sort_order": cat.sort_order,
            "items": [MenuItemPublic.model_validate(i) for i in cat_items],
        })
    return {
        "restaurant": {"id": str(restaurant.id), "name": restaurant.name, "logo_url": restaurant.logo_url, "currency": restaurant.currency},
        "table": {"id": str(table.id), "number": table.number, "zone": table.zone},
        "menu": menu,
    }


@router.post("/{restaurant_slug}/table/{table_token}/orders", response_model=OrderResponse, status_code=201)
async def create_order(
    restaurant_slug: str,
    table_token: str,
    body: OrderCreate,
    db: AsyncSession = Depends(get_db),
):
    restaurant, table = await _get_active_restaurant_and_table(restaurant_slug, table_token, db)

    # Resolve menu items and compute total server-side
    item_ids = [i.menu_item_id for i in body.items]
    items_result = await db.execute(
        select(MenuItem).where(
            MenuItem.id.in_(item_ids),
            MenuItem.restaurant_id == restaurant.id,
            MenuItem.is_available == True,
        )
    )
    db_items = {str(i.id): i for i in items_result.scalars().all()}

    if len(db_items) != len(set(str(i.menu_item_id) for i in body.items)):
        raise HTTPException(status_code=400, detail="One or more items are unavailable or not from this restaurant")

    # Get next order number for this restaurant
    max_num = await db.execute(
        select(func.coalesce(func.max(Order.order_number), 0)).where(Order.restaurant_id == restaurant.id)
    )
    order_number = max_num.scalar() + 1
    public_token = secrets.token_urlsafe(24)

    order = Order(
        restaurant_id=restaurant.id,
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
        order_item = OrderItem(
            order_id=order.id,
            menu_item_id=db_item.id,
            item_name_snapshot=db_item.name,
            item_price_snapshot=float(db_item.price),
            quantity=input_item.quantity,
            comment=input_item.comment,
            total_price=line_total,
        )
        db.add(order_item)
        total += line_total

    order.total_amount = total
    await db.flush()
    await db.refresh(order)

    # Broadcast only to waiter and admin — kitchen sees order AFTER waiter accepts
    order_data = {
        "order_id": str(order.id),
        "order_number": order.order_number,
        "table_number": table.number,
        "total_amount": total,
        "status": order.status.value,
    }
    await ws_manager.broadcast_to_restaurant(str(restaurant.id), "waiter", "new_order", order_data)
    await ws_manager.broadcast_to_restaurant(str(restaurant.id), "admin", "new_order", order_data)

    await db.commit()
    await db.refresh(order)
    return order


@router.get("/orders/{order_token}/status", response_model=OrderStatusResponse)
async def get_order_status(order_token: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Order).where(Order.public_token == order_token))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.post("/{restaurant_slug}/table/{table_token}/call-waiter", response_model=WaiterCallResponse, status_code=201)
async def call_waiter(
    restaurant_slug: str,
    table_token: str,
    db: AsyncSession = Depends(get_db),
):
    restaurant, table = await _get_active_restaurant_and_table(restaurant_slug, table_token, db)
    call = WaiterCall(restaurant_id=restaurant.id, table_id=table.id)
    db.add(call)
    await db.flush()
    await ws_manager.broadcast_to_restaurant(
        str(restaurant.id), "waiter", "waiter_call_created",
        {"call_id": str(call.id), "table_number": table.number, "table_id": str(table.id)}
    )
    await db.commit()
    await db.refresh(call)
    return call


@router.post("/table/{table_token}/call-admin", response_model=WaiterCallResponse, status_code=201)
async def call_admin_by_token(table_token: str, db: AsyncSession = Depends(get_db)):
    restaurant, table = await _get_restaurant_and_table_by_token(table_token, db)
    call = WaiterCall(restaurant_id=restaurant.id, table_id=table.id, call_type=CallType.ADMIN)
    db.add(call)
    await db.flush()
    await ws_manager.broadcast_to_restaurant(
        str(restaurant.id), "admin", "admin_call_created",
        {"call_id": str(call.id), "table_number": table.number, "table_id": str(table.id), "from": "guest"}
    )
    await db.commit()
    await db.refresh(call)
    return call


@router.post("/{restaurant_slug}/table/{table_token}/bill-request", response_model=BillRequestResponse, status_code=201)
async def request_bill(
    restaurant_slug: str,
    table_token: str,
    db: AsyncSession = Depends(get_db),
):
    restaurant, table = await _get_active_restaurant_and_table(restaurant_slug, table_token, db)
    # Find the most recent active order for this table
    order_result = await db.execute(
        select(Order).where(
            Order.table_id == table.id,
            Order.status.notin_([OrderStatus.PAID, OrderStatus.CANCELLED])
        ).order_by(Order.created_at.desc()).limit(1)
    )
    order = order_result.scalar_one_or_none()
    bill = BillRequest(restaurant_id=restaurant.id, table_id=table.id, order_id=order.id if order else None)
    db.add(bill)
    await db.flush()
    await ws_manager.broadcast_to_restaurant(
        str(restaurant.id), "waiter", "bill_requested",
        {"bill_request_id": str(bill.id), "table_number": table.number, "order_id": str(order.id) if order else None}
    )
    await db.commit()
    await db.refresh(bill)
    return bill


@router.post("/{restaurant_slug}/table/{table_token}/feedback", response_model=FeedbackResponse, status_code=201)
async def submit_feedback(
    restaurant_slug: str,
    table_token: str,
    body: FeedbackCreate,
    db: AsyncSession = Depends(get_db),
):
    restaurant, table = await _get_active_restaurant_and_table(restaurant_slug, table_token, db)
    order_result = await db.execute(
        select(Order).where(Order.table_id == table.id).order_by(Order.created_at.desc()).limit(1)
    )
    order = order_result.scalar_one_or_none()
    feedback = Feedback(
        restaurant_id=restaurant.id,
        table_id=table.id,
        order_id=order.id if order else None,
        **body.model_dump(),
    )
    db.add(feedback)
    await ws_manager.broadcast_to_restaurant(
        str(restaurant.id), "admin", "feedback_created",
        {"rating": feedback.rating, "table_number": table.number}
    )
    await db.commit()
    await db.refresh(feedback)
    return feedback


async def _ws_keepalive(websocket: WebSocket, room: str) -> None:
    """Send a ping every 25s to keep the connection alive through proxies."""
    try:
        while True:
            await asyncio.sleep(25)
            try:
                await websocket.send_json({"event": "ping", "data": {}})
            except Exception:
                break
    except asyncio.CancelledError:
        pass


# WebSocket endpoint — clients subscribe to order updates
@router.websocket("/ws/order/{order_token}")
async def order_ws(websocket: WebSocket, order_token: str):
    room = f"order:{order_token}"
    await ws_manager.connect(websocket, room)
    ping_task = asyncio.create_task(_ws_keepalive(websocket, room))
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        ping_task.cancel()
        ws_manager.disconnect(websocket, room)


# WebSocket endpoint — kitchen/waiter/admin subscribe to restaurant room
@router.websocket("/ws/{role}/{restaurant_id}")
async def restaurant_ws(websocket: WebSocket, role: str, restaurant_id: str):
    allowed_roles = {"kitchen", "waiter", "admin"}
    if role not in allowed_roles:
        await websocket.close(code=4000)
        return
    room = f"{role}:{restaurant_id}"
    await ws_manager.connect(websocket, room)
    ping_task = asyncio.create_task(_ws_keepalive(websocket, room))
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        ping_task.cancel()
        ws_manager.disconnect(websocket, room)
