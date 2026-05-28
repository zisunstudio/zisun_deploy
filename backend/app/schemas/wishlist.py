from pydantic import BaseModel
from typing import List, Optional
import uuid

from app.schemas.catalog import ProductVariantResponse


class WishlistItemResponse(BaseModel):
    id: uuid.UUID
    product_variant_id: uuid.UUID
    variant: Optional[ProductVariantResponse] = None

    class Config:
        from_attributes = True


class WishlistResponse(BaseModel):
    id: uuid.UUID
    items: List[WishlistItemResponse] = []
    total_items: int = 0

    class Config:
        from_attributes = True
