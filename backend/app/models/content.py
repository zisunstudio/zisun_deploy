import uuid
import enum
from typing import Optional, List
from datetime import datetime
from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class ContentStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"


class ContentType(str, enum.Enum):
    IMAGE = "IMAGE"
    VIDEO = "VIDEO"


class TagType(str, enum.Enum):
    occasion = "occasion"
    season = "season"
    price_band = "price_band"
    category = "category"


class ContentCard(BaseModel):
    __tablename__ = "content_cards"

    type: Mapped[ContentType] = mapped_column(
        Enum(ContentType, name="contenttype"), nullable=False, default=ContentType.IMAGE
    )
    media_url: Mapped[str] = mapped_column(String(512), nullable=False)
    thumbnail_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    caption: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    status: Mapped[ContentStatus] = mapped_column(
        Enum(ContentStatus, name="contentstatus"),
        default=ContentStatus.DRAFT,
        nullable=False,
        index=True,
    )
    published_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )

    tags: Mapped[List["ContentTag"]] = relationship(
        "ContentTag", back_populates="card", cascade="all, delete-orphan"
    )
    products: Mapped[List["ContentProduct"]] = relationship(
        "ContentProduct",
        back_populates="card",
        cascade="all, delete-orphan",
        order_by="ContentProduct.display_order",
    )


class ContentTag(BaseModel):
    __tablename__ = "content_tags"

    content_card_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("content_cards.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tag_name: Mapped[str] = mapped_column(String(100), nullable=False)
    tag_type: Mapped[TagType] = mapped_column(
        Enum(TagType, name="tagtype"), nullable=False
    )

    card: Mapped["ContentCard"] = relationship("ContentCard", back_populates="tags")


class ContentProduct(BaseModel):
    __tablename__ = "content_products"

    content_card_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("content_cards.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False
    )
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    position_x: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    position_y: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    card: Mapped["ContentCard"] = relationship("ContentCard", back_populates="products")
    product: Mapped[Optional["Product"]] = relationship("Product")  # noqa: F821
