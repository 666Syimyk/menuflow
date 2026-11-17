import io
import os
import qrcode
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from ..core.database import get_db
from ..core.dependencies import require_role
from ..core.config import settings
from ..models.user import User, UserRole
from ..models.table import Table
from ..schemas.table import TableCreate, TableUpdate, TableAssign, TableResponse
from ..services.activity_log_service import log_action

router = APIRouter(prefix="/tables", tags=["Tables"])


def _public_table_url(restaurant_slug: str, token: str) -> str:
    return f"/m/{token}"


@router.get("", response_model=list[TableResponse])
async def list_tables(
    user: User = Depends(require_role(UserRole.RESTAURANT_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")
    result = await db.execute(
        select(Table)
        .where(Table.restaurant_id == user.restaurant_id)
        .options(selectinload(Table.waiter))
        .order_by(Table.number)
    )
    return result.scalars().all()


@router.post("", response_model=TableResponse, status_code=201)
async def create_table(
    body: TableCreate,
    user: User = Depends(require_role(UserRole.RESTAURANT_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")
    existing = await db.execute(
        select(Table).where(
            Table.restaurant_id == user.restaurant_id,
            Table.number == body.number,
            Table.zone == body.zone,
        )
    )
    if existing.scalar_one_or_none():
        zone_label = f' в зоне "{body.zone}"' if body.zone else ""
        raise HTTPException(status_code=400, detail=f"Стол №{body.number} уже существует{zone_label}")
    table = Table(restaurant_id=user.restaurant_id, **body.model_dump())
    db.add(table)
    await db.flush()
    await log_action(db, "create_table", user=user, entity_type="table", entity_id=str(table.id), description=f"Created table #{table.number}")
    await db.commit()
    await db.refresh(table)
    await db.execute(select(Table).where(Table.id == table.id).options(selectinload(Table.waiter)))
    return table


@router.patch("/{table_id}", response_model=TableResponse)
async def update_table(
    table_id: str,
    body: TableUpdate,
    user: User = Depends(require_role(UserRole.RESTAURANT_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")
    result = await db.execute(
        select(Table)
        .where(Table.id == table_id, Table.restaurant_id == user.restaurant_id)
        .options(selectinload(Table.waiter))
    )
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    for f, v in body.model_dump(exclude_unset=True).items():
        setattr(table, f, v)
    await db.commit()
    await db.refresh(table)
    return table


@router.patch("/{table_id}/assign", response_model=TableResponse)
async def assign_waiter(
    table_id: str,
    body: TableAssign,
    user: User = Depends(require_role(UserRole.RESTAURANT_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")
    result = await db.execute(
        select(Table)
        .where(Table.id == table_id, Table.restaurant_id == user.restaurant_id)
        .options(selectinload(Table.waiter))
    )
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    if body.waiter_id is not None:
        waiter_result = await db.execute(
            select(User).where(
                User.id == body.waiter_id,
                User.restaurant_id == user.restaurant_id,
                User.role == UserRole.WAITER,
            )
        )
        waiter = waiter_result.scalar_one_or_none()
        if not waiter:
            raise HTTPException(status_code=404, detail="Waiter not found in this restaurant")

    table.waiter_id = body.waiter_id
    await log_action(
        db, "assign_waiter", user=user, entity_type="table", entity_id=table_id,
        description=f"Table #{table.number} assigned to waiter {body.waiter_id or 'none'}",
    )
    await db.commit()
    await db.refresh(table)
    # reload relationship
    result2 = await db.execute(
        select(Table).where(Table.id == table.id).options(selectinload(Table.waiter))
    )
    return result2.scalar_one()


@router.delete("/{table_id}", status_code=204)
async def delete_table(
    table_id: str,
    user: User = Depends(require_role(UserRole.RESTAURANT_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")
    result = await db.execute(
        select(Table).where(Table.id == table_id, Table.restaurant_id == user.restaurant_id)
    )
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    await db.delete(table)
    await log_action(db, "delete_table", user=user, entity_type="table", entity_id=table_id)
    await db.commit()


@router.get("/{table_id}/qr")
async def get_table_qr(
    table_id: str,
    user: User = Depends(require_role(UserRole.RESTAURANT_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")
    from ..models.restaurant import Restaurant
    res_result = await db.execute(select(Restaurant).where(Restaurant.id == user.restaurant_id))
    restaurant = res_result.scalar_one_or_none()
    result = await db.execute(
        select(Table).where(Table.id == table_id, Table.restaurant_id == user.restaurant_id)
    )
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    url = _public_table_url(restaurant.slug if restaurant else str(user.restaurant_id), table.public_token)
    img = qrcode.make(url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    await log_action(db, "generate_qr", user=user, entity_type="table", entity_id=table_id, description=f"Generated QR for table #{table.number}")
    await db.commit()
    return StreamingResponse(buf, media_type="image/png", headers={"Content-Disposition": f"attachment; filename=table-{table.number}-qr.png"})
