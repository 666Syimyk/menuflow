from pydantic import field_validator
from uuid import UUID
from datetime import datetime
from .base import BaseSchema


class FeedbackCreate(BaseSchema):
    rating: int
    comment: str | None = None

    @field_validator("rating")
    @classmethod
    def rating_range(cls, v: int) -> int:
        if v < 1 or v > 5:
            raise ValueError("Rating must be between 1 and 5")
        return v


class FeedbackUpdate(BaseSchema):
    is_reviewed: bool = True


class FeedbackResponse(BaseSchema):
    id: UUID
    restaurant_id: UUID
    table_id: UUID | None
    order_id: UUID | None
    rating: int
    comment: str | None
    is_reviewed: bool
    created_at: datetime
    table_number: int | None = None
