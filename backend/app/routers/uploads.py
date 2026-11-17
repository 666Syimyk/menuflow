from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..core.database import get_db
from ..core.dependencies import require_role
from ..models.user import User, UserRole
from ..models.restaurant import Restaurant
from ..schemas.restaurant import RestaurantResponse
from ..services.upload_service import save_upload

router = APIRouter(prefix="/uploads", tags=["Uploads"])


@router.post("/logo", response_model=RestaurantResponse)
async def upload_logo(
    file: UploadFile = File(...),
    user: User = Depends(require_role(UserRole.RESTAURANT_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")
    url = await save_upload(file, subfolder="logos")
    result = await db.execute(select(Restaurant).where(Restaurant.id == user.restaurant_id))
    restaurant = result.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    restaurant.logo_url = url
    await db.commit()
    await db.refresh(restaurant)
    return restaurant
