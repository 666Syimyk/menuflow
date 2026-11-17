from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from ..core.database import get_db
from ..core.security import verify_password, create_access_token, create_refresh_token, decode_token
from ..core.dependencies import get_current_user
from ..models.user import User
from ..models.restaurant import Restaurant, RestaurantStatus
from ..schemas.auth import LoginRequest, TokenResponse, RefreshRequest, RefreshResponse, MeResponse, AuthUserResponse
from ..services.activity_log_service import log_action

router = APIRouter(prefix="/auth", tags=["Auth"])


def _build_user_response(user: User) -> AuthUserResponse:
    return AuthUserResponse.model_validate(user)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(or_(User.email == body.login, User.username == body.login))
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")

    if user.restaurant_id:
        res = await db.execute(select(Restaurant).where(Restaurant.id == user.restaurant_id))
        restaurant = res.scalar_one_or_none()
        if restaurant and restaurant.status == RestaurantStatus.BLOCKED:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Restaurant is blocked")
        if restaurant and restaurant.status == RestaurantStatus.EXPIRED:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Restaurant subscription expired")

    payload = {"sub": str(user.id), "role": user.role.value}
    access_token = create_access_token(payload)
    refresh_token = create_refresh_token(payload)

    await log_action(
        db, "user_login", user=user,
        description=f"User {user.email or user.username} logged in",
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_build_user_response(user),
    )


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(body.refreshToken)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    new_payload = {"sub": str(user.id), "role": user.role.value}
    return RefreshResponse(
        access_token=create_access_token(new_payload),
        refresh_token=create_refresh_token(new_payload),
    )


@router.post("/logout")
async def logout(user: User = Depends(get_current_user)):
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=MeResponse)
async def me(user: User = Depends(get_current_user)):
    return MeResponse.model_validate(user)
