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

    # Nullable since email/password sign-in exists: a staff account created
    # that way has no phone. Still unique, and still the identifier the rest of
    # the system keys on - orders, COD confirmation and delivery all need it,
    # so a customer account without one cannot reach checkout.
    phone: Mapped[Optional[str]] = mapped_column(String(15), unique=True, index=True)
    name: Mapped[Optional[str]] = mapped_column(String(255))
    # Unique too, or the same address could sign in as two different accounts.
    # Postgres allows many NULLs under a unique index, which is what phone-only
    # customers need.
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True, index=True)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.user, nullable=False)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Relationships
    orders: Mapped[List["Order"]] = relationship("Order", back_populates="user")
    addresses: Mapped[List["Address"]] = relationship("Address", back_populates="user")
