from uuid import UUID
from datetime import datetime
from .base import BaseSchema


class TableCreate(BaseSchema):
    number: int
    zone: str | None = None


class TableUpdate(BaseSchema):
    number: int | None = None
    zone: str | None = None
    is_active: bool | None = None


class TableAssign(BaseSchema):
    waiter_id: UUID | None = None


class WaiterBrief(BaseSchema):
    id: UUID
    name: str
    username: str | None = None


class TableResponse(BaseSchema):
    id: UUID
    restaurant_id: UUID
    number: int
    zone: str | None
    public_token: str
    qr_url: str | None
    is_active: bool
    waiter_id: UUID | None = None
    waiter: WaiterBrief | None = None
    created_at: datetime


class TablePublic(BaseSchema):
    id: UUID
    number: int
    zone: str | None
