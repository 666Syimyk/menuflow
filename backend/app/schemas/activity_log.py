from uuid import UUID
from datetime import datetime
from .base import BaseSchema


class ActivityLogResponse(BaseSchema):
    id: UUID
    restaurant_id: UUID | None
    user_id: UUID | None
    role: str | None
    action: str
    entity_type: str | None
    entity_id: str | None
    description: str | None
    ip_address: str | None
    created_at: datetime
