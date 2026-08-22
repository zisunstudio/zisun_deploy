from typing import Optional, List
from sqlalchemy import String, Integer, DateTime, ForeignKey, Text, Boolean, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.ext.asyncio import AsyncAttrs
from datetime import datetime
import enum

from .base import BaseModel


class MediaType(str, enum.Enum):
    IMAGE = "IMAGE"
    VIDEO = "VIDEO"


class Category(BaseModel):
    __tablename__ = "categories"

    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    image_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    products: Mapped[List["Product"]] = relationship(
        "Product",
        back_populates="category",
        primaryjoin="and_(Category.id == Product.category_id, Product.deleted_at.is_(None))",
        lazy="noload",
    )


class Product(BaseModel):
    __tablename__ = "products"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    base_price: Mapped[int] = mapped_column(Integer, nullable=False)  # In paise
    category_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("categories.id"), nullable=True
    )
    vendor_id: Mapped[Optional[str]] = mapped_column(String(255))
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    avg_rating: Mapped[float] = mapped_column(default=0.0, nullable=False)
    review_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # ── Legal Metrology declarations ──────────────────────────────────────────
    # Nullable on purpose. Everything here has a brand-level default in
    # settings, and the API fills the gap at serialisation time, so a listing is
    # never published with a blank declaration just because nobody typed one in.
    # A value here overrides the default for that one product.
    commodity_name: Mapped[Optional[str]] = mapped_column(String(255))
    # Free text, not a number: the rules ask for the declaration as printed
    # ("1 unit", "1 set of 2 pieces"), and a co-ord set is not one piece.
    net_quantity: Mapped[Optional[str]] = mapped_column(String(120))
    # Garment measurements in centimetres. Explicitly required for apparel.
    # Per-size numbers live in the size guide; this is the summary declaration.
    dimensions: Mapped[Optional[str]] = mapped_column(String(255))
    country_of_origin: Mapped[Optional[str]] = mapped_column(String(120))
    manufacturer_name: Mapped[Optional[str]] = mapped_column(String(255))
    manufacturer_address: Mapped[Optional[str]] = mapped_column(Text)

    variants: Mapped[List["ProductVariant"]] = relationship(
        "ProductVariant", back_populates="product", cascade="all, delete-orphan"
    )
    media: Mapped[List["ProductMedia"]] = relationship(
        "ProductMedia",
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductMedia.display_order",
    )
    category: Mapped[Optional["Category"]] = relationship(
        "Category", back_populates="products", lazy="noload"
    )


class ProductVariant(BaseModel):
    __tablename__ = "product_variants"

    product_id: Mapped[str] = mapped_column(
        ForeignKey("products.id"), index=True, nullable=False
    )
    sku: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    size: Mapped[Optional[str]] = mapped_column(String(50))
    color: Mapped[Optional[str]] = mapped_column(String(50))
    stock: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    price_delta: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )  # Added to base_price
    version: Mapped[int] = mapped_column(
        Integer, default=1, nullable=False
    )  # Optimistic locking
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    product: Mapped["Product"] = relationship("Product", back_populates="variants")


class ProductMedia(BaseModel):
    __tablename__ = "product_media"

    product_id: Mapped[str] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True, nullable=False
    )
    url: Mapped[str] = mapped_column(String(1024), nullable=False)
    cdn_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    type: Mapped[MediaType] = mapped_column(
        SAEnum(MediaType, name="mediatype"), nullable=False, default=MediaType.IMAGE
    )
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    product: Mapped["Product"] = relationship("Product", back_populates="media")
