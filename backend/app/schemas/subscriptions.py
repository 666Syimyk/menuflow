from pydantic import BaseModel, ConfigDict, field_validator
from uuid import UUID
from datetime import datetime
from .base import BaseSchema


class SubscriptionSnakeModel(BaseModel):
    """Base for subscription responses — returns snake_case keys to match the frontend."""
    model_config = ConfigDict(from_attributes=True)


class SubscriptionSummary(SubscriptionSnakeModel):
    restaurant_id: UUID
    restaurant_name: str
    restaurant_slug: str
    restaurant_status: str
    tariff_id: UUID | None
    tariff_name: str | None
    tariff_price: float | None
    subscription_started_at: datetime | None
    subscription_ends_at: datetime | None
    days_left: int | None
    last_payment_at: datetime | None
    last_extension_at: datetime | None
    last_extended_by: str | None


class SubscriptionDetail(SubscriptionSummary):
    tariff_max_tables: int | None
    tariff_max_staff: int | None
    tariff_max_menu_items: int | None
    tariff_analytics_enabled: bool | None
    tariff_feedback_enabled: bool | None
    tariff_branding_enabled: bool | None


class ExtendSubscriptionRequest(BaseSchema):
    days: int
    amount: float | None = None
    currency: str = "KGS"
    payment_method: str | None = None
    payment_status: str | None = None
    transaction_reference: str | None = None
    comment: str | None = None
    activate_if_blocked: bool = False

    @field_validator("days")
    @classmethod
    def days_positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("days must be positive")
        return v

    @field_validator("amount")
    @classmethod
    def amount_not_negative(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError("amount cannot be negative")
        return v


class ReduceSubscriptionRequest(BaseSchema):
    days: int
    comment: str

    @field_validator("days")
    @classmethod
    def days_positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("days must be positive")
        return v


class SetExpiryRequest(BaseSchema):
    subscription_ends_at: datetime
    comment: str | None = None
    activate_if_blocked: bool = False


class ChangeTariffRequest(BaseSchema):
    tariff_id: UUID
    comment: str | None = None


class AddPaymentRequest(BaseSchema):
    amount: float
    currency: str = "KGS"
    payment_method: str = "cash"
    payment_status: str = "paid"
    paid_days: int | None = None
    transaction_reference: str | None = None
    comment: str | None = None
    extend_subscription: bool = False

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: float) -> float:
        if v < 0:
            raise ValueError("amount cannot be negative")
        return v


class SubscriptionHistoryResponse(SubscriptionSnakeModel):
    id: UUID
    restaurant_id: UUID
    action: str
    tariff_before: str | None
    tariff_after: str | None
    old_end_date: datetime | None
    new_end_date: datetime | None
    days_delta: int | None
    payment_amount: float | None
    payment_currency: str | None
    payment_method: str | None
    payment_status: str | None
    transaction_reference: str | None
    comment: str | None
    changed_by_name: str | None
    changed_by_role: str | None
    ip_address: str | None
    created_at: datetime


class SubscriptionPaymentResponse(SubscriptionSnakeModel):
    id: UUID
    restaurant_id: UUID
    tariff_name: str | None
    amount: float
    currency: str
    payment_method: str
    payment_status: str
    paid_days: int | None
    paid_from: datetime | None
    paid_until: datetime | None
    transaction_reference: str | None
    comment: str | None
    accepted_by_name: str | None
    created_at: datetime
    paid_at: datetime | None
