from pydantic import BaseModel
from uuid import UUID
from ..models.user import UserRole
from .base import BaseSchema


class LoginRequest(BaseModel):
    login: str
    password: str


class AuthUserResponse(BaseSchema):
    id: UUID
    name: str
    username: str | None = None
    email: str | None = None
    role: UserRole
    restaurant_id: UUID | None = None
    is_active: bool = True


class TokenResponse(BaseSchema):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: AuthUserResponse


class RefreshResponse(BaseSchema):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refreshToken: str


class MeResponse(BaseSchema):
    id: UUID
    name: str
    username: str | None = None
    email: str | None = None
    role: UserRole
    restaurant_id: UUID | None = None
    is_active: bool
