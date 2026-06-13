from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime
import uuid

from app.models.review import ReviewStatus


class ReviewCreate(BaseModel):
    product_id: uuid.UUID
    order_id: uuid.UUID
    rating: int = Field(..., ge=1, le=5)
    title: Optional[str] = Field(None, max_length=200)
    body: Optional[str] = Field(None, max_length=2000)


class ReviewModerationRequest(BaseModel):
    status: ReviewStatus


class ReviewResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    product_id: uuid.UUID
    order_id: uuid.UUID
    rating: int
    title: Optional[str] = None
    body: Optional[str] = None
    is_verified_purchase: bool
    status: ReviewStatus
    created_at: datetime

    class Config:
        from_attributes = True


class ReviewListResponse(BaseModel):
    reviews: List[ReviewResponse]
    total: int
    avg_rating: float
    rating_distribution: Dict[int, int]
