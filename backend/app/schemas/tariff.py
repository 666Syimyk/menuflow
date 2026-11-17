from uuid import UUID
from datetime import datetime
from .base import BaseSchema


class TariffCreate(BaseSchema):
    name: str
    price: float
    period_days: int = 30
    max_tables: int = 10
    max_staff: int = 5
    max_menu_items: int = 50
    analytics_enabled: bool = False
    feedback_enabled: bool = True
    branding_enabled: bool = False


class TariffUpdate(BaseSchema):
    name: str | None = None
    price: float | None = None
    period_days: int | None = None
    max_tables: int | None = None
    max_staff: int | None = None
    max_menu_items: int | None = None
    analytics_enabled: bool | None = None
    feedback_enabled: bool | None = None
    branding_enabled: bool | None = None
    is_active: bool | None = None


class TariffResponse(BaseSchema):
    id: UUID
    name: str
    price: float
    period_days: int
    max_tables: int
    max_staff: int
    max_menu_items: int
    analytics_enabled: bool
    feedback_enabled: bool
    branding_enabled: bool
    is_active: bool
    created_at: datetime
