from pydantic import field_validator
from uuid import UUID
from datetime import datetime
from ..models.order import OrderStatus, PaymentStatus
from .base import BaseSchema


class OrderItemInput(BaseSchema):
    menu_item_id: UUID
    quantity: int
    comment: str | None = None

    @field_validator("quantity")
    @classmethod
    def quantity_positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("Quantity must be positive")
        if v > 50:
            raise ValueError("Quantity cannot exceed 50")
        return v


class OrderCreate(BaseSchema):
    items: list[OrderItemInput]
    customer_comment: str | None = None

    @field_validator("items")
    @classmethod
    def items_not_empty(cls, v: list) -> list:
        if not v:
            raise ValueError("Order must have at least one item")
        return v


class OrderItemResponse(BaseSchema):
    id: UUID
    menu_item_id: UUID | None
    item_name_snapshot: str
    item_price_snapshot: float
    quantity: int
    comment: str | None
    total_price: float
    is_cancelled: bool = False


class OrderResponse(BaseSchema):
    id: UUID
    restaurant_id: UUID
    table_id: UUID
    table_number: int | None = None
    table_zone: str | None = None
    waiter_name: str | None = None
    order_number: int
    public_token: str
    status: OrderStatus
    payment_status: PaymentStatus
    total_amount: float
    customer_comment: str | None
    items: list[OrderItemResponse]
    created_at: datetime
    updated_at: datetime | None


class OrderStatusUpdate(BaseSchema):
    status: OrderStatus


class OrderPaymentStatusUpdate(BaseSchema):
    payment_status: PaymentStatus


class OrderStatusResponse(BaseSchema):
    id: UUID
    order_number: int
    status: OrderStatus
    payment_status: PaymentStatus
    total_amount: float
    customer_comment: str | None = None
    items: list[OrderItemResponse] = []
    created_at: datetime
    updated_at: datetime | None = None
