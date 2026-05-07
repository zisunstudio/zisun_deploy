from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import uuid

# Variants
class ProductVariantBase(BaseModel):
    sku: str
    size: Optional[str] = None
    color: Optional[str] = None
    stock: int = Field(default=0, ge=0)
    price_delta: int = Field(default=0)

class ProductVariantCreate(ProductVariantBase):
    pass

class ProductVariantUpdate(BaseModel):
    size: Optional[str] = None
    color: Optional[str] = None
    stock: Optional[int] = Field(None, ge=0)
    price_delta: Optional[int] = None

class ProductVariantResponse(ProductVariantBase):
    id: uuid.UUID
    product_id: uuid.UUID
    version: int

    class Config:
        from_attributes = True

# Products
class ProductBase(BaseModel):
    name: str = Field(..., min_length=1)
    description: Optional[str] = None
    base_price: int = Field(..., ge=0)
    category_id: Optional[str] = None
    vendor_id: Optional[str] = None

class ProductCreate(ProductBase):
    variants: List[ProductVariantCreate] = Field(..., min_items=1)

class ProductUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = None
    base_price: Optional[int] = Field(None, ge=0)
    category_id: Optional[str] = None

class ProductResponse(ProductBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    variants: List[ProductVariantResponse] = []

    class Config:
        from_attributes = True
