from typing import List
from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class Wishlist(BaseModel):
    __tablename__ = "wishlists"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )

    user: Mapped["User"] = relationship("User")
    items: Mapped[List["WishlistItem"]] = relationship(
        "WishlistItem",
        back_populates="wishlist",
        cascade="all, delete-orphan",
    )


class WishlistItem(BaseModel):
    __tablename__ = "wishlist_items"

    __table_args__ = (
        UniqueConstraint("wishlist_id", "product_variant_id", name="uq_wishlist_items"),
    )

    wishlist_id: Mapped[str] = mapped_column(
        ForeignKey("wishlists.id", ondelete="CASCADE"), index=True, nullable=False
    )
    product_variant_id: Mapped[str] = mapped_column(
        ForeignKey("product_variants.id"), nullable=False
    )

    wishlist: Mapped["Wishlist"] = relationship("Wishlist", back_populates="items")
    variant: Mapped["ProductVariant"] = relationship("ProductVariant")
