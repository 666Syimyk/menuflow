from uuid import UUID
from datetime import datetime
from ..models.waiter_call import WaiterCallStatus, CallType
from ..models.bill_request import BillRequestStatus
from .base import BaseSchema


class WaiterCallResponse(BaseSchema):
    id: UUID
    restaurant_id: UUID
    table_id: UUID | None
    table_number: int | None = None
    status: WaiterCallStatus
    call_type: CallType
    created_at: datetime
    completed_at: datetime | None


class WaiterCallStatusUpdate(BaseSchema):
    status: WaiterCallStatus


class BillRequestResponse(BaseSchema):
    id: UUID
    restaurant_id: UUID
    table_id: UUID
    table_number: int | None = None
    order_id: UUID | None
    status: BillRequestStatus
    created_at: datetime
    completed_at: datetime | None


class BillRequestStatusUpdate(BaseSchema):
    status: BillRequestStatus
