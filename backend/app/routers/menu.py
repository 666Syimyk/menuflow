from fastapi import APIRouter, Body, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..core.database import get_db
from ..core.dependencies import require_role
from ..models.user import User, UserRole
from ..models.menu import MenuCategory, MenuItem
from ..schemas.menu import (
    MenuCategoryCreate, MenuCategoryUpdate, MenuCategoryResponse,
    MenuItemCreate, MenuItemUpdate, MenuItemResponse,
)
from ..services.activity_log_service import log_action
from ..services.upload_service import save_upload

router = APIRouter(prefix="/menu", tags=["Menu"])

ADMIN_ROLES = (UserRole.RESTAURANT_ADMIN,)
READ_ROLES = (UserRole.RESTAURANT_ADMIN, UserRole.WAITER)


def _check_restaurant(user: User) -> None:
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")


# ---- Categories ----

@router.get("/categories", response_model=list[MenuCategoryResponse])
async def list_categories(
    user: User = Depends(require_role(*READ_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    _check_restaurant(user)
    result = await db.execute(
        select(MenuCategory)
        .where(MenuCategory.restaurant_id == user.restaurant_id)
        .order_by(MenuCategory.sort_order, MenuCategory.name)
    )
    return result.scalars().all()


@router.post("/categories", response_model=MenuCategoryResponse, status_code=201)
async def create_category(
    body: MenuCategoryCreate,
    user: User = Depends(require_role(*ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    _check_restaurant(user)
    cat = MenuCategory(restaurant_id=user.restaurant_id, **body.model_dump())
    db.add(cat)
    await db.flush()
    await log_action(db, "create_category", user=user, entity_type="menu_category", entity_id=str(cat.id), description=f"Created category: {cat.name}")
    await db.commit()
    await db.refresh(cat)
    return cat


@router.patch("/categories/{cat_id}", response_model=MenuCategoryResponse)
async def update_category(
    cat_id: str,
    body: MenuCategoryUpdate,
    user: User = Depends(require_role(*ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    _check_restaurant(user)
    result = await db.execute(
        select(MenuCategory).where(MenuCategory.id == cat_id, MenuCategory.restaurant_id == user.restaurant_id)
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    for f, v in body.model_dump(exclude_unset=True).items():
        setattr(cat, f, v)
    await db.commit()
    await db.refresh(cat)
    return cat


@router.delete("/categories/{cat_id}", status_code=204)
async def delete_category(
    cat_id: str,
    user: User = Depends(require_role(*ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    _check_restaurant(user)
    result = await db.execute(
        select(MenuCategory).where(MenuCategory.id == cat_id, MenuCategory.restaurant_id == user.restaurant_id)
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    await db.delete(cat)
    await log_action(db, "delete_category", user=user, entity_type="menu_category", entity_id=cat_id)
    await db.commit()


# ---- Items ----

@router.get("/items", response_model=list[MenuItemResponse])
async def list_items(
    user: User = Depends(require_role(*READ_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    _check_restaurant(user)
    result = await db.execute(
        select(MenuItem)
        .where(MenuItem.restaurant_id == user.restaurant_id)
        .order_by(MenuItem.sort_order, MenuItem.name)
    )
    return result.scalars().all()


@router.post("/items", response_model=MenuItemResponse, status_code=201)
async def create_item(
    body: MenuItemCreate,
    user: User = Depends(require_role(*ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    _check_restaurant(user)
    if body.category_id:
        cat_res = await db.execute(
            select(MenuCategory).where(MenuCategory.id == body.category_id, MenuCategory.restaurant_id == user.restaurant_id)
        )
        if not cat_res.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Category not found in this restaurant")
    item = MenuItem(restaurant_id=user.restaurant_id, **body.model_dump())
    db.add(item)
    await db.flush()
    await log_action(db, "create_menu_item", user=user, entity_type="menu_item", entity_id=str(item.id), description=f"Created item: {item.name}")
    await db.commit()
    await db.refresh(item)
    return item


@router.patch("/items/{item_id}", response_model=MenuItemResponse)
async def update_item(
    item_id: str,
    body: MenuItemUpdate,
    user: User = Depends(require_role(*ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    _check_restaurant(user)
    result = await db.execute(
        select(MenuItem).where(MenuItem.id == item_id, MenuItem.restaurant_id == user.restaurant_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")
    updates = body.model_dump(exclude_unset=True)
    if "price" in updates:
        await log_action(db, "change_price", user=user, entity_type="menu_item", entity_id=item_id, description=f"Price changed from {item.price} to {updates['price']}")
    for f, v in updates.items():
        setattr(item, f, v)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/items/{item_id}", status_code=204)
async def delete_item(
    item_id: str,
    user: User = Depends(require_role(*ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    _check_restaurant(user)
    result = await db.execute(
        select(MenuItem).where(MenuItem.id == item_id, MenuItem.restaurant_id == user.restaurant_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")
    await db.delete(item)
    await log_action(db, "delete_menu_item", user=user, entity_type="menu_item", entity_id=item_id)
    await db.commit()


@router.post("/items/{item_id}/image", response_model=MenuItemResponse)
async def upload_item_image(
    item_id: str,
    file: UploadFile = File(...),
    user: User = Depends(require_role(*ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    _check_restaurant(user)
    result = await db.execute(
        select(MenuItem).where(MenuItem.id == item_id, MenuItem.restaurant_id == user.restaurant_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")
    url = await save_upload(file, subfolder="menu")
    current = list(item.images or [])
    if url not in current:
        current.append(url)
    item.images = current
    if not item.image_url:
        item.image_url = url
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/items/{item_id}/image", response_model=MenuItemResponse)
async def delete_item_image(
    item_id: str,
    url: str = Body(..., embed=True),
    user: User = Depends(require_role(*ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    _check_restaurant(user)
    result = await db.execute(
        select(MenuItem).where(MenuItem.id == item_id, MenuItem.restaurant_id == user.restaurant_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")
    item.images = [u for u in (item.images or []) if u != url]
    if item.image_url == url:
        item.image_url = item.images[0] if item.images else None
    await db.commit()
    await db.refresh(item)
    return item
