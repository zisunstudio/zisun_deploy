import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class ChannelOut(BaseModel):
    id: str
    code: str
    name: str
    is_marketplace: bool
    is_active: bool
    settlement_days: Optional[int] = None
    orders: int = 0
    gross_paise: int = 0
    settled_paise: int = 0
    orders_settled: int = 0
    listings: int = 0
    last_import_at: Optional[datetime] = None


class ChannelCreate(BaseModel):
    code: str = Field(..., min_length=2, max_length=30, pattern=r"^[a-z0-9_-]+$")
    name: str = Field(..., min_length=2, max_length=100)
    is_marketplace: bool = True
    settlement_days: Optional[int] = Field(None, ge=0, le=120)


class ListingIn(BaseModel):
    external_sku: str = Field(..., min_length=1, max_length=120)
    product_variant_id: uuid.UUID
    external_listing_id: Optional[str] = Field(None, max_length=120)


class ListingsUpsert(BaseModel):
    items: List[ListingIn]


class ListingOut(BaseModel):
    id: uuid.UUID
    external_sku: str
    external_listing_id: Optional[str] = None
    product_variant_id: uuid.UUID
    sku: Optional[str] = None
    product_name: Optional[str] = None
    size: Optional[str] = None
    colour: Optional[str] = None
    stock: Optional[int] = None


class ColumnMatch(BaseModel):
    field: str
    header: Optional[str] = None


class ImportPreview(BaseModel):
    kind: str
    filename: str
    columns: List[ColumnMatch]
    missing: List[str]
    unused: List[str]
    rows_total: int
    orders: int
    lines: int = 0
    unmapped_skus: List[str] = []
    stock_units: int = 0
    problems: List[str] = []
    sample: List[dict] = []
    ready: bool


class ImportResultOut(BaseModel):
    kind: str
    filename: str
    rows_total: int
    orders_created: int
    orders_updated: int
    orders_unchanged: int
    rows_skipped: int
    stock_adjusted: int
    problems: List[str]


class ChannelImportOut(BaseModel):
    id: uuid.UUID
    kind: str
    filename: str
    rows_total: int
    orders_created: int
    orders_updated: int
    rows_skipped: int
    problems: Optional[list] = None
    created_at: datetime

    class Config:
        from_attributes = True
