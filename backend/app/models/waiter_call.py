import enum
import uuid
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Enum, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from ..core.database import Base


class WaiterCallStatus(str, enum.Enum):
    NEW = "new"
    SEEN = "seen"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class CallType(str, enum.Enum):
    WAITER = "waiter"
    ADMIN = "admin"


class WaiterCall(Base):
    __tablename__ = "waiter_calls"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    restaurant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False)
    table_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tables.id", ondelete="CASCADE"), nullable=True)
    status: Mapped[WaiterCallStatus] = mapped_column(Enum(WaiterCallStatus), default=WaiterCallStatus.NEW)
    call_type: Mapped[CallType] = mapped_column(Enum(CallType), default=CallType.WAITER)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    restaurant: Mapped["Restaurant"] = relationship("Restaurant", back_populates="waiter_calls")
    table: Mapped["Table | None"] = relationship("Table", back_populates="waiter_calls", lazy="selectin")

    @property
    def table_number(self) -> int | None:
        try:
            return self.table.number if self.table else None
        except Exception:
            return None

    def __repr__(self) -> str:
        return f"<WaiterCall table={self.table_id} type={self.call_type} ({self.status})>"
