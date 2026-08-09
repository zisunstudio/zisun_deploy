import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_db
from app.models.review import Review, ReviewStatus
from app.schemas.review import ReviewResponse, ReviewModerationRequest
from app.services.review import ReviewService

router = APIRouter()


@router.get("/", response_model=List[ReviewResponse])
async def list_reviews(
    status: Optional[ReviewStatus] = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_async_db),
):
    stmt = select(Review).order_by(Review.created_at.desc())
    if status:
        stmt = stmt.where(Review.status == status)
    offset = (page - 1) * limit
    stmt = stmt.offset(offset).limit(limit)
    result = await db.execute(stmt)
    reviews = list(result.scalars().all())
    return [ReviewResponse.model_validate(r) for r in reviews]


@router.patch("/{review_id}/status", response_model=ReviewResponse)
async def moderate_review(
    review_id: uuid.UUID,
    body: ReviewModerationRequest,
    db: AsyncSession = Depends(get_async_db),
):
    svc = ReviewService(db)
    review = await svc.moderate_review(review_id, body.status)
    return ReviewResponse.model_validate(review)
