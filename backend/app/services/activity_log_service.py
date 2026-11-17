from sqlalchemy.ext.asyncio import AsyncSession
from ..models.activity_log import ActivityLog
from ..models.user import User
import uuid


async def log_action(
    db: AsyncSession,
    action: str,
    user: User | None = None,
    restaurant_id: uuid.UUID | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    description: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    entry = ActivityLog(
        restaurant_id=restaurant_id or (user.restaurant_id if user else None),
        user_id=user.id if user else None,
        role=user.role.value if user else None,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id else None,
        description=description,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(entry)
    await db.flush()
