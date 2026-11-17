from uuid import UUID
from datetime import datetime
from ..models.support import SupportTicketStatus
from .base import BaseSchema


class SupportTicketCreate(BaseSchema):
    subject: str
    message: str


class SupportTicketUpdate(BaseSchema):
    status: SupportTicketStatus | None = None
    admin_reply: str | None = None


class SupportTicketResponse(BaseSchema):
    id: UUID
    restaurant_id: UUID
    created_by_user_id: UUID
    subject: str
    message: str
    admin_reply: str | None
    status: SupportTicketStatus
    created_at: datetime
    updated_at: datetime | None
