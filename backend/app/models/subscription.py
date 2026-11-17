import enum
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Integer, Numeric, Text, Enum, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from ..core.database import Base


class SubscriptionAction(str, enum.Enum):
    CREATED = "created"
    EXTENDED = "extended"
    REDUCED = "reduced"
    SET_EXPIRY_DATE = "set_expiry_date"
    TARIFF_CHANGED = "tariff_changed"
    ACTIVATED = "activated"
    EXPIRED = "expired"
    BLOCKED = "blocked"


class SubscriptionPaymentStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"


class SubscriptionPaymentMethod(str, enum.Enum):
    CASH = "cash"
    BANK_TRANSFER = "bank_transfer"
    CARD = "card"
    MBANK = "mbank"
    ODENGI = "odengi"
    BALANCE = "balance"
    FREE = "free"
    OTHER = "other"


class SubscriptionHistory(Base):
    __tablename__ = "subscription_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    restaurant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False)
    tariff_id_before: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tariffs.id", ondelete="SET NULL"), nullable=True)
    tariff_id_after: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tariffs.id", ondelete="SET NULL"), nullable=True)
    action: Mapped[SubscriptionAction] = mapped_column(Enum(SubscriptionAction), nullable=False)
    old_start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    old_end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    new_start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    new_end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    days_delta: Mapped[int | None] = mapped_column(Integer, nullable=True)
    payment_amount: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    payment_currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    payment_method: Mapped[str | None] = mapped_column(String(50), nullable=True)
    payment_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    transaction_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    changed_by_role: Mapped[str | None] = mapped_column(String(50), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(50), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    restaurant: Mapped["Restaurant"] = relationship("Restaurant", foreign_keys=[restaurant_id])
    tariff_before: Mapped["Tariff | None"] = relationship("Tariff", foreign_keys=[tariff_id_before])
    tariff_after: Mapped["Tariff | None"] = relationship("Tariff", foreign_keys=[tariff_id_after])
    changed_by: Mapped["User | None"] = relationship("User", foreign_keys=[changed_by_user_id])

    def __repr__(self) -> str:
        return f"<SubscriptionHistory {self.action} for {self.restaurant_id}>"


class SubscriptionPayment(Base):
    __tablename__ = "subscription_payments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    restaurant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False)
    tariff_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tariffs.id", ondelete="SET NULL"), nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="KGS")
    payment_method: Mapped[str] = mapped_column(String(50), default=SubscriptionPaymentMethod.CASH)
    payment_status: Mapped[str] = mapped_column(String(30), default=SubscriptionPaymentStatus.PAID)
    paid_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    paid_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    transaction_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    accepted_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    restaurant: Mapped["Restaurant"] = relationship("Restaurant", foreign_keys=[restaurant_id])
    tariff: Mapped["Tariff | None"] = relationship("Tariff", foreign_keys=[tariff_id])
    accepted_by: Mapped["User | None"] = relationship("User", foreign_keys=[accepted_by_user_id])

    def __repr__(self) -> str:
        return f"<SubscriptionPayment {self.amount} {self.currency}>"
