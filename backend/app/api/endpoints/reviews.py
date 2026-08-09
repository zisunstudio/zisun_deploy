import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_db
from app.core.security import get_current_user
from app.schemas.review import ReviewCreate, ReviewResponse, ReviewListResponse
from app.services.review import ReviewService

router = APIRouter()


@router.post("/", response_model=ReviewResponse, status_code=201)
async def create_review(
    body: ReviewCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(get_current_user),
):
    """Submit a review for a product from a delivered order."""
    svc = ReviewService(db)
    review = await svc.create_review(
        user_id=current_user.id,
        product_id=body.product_id,
        order_id=body.order_id,
        rating=body.rating,
        title=body.title,
        body=body.body,
    )
    return ReviewResponse.model_validate(review)


@router.get("/products/{product_id}", response_model=ReviewListResponse)
async def get_product_reviews(
    product_id: uuid.UUID,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_async_db),
):
    """Get approved reviews for a product."""
    svc = ReviewService(db)
    data = await svc.get_product_reviews(product_id, page=page, limit=limit)
    return ReviewListResponse(
        reviews=[ReviewResponse.model_validate(r) for r in data["reviews"]],
        total=data["total"],
        avg_rating=data["avg_rating"],
        rating_distribution=data["rating_distribution"],
    )
