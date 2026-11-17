import enum
import uuid
from datetime import datetime, date
from sqlalchemy import Date, String, Boolean, DateTime, Enum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from ..core.database import Base


class UserRole(str, enum.Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    RESTAURANT_ADMIN = "RESTAURANT_ADMIN"
    WAITER = "WAITER"
    COOK = "COOK"
    CASHIER = "CASHIER"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    username: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False)
    restaurant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    restaurant: Mapped["Restaurant"] = relationship("Restaurant", back_populates="staff", foreign_keys=[restaurant_id])
    payments_processed: Mapped[list["Payment"]] = relationship("Payment", back_populates="paid_by_user", foreign_keys="Payment.paid_by_user_id")
    support_tickets: Mapped[list["SupportTicket"]] = relationship("SupportTicket", back_populates="created_by", foreign_keys="SupportTicket.created_by_user_id")
    activity_logs: Mapped[list["ActivityLog"]] = relationship("ActivityLog", back_populates="user")

    def __repr__(self) -> str:
        return f"<User {self.email or self.username} ({self.role})>"
