import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, Numeric, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from ..core.database import Base


class Tariff(Base):
    __tablename__ = "tariffs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    period_days: Mapped[int] = mapped_column(Integer, default=30)
    max_tables: Mapped[int] = mapped_column(Integer, default=10)
    max_staff: Mapped[int] = mapped_column(Integer, default=5)
    max_menu_items: Mapped[int] = mapped_column(Integer, default=50)
    analytics_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    feedback_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    branding_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    restaurants: Mapped[list["Restaurant"]] = relationship("Restaurant", back_populates="tariff")

    def __repr__(self) -> str:
        return f"<Tariff {self.name}>"
