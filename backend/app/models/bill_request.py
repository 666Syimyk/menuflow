import enum
import uuid
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Enum, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from ..core.database import Base


class BillRequestStatus(str, enum.Enum):
    NEW = "new"
    SEEN = "seen"
    COMPLETED = "completed"


class BillRequest(Base):
    __tablename__ = "bill_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    restaurant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False)
    table_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tables.id", ondelete="CASCADE"), nullable=False)
    order_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[BillRequestStatus] = mapped_column(Enum(BillRequestStatus), default=BillRequestStatus.NEW)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    restaurant: Mapped["Restaurant"] = relationship("Restaurant", back_populates="bill_requests")
    table: Mapped["Table"] = relationship("Table", back_populates="bill_requests", lazy="selectin")
    order: Mapped["Order | None"] = relationship("Order", back_populates="bill_requests")

    @property
    def table_number(self) -> int | None:
        try:
            return self.table.number if self.table else None
        except Exception:
            return None

    def __repr__(self) -> str:
        return f"<BillRequest table={self.table_id} ({self.status})>"
