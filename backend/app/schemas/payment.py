from uuid import UUID
from datetime import datetime
from ..models.payment import PaymentMethod, PaymentRecordStatus
from .base import BaseSchema


class PaymentCreate(BaseSchema):
    order_id: UUID
    amount: float
    method: PaymentMethod = PaymentMethod.CASH


class PaymentResponse(BaseSchema):
    id: UUID
    restaurant_id: UUID
    order_id: UUID
    amount: float
    method: PaymentMethod
    status: PaymentRecordStatus
    paid_by_user_id: UUID | None
    created_at: datetime
