import uuid
import secrets
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from ..core.database import Base


class Table(Base):
    __tablename__ = "tables"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    restaurant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False)
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    zone: Mapped[str | None] = mapped_column(String(100), nullable=True)
    public_token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, default=lambda: secrets.token_urlsafe(24))
    qr_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    waiter_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    restaurant: Mapped["Restaurant"] = relationship("Restaurant", back_populates="tables")
    waiter: Mapped["User | None"] = relationship("User", foreign_keys=[waiter_id], lazy="selectin")
    orders: Mapped[list["Order"]] = relationship("Order", back_populates="table")
    waiter_calls: Mapped[list["WaiterCall"]] = relationship("WaiterCall", back_populates="table")
    bill_requests: Mapped[list["BillRequest"]] = relationship("BillRequest", back_populates="table")
    feedbacks: Mapped[list["Feedback"]] = relationship("Feedback", back_populates="table")

    def __repr__(self) -> str:
        return f"<Table #{self.number}>"
