from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from .database import get_db
from .security import decode_token
from ..models.user import User, UserRole
from ..models.restaurant import Restaurant, RestaurantStatus

bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user


async def get_current_active_user(user: User = Depends(get_current_user)) -> User:
    return user


def require_role(*roles: UserRole):
    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user
    return checker


def require_restaurant_access():
    async def checker(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> User:
        if user.role == UserRole.SUPER_ADMIN:
            return user
        if not user.restaurant_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No restaurant assigned")
        result = await db.execute(select(Restaurant).where(Restaurant.id == user.restaurant_id))
        restaurant = result.scalar_one_or_none()
        if not restaurant:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Restaurant not found")
        if restaurant.status == RestaurantStatus.BLOCKED:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Restaurant is blocked")
        if restaurant.status == RestaurantStatus.EXPIRED:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Restaurant subscription expired")
        return user
    return checker
