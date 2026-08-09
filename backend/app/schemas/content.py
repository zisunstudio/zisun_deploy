import uuid
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel

from app.models.content import ContentStatus, ContentType, TagType


class ContentTagCreate(BaseModel):
    tag_name: str
    tag_type: TagType


class ContentTagResponse(BaseModel):
    id: uuid.UUID
    tag_name: str
    tag_type: TagType

    class Config:
        from_attributes = True


class ContentProductLink(BaseModel):
    product_id: uuid.UUID
    display_order: int = 0
    position_x: Optional[float] = None
    position_y: Optional[float] = None


class ContentProductResponse(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    display_order: int
    position_x: Optional[float] = None
    position_y: Optional[float] = None

    class Config:
        from_attributes = True


class ContentCardCreate(BaseModel):
    type: ContentType = ContentType.IMAGE
    media_url: str
    thumbnail_url: Optional[str] = None
    caption: Optional[str] = None
    tags: List[ContentTagCreate] = []


class ContentCardUpdate(BaseModel):
    media_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    caption: Optional[str] = None


class ContentCardResponse(BaseModel):
    id: uuid.UUID
    type: ContentType
    media_url: str
    thumbnail_url: Optional[str] = None
    caption: Optional[str] = None
    status: ContentStatus
    published_at: Optional[datetime] = None
    created_at: datetime
    tags: List[ContentTagResponse] = []
    products: List[ContentProductResponse] = []

    class Config:
        from_attributes = True
