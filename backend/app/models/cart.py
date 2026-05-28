import uuid
from sqlalchemy import Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import List, Optional

from .base import BaseModel


class Cart(BaseModel):
    __tablename__ = "carts"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True, nullable=False, unique=True)

    user: Mapped["User"] = relationship("User")
    items: Mapped[List["CartItem"]] = relationship("CartItem", back_populates="cart", cascade="all, delete-orphan")


class CartItem(BaseModel):
    __tablename__ = "cart_items"

    cart_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("carts.id"), index=True, nullable=False)
    product_variant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("product_variants.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    cart: Mapped["Cart"] = relationship("Cart", back_populates="items")
    variant: Mapped[Optional["ProductVariant"]] = relationship("ProductVariant")
