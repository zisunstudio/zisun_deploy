from typing import Optional, List
from sqlalchemy import String, Integer, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime

from .base import BaseModel

class Category(BaseModel):
    __tablename__ = "categories"
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    # Add other category fields as needed

class Product(BaseModel):
    __tablename__ = "products"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    base_price: Mapped[int] = mapped_column(Integer, nullable=False) # In paise
    category_id: Mapped[Optional[str]] = mapped_column(String(255)) # Simplified for MVP, could be FK
    vendor_id: Mapped[Optional[str]] = mapped_column(String(255))
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    variants: Mapped[List["ProductVariant"]] = relationship("ProductVariant", back_populates="product", cascade="all, delete-orphan")

class ProductVariant(BaseModel):
    __tablename__ = "product_variants"

    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"), index=True, nullable=False)
    sku: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    size: Mapped[Optional[str]] = mapped_column(String(50))
    color: Mapped[Optional[str]] = mapped_column(String(50))
    stock: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    price_delta: Mapped[int] = mapped_column(Integer, default=0, nullable=False) # Added to base_price
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False) # Optimistic locking

    product: Mapped["Product"] = relationship("Product", back_populates="variants")
