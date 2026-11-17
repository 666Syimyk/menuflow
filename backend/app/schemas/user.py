from pydantic import field_validator
from uuid import UUID
from datetime import date, datetime
from ..models.user import UserRole
from .base import BaseSchema


class UserCreate(BaseSchema):
    name: str
    username: str | None = None
    email: str | None = None
    password: str
    role: UserRole
    restaurant_id: UUID | None = None

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v


class UserUpdate(BaseSchema):
    name: str | None = None
    username: str | None = None
    email: str | None = None
    is_active: bool | None = None


class UserResponse(BaseSchema):
    id: UUID
    name: str
    username: str | None = None
    email: str | None = None
    role: UserRole
    restaurant_id: UUID | None = None
    phone: str | None = None
    birth_date: date | None = None
    avatar_url: str | None = None
    is_active: bool
    created_at: datetime


class StaffCreate(BaseSchema):
    name: str
    username: str
    password: str
    role: UserRole
    phone: str | None = None
    birth_date: date | None = None

    @field_validator("role")
    @classmethod
    def staff_role_only(cls, v: UserRole) -> UserRole:
        allowed = {UserRole.WAITER, UserRole.COOK, UserRole.CASHIER, UserRole.RESTAURANT_ADMIN}
        if v not in allowed:
            raise ValueError("Invalid staff role")
        return v


class StaffUpdate(BaseSchema):
    name: str | None = None
    username: str | None = None
    password: str | None = None
    phone: str | None = None
    birth_date: date | None = None
    is_active: bool | None = None
