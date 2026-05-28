from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import uuid
import enum


class SortBy(str, enum.Enum):
    price_asc = "price_asc"
    price_desc = "price_desc"
    newest = "newest"


# ── Media ─────────────────────────────────────────────────────────────────────

class ProductMediaResponse(BaseModel):
    id: uuid.UUID
    url: str
    cdn_url: Optional[str] = None
    type: str
    display_order: int

    class Config:
        from_attributes = True


# ── Variants ──────────────────────────────────────────────────────────────────

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
    is_active: bool = True
    effective_price: Optional[int] = None  # base_price + price_delta, injected by service

    class Config:
        from_attributes = True


# ── Categories ────────────────────────────────────────────────────────────────

class CategoryResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    image_url: Optional[str] = None
    description: Optional[str] = None
    is_active: bool = True
    product_count: int = 0

    class Config:
        from_attributes = True


class CategoryDetail(CategoryResponse):
    products: List["ProductResponse"] = []

    class Config:
        from_attributes = True


# ── Products ──────────────────────────────────────────────────────────────────

class ProductBase(BaseModel):
    name: str = Field(..., min_length=1)
    description: Optional[str] = None
    base_price: int = Field(..., ge=0)
    category_id: Optional[uuid.UUID] = None
    vendor_id: Optional[str] = None


class ProductCreate(ProductBase):
    variants: List[ProductVariantCreate] = Field(..., min_length=1)


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = None
    base_price: Optional[int] = Field(None, ge=0)
    category_id: Optional[uuid.UUID] = None


class ProductResponse(ProductBase):
    id: uuid.UUID
    is_active: bool = True
    created_at: datetime
    updated_at: datetime
    variants: List[ProductVariantResponse] = []
    media: List[ProductMediaResponse] = []
    category: Optional[CategoryResponse] = None

    class Config:
        from_attributes = True


class ProductListResponse(BaseModel):
    items: List[ProductResponse]
    total: int
    page: int
    limit: int

    class Config:
        from_attributes = True


class SearchResponse(BaseModel):
    items: List[ProductResponse]
    total: int
    page: int
    limit: int
    query: str

    class Config:
        from_attributes = True


# ── Resolve forward references ─────────────────────────────────────────────────
CategoryDetail.model_rebuild()
