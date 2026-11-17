from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..core.database import get_db
from ..core.dependencies import require_role
from ..models.user import User, UserRole
from ..models.tariff import Tariff
from ..schemas.tariff import TariffCreate, TariffUpdate, TariffResponse
from ..services.activity_log_service import log_action

router = APIRouter(prefix="/tariffs", tags=["Tariffs"])


@router.get("", response_model=list[TariffResponse])
async def list_tariffs(
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tariff).order_by(Tariff.created_at))
    return result.scalars().all()


@router.post("", response_model=TariffResponse, status_code=201)
async def create_tariff(
    body: TariffCreate,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    tariff = Tariff(**body.model_dump())
    db.add(tariff)
    await db.flush()
    await log_action(db, "create_tariff", user=user, entity_type="tariff", entity_id=str(tariff.id), description=f"Created tariff: {tariff.name}")
    await db.commit()
    await db.refresh(tariff)
    return tariff


@router.get("/{tariff_id}", response_model=TariffResponse)
async def get_tariff(
    tariff_id: str,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tariff).where(Tariff.id == tariff_id))
    tariff = result.scalar_one_or_none()
    if not tariff:
        raise HTTPException(status_code=404, detail="Tariff not found")
    return tariff


@router.patch("/{tariff_id}", response_model=TariffResponse)
async def update_tariff(
    tariff_id: str,
    body: TariffUpdate,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tariff).where(Tariff.id == tariff_id))
    tariff = result.scalar_one_or_none()
    if not tariff:
        raise HTTPException(status_code=404, detail="Tariff not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(tariff, field, value)
    await log_action(db, "update_tariff", user=user, entity_type="tariff", entity_id=tariff_id, description=f"Updated tariff: {tariff.name}")
    await db.commit()
    await db.refresh(tariff)
    return tariff


@router.delete("/{tariff_id}", status_code=204)
async def delete_tariff(
    tariff_id: str,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tariff).where(Tariff.id == tariff_id))
    tariff = result.scalar_one_or_none()
    if not tariff:
        raise HTTPException(status_code=404, detail="Tariff not found")
    await db.delete(tariff)
    await log_action(db, "delete_tariff", user=user, entity_type="tariff", entity_id=tariff_id)
    await db.commit()
