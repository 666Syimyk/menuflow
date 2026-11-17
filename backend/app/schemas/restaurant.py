from uuid import UUID
from datetime import datetime
from ..models.restaurant import RestaurantStatus
from .base import BaseSchema


class RestaurantCreate(BaseSchema):
    name: str
    slug: str
    phone: str | None = None
    address: str | None = None
    city: str | None = None
    currency: str = "KGS"
    language: str = "ru"


class RestaurantUpdate(BaseSchema):
    name: str | None = None
    phone: str | None = None
    address: str | None = None
    city: str | None = None
    currency: str | None = None
    language: str | None = None
    logo_url: str | None = None


class RestaurantSettingsUpdate(BaseSchema):
    name: str | None = None
    phone: str | None = None
    address: str | None = None
    city: str | None = None
    slug: str | None = None
    currency: str | None = None
    language: str | None = None
    status: str | None = None
    admin_limit: int | None = None
    admin_session_policy: str | None = None
    allow_orders: bool | None = None
    allow_waiter_calls: bool | None = None
    allow_bill_requests: bool | None = None


class RestaurantStatusUpdate(BaseSchema):
    status: RestaurantStatus


class RestaurantAssignTariff(BaseSchema):
    tariff_id: UUID
    subscription_ends_at: datetime | None = None


class RestaurantResponse(BaseSchema):
    id: UUID
    name: str
    slug: str
    logo_url: str | None = None
    phone: str | None = None
    address: str | None = None
    city: str | None = None
    status: RestaurantStatus
    tariff_id: UUID | None = None
    subscription_started_at: datetime | None = None
    subscription_ends_at: datetime | None = None
    currency: str
    language: str
    admin_limit: int = 5
    admin_session_policy: str = "kick_previous_session"
    allow_orders: bool = True
    allow_waiter_calls: bool = True
    allow_bill_requests: bool = True
    created_at: datetime


class RestaurantSummary(BaseSchema):
    id: UUID
    name: str
    slug: str
    status: RestaurantStatus
    created_at: datetime
