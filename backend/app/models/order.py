import enum
import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Integer, Numeric, Text, Enum, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from ..core.database import Base


class OrderStatus(str, enum.Enum):
    NEW = "new"
    ACCEPTED = "accepted"
    COOKING = "cooking"
    READY = "ready"
    SERVED = "served"
    PAID = "paid"
    CANCELLED = "cancelled"


class PaymentStatus(str, enum.Enum):
    UNPAID = "unpaid"
    PENDING = "pending"
    PAID = "paid"
    CANCELLED = "cancelled"


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    restaurant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False)
    table_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tables.id", ondelete="RESTRICT"), nullable=False)
    order_number: Mapped[int] = mapped_column(Integer, nullable=False)
    public_token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus), default=OrderStatus.NEW)
    payment_status: Mapped[PaymentStatus] = mapped_column(Enum(PaymentStatus), default=PaymentStatus.UNPAID)
    total_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    customer_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    restaurant: Mapped["Restaurant"] = relationship("Restaurant", back_populates="orders")
    table: Mapped["Table"] = relationship("Table", back_populates="orders", lazy="selectin")
    items: Mapped[list["OrderItem"]] = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan", lazy="selectin")

    @property
    def table_number(self) -> int | None:
        try:
            return self.table.number if self.table else None
        except Exception:
            return None

    @property
    def table_zone(self) -> str | None:
        try:
            return self.table.zone if self.table else None
        except Exception:
            return None

    @property
    def waiter_name(self) -> str | None:
        try:
            return self.table.waiter.name if self.table and self.table.waiter else None
        except Exception:
            return None
    payments: Mapped[list["Payment"]] = relationship("Payment", back_populates="order")
    bill_requests: Mapped[list["BillRequest"]] = relationship("BillRequest", back_populates="order")
    feedbacks: Mapped[list["Feedback"]] = relationship("Feedback", back_populates="order")

    def __repr__(self) -> str:
        return f"<Order #{self.order_number} ({self.status})>"


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    menu_item_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("menu_items.id", ondelete="SET NULL"), nullable=True)
    item_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    item_price_snapshot: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    is_cancelled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)

    order: Mapped["Order"] = relationship("Order", back_populates="items")
    menu_item: Mapped["MenuItem | None"] = relationship("MenuItem", back_populates="order_items")

    def __repr__(self) -> str:
        return f"<OrderItem {self.item_name_snapshot} x{self.quantity}>"
