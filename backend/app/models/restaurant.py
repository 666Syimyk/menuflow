import enum
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Enum, ForeignKey, func, Text, Integer, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from ..core.database import Base


class RestaurantStatus(str, enum.Enum):
    TRIAL = "trial"
    ACTIVE = "active"
    EXPIRED = "expired"
    BLOCKED = "blocked"


class Restaurant(Base):
    __tablename__ = "restaurants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    logo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[RestaurantStatus] = mapped_column(Enum(RestaurantStatus), default=RestaurantStatus.TRIAL)
    tariff_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tariffs.id", ondelete="SET NULL"), nullable=True)
    subscription_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    subscription_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_subscription_change_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    currency: Mapped[str] = mapped_column(String(10), default="KGS")
    language: Mapped[str] = mapped_column(String(10), default="ru")
    admin_limit: Mapped[int] = mapped_column(Integer, default=5, server_default="5")
    admin_session_policy: Mapped[str] = mapped_column(String(50), default="kick_previous_session", server_default="kick_previous_session")
    allow_orders: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    allow_waiter_calls: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    allow_bill_requests: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    tariff: Mapped["Tariff"] = relationship("Tariff", back_populates="restaurants")
    staff: Mapped[list["User"]] = relationship("User", back_populates="restaurant", foreign_keys="User.restaurant_id")
    tables: Mapped[list["Table"]] = relationship("Table", back_populates="restaurant", cascade="all, delete-orphan")
    menu_categories: Mapped[list["MenuCategory"]] = relationship("MenuCategory", back_populates="restaurant", cascade="all, delete-orphan")
    menu_items: Mapped[list["MenuItem"]] = relationship("MenuItem", back_populates="restaurant", cascade="all, delete-orphan")
    orders: Mapped[list["Order"]] = relationship("Order", back_populates="restaurant", cascade="all, delete-orphan")
    waiter_calls: Mapped[list["WaiterCall"]] = relationship("WaiterCall", back_populates="restaurant", cascade="all, delete-orphan")
    bill_requests: Mapped[list["BillRequest"]] = relationship("BillRequest", back_populates="restaurant", cascade="all, delete-orphan")
    feedbacks: Mapped[list["Feedback"]] = relationship("Feedback", back_populates="restaurant", cascade="all, delete-orphan")
    payments: Mapped[list["Payment"]] = relationship("Payment", back_populates="restaurant", cascade="all, delete-orphan")
    support_tickets: Mapped[list["SupportTicket"]] = relationship("SupportTicket", back_populates="restaurant", cascade="all, delete-orphan")
    activity_logs: Mapped[list["ActivityLog"]] = relationship("ActivityLog", back_populates="restaurant", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Restaurant {self.name} ({self.status})>"
