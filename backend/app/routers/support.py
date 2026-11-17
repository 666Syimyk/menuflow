from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..core.database import get_db
from ..core.dependencies import require_role
from ..models.user import User, UserRole
from ..models.support import SupportTicket, SupportTicketStatus
from ..schemas.support import SupportTicketCreate, SupportTicketUpdate, SupportTicketResponse
from ..services.activity_log_service import log_action

router = APIRouter(prefix="/support", tags=["Support"])


@router.get("/tickets", response_model=list[SupportTicketResponse])
async def list_tickets(
    status: SupportTicketStatus | None = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    user: User = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.RESTAURANT_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    q = select(SupportTicket)
    if user.role == UserRole.RESTAURANT_ADMIN:
        if not user.restaurant_id:
            raise HTTPException(status_code=403, detail="No restaurant assigned")
        q = q.where(SupportTicket.restaurant_id == user.restaurant_id)
    if status:
        q = q.where(SupportTicket.status == status)
    result = await db.execute(q.order_by(SupportTicket.created_at.desc()).offset(offset).limit(limit))
    return result.scalars().all()


@router.post("/tickets", response_model=SupportTicketResponse, status_code=201)
async def create_ticket(
    body: SupportTicketCreate,
    user: User = Depends(require_role(UserRole.RESTAURANT_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    if not user.restaurant_id:
        raise HTTPException(status_code=403, detail="No restaurant assigned")
    ticket = SupportTicket(
        restaurant_id=user.restaurant_id,
        created_by_user_id=user.id,
        **body.model_dump(),
    )
    db.add(ticket)
    await db.flush()
    await log_action(db, "create_support_ticket", user=user, entity_type="support_ticket", entity_id=str(ticket.id))
    await db.commit()
    await db.refresh(ticket)
    return ticket


@router.patch("/tickets/{ticket_id}", response_model=SupportTicketResponse)
async def update_ticket(
    ticket_id: str,
    body: SupportTicketUpdate,
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SupportTicket).where(SupportTicket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    for f, v in body.model_dump(exclude_unset=True).items():
        setattr(ticket, f, v)
    await log_action(db, "update_support_ticket", user=user, entity_type="support_ticket", entity_id=ticket_id)
    await db.commit()
    await db.refresh(ticket)
    return ticket
