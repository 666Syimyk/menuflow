from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..core.database import get_db
from ..core.dependencies import require_role
from ..models.user import User, UserRole
from ..models.activity_log import ActivityLog
from ..schemas.activity_log import ActivityLogResponse

router = APIRouter(prefix="/activity-logs", tags=["Activity Logs"])


@router.get("", response_model=list[ActivityLogResponse])
async def list_logs(
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    restaurant_id: str | None = Query(None),
    user: User = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.RESTAURANT_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    q = select(ActivityLog)
    if user.role == UserRole.RESTAURANT_ADMIN:
        if not user.restaurant_id:
            raise HTTPException(status_code=403, detail="No restaurant assigned")
        q = q.where(ActivityLog.restaurant_id == user.restaurant_id)
    elif restaurant_id:
        q = q.where(ActivityLog.restaurant_id == restaurant_id)
    result = await db.execute(q.order_by(ActivityLog.created_at.desc()).offset(offset).limit(limit))
    return result.scalars().all()
