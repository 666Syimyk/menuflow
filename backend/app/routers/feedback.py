from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..core.database import get_db
from ..core.dependencies import require_role
from ..models.user import User, UserRole
from ..models.feedback import Feedback
from ..schemas.feedback import FeedbackResponse, FeedbackUpdate

router = APIRouter(prefix="/feedback", tags=["Feedback"])


@router.get("", response_model=list[FeedbackResponse])
async def list_feedback(
    min_rating: int | None = Query(None, ge=1, le=5),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    user: User = Depends(require_role(UserRole.RESTAURANT_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")
    q = select(Feedback).where(Feedback.restaurant_id == user.restaurant_id)
    if min_rating:
        q = q.where(Feedback.rating >= min_rating)
    result = await db.execute(q.order_by(Feedback.created_at.desc()).offset(offset).limit(limit))
    return result.scalars().all()


@router.patch("/{feedback_id}", response_model=FeedbackResponse)
async def update_feedback(
    feedback_id: str,
    body: FeedbackUpdate,
    user: User = Depends(require_role(UserRole.RESTAURANT_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")
    result = await db.execute(
        select(Feedback).where(Feedback.id == feedback_id, Feedback.restaurant_id == user.restaurant_id)
    )
    feedback = result.scalar_one_or_none()
    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")
    feedback.is_reviewed = body.is_reviewed
    await db.commit()
    await db.refresh(feedback)
    return feedback


@router.delete("/{feedback_id}", status_code=204)
async def delete_feedback(
    feedback_id: str,
    user: User = Depends(require_role(UserRole.RESTAURANT_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")
    result = await db.execute(
        select(Feedback).where(Feedback.id == feedback_id, Feedback.restaurant_id == user.restaurant_id)
    )
    feedback = result.scalar_one_or_none()
    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")
    await db.delete(feedback)
    await db.commit()
