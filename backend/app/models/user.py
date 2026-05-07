from typing import Optional, List
from sqlalchemy import String, Enum, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
import enum

from .base import BaseModel

class UserRole(str, enum.Enum):
    user = "user"
    admin = "admin"
    operations = "operations"
    finance = "finance"

class User(BaseModel):
    __tablename__ = "users"

    phone: Mapped[str] = mapped_column(String(15), unique=True, index=True, nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String(255))
    email: Mapped[Optional[str]] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.user, nullable=False)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Relationships
    orders: Mapped[List["Order"]] = relationship("Order", back_populates="user")
    addresses: Mapped[List["Address"]] = relationship("Address", back_populates="user")
