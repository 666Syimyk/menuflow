from pydantic import field_validator
from uuid import UUID
from datetime import datetime
from .base import BaseSchema


class MenuCategoryCreate(BaseSchema):
    name: str
    sort_order: int = 0


class MenuCategoryUpdate(BaseSchema):
    name: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class MenuCategoryResponse(BaseSchema):
    id: UUID
    restaurant_id: UUID
    name: str
    sort_order: int
    is_active: bool
    created_at: datetime


class MenuItemCreate(BaseSchema):
    category_id: UUID | None = None
    name: str
    description: str | None = None
    price: float
    weight: str | None = None
    cooking_time: int | None = None
    is_available: bool = True
    is_popular: bool = False
    sort_order: int = 0

    @field_validator("price")
    @classmethod
    def price_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Price must be positive")
        return v


class MenuItemUpdate(BaseSchema):
    category_id: UUID | None = None
    name: str | None = None
    description: str | None = None
    price: float | None = None
    weight: str | None = None
    cooking_time: int | None = None
    is_available: bool | None = None
    is_popular: bool | None = None
    sort_order: int | None = None


class MenuItemResponse(BaseSchema):
    id: UUID
    restaurant_id: UUID
    category_id: UUID | None
    name: str
    description: str | None
    price: float
    image_url: str | None
    images: list[str] = []
    weight: str | None
    cooking_time: int | None
    is_available: bool
    is_popular: bool
    sort_order: int
    created_at: datetime


class MenuItemPublic(BaseSchema):
    id: UUID
    category_id: UUID | None
    name: str
    description: str | None
    price: float
    image_url: str | None
    images: list[str] = []
    weight: str | None
    cooking_time: int | None
    is_available: bool
    is_popular: bool


class MenuCategoryWithItems(BaseSchema):
    id: UUID
    name: str
    sort_order: int
    items: list[MenuItemPublic]
