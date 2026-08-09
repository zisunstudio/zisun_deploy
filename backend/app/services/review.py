import uuid
import logging
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.review import Review, ReviewStatus
from app.models.order import Order, OrderItem, OrderStatus
from app.models.catalog import Product

logger = logging.getLogger(__name__)


class ReviewService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _verify_purchase(
        self,
        user_id: uuid.UUID,
        product_id: uuid.UUID,
        order_id: uuid.UUID,
    ) -> bool:
        """Return True if user has a DELIVERED order containing this product."""
        result = await self.db.execute(
            select(OrderItem)
            .join(Order, Order.id == OrderItem.order_id)
            .join(Product.variants.property.mapper.class_, isouter=True)
            .where(
                Order.id == order_id,
                Order.user_id == user_id,
                Order.status == OrderStatus.DELIVERED,
                OrderItem.product_variant_id.in_(
                    select(Product.variants.property.mapper.class_.id)
                    .where(Product.variants.property.mapper.class_.product_id == product_id)
                ),
            )
        )
        return result.scalar_one_or_none() is not None

    async def _verify_purchase_simple(
        self,
        user_id: uuid.UUID,
        product_id: uuid.UUID,
        order_id: uuid.UUID,
    ) -> bool:
        """Check that the given order is DELIVERED, belongs to user, and contains a variant of product."""
        # Check order belongs to user and is DELIVERED
        order_result = await self.db.execute(
            select(Order).where(
                Order.id == order_id,
                Order.user_id == user_id,
                Order.status == OrderStatus.DELIVERED,
            )
        )
        order = order_result.scalar_one_or_none()
        if not order:
            return False

        # Check order contains a variant of this product
        from app.models.catalog import ProductVariant
        item_result = await self.db.execute(
            select(OrderItem)
            .join(ProductVariant, ProductVariant.id == OrderItem.product_variant_id)
            .where(
                OrderItem.order_id == order_id,
                ProductVariant.product_id == product_id,
            )
        )
        return item_result.scalar_one_or_none() is not None

    async def create_review(
        self,
        user_id: uuid.UUID,
        product_id: uuid.UUID,
        order_id: uuid.UUID,
        rating: int,
        title: Optional[str],
        body: Optional[str],
    ) -> Review:
        # Check for duplicate review
        dup_result = await self.db.execute(
            select(Review).where(
                Review.user_id == user_id,
                Review.product_id == product_id,
                Review.order_id == order_id,
            )
        )
        if dup_result.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="You have already reviewed this item")

        is_verified = await self._verify_purchase_simple(user_id, product_id, order_id)
        if not is_verified:
            raise HTTPException(
                status_code=403,
                detail="You can only review products from delivered orders",
            )

        review = Review(
            user_id=user_id,
            product_id=product_id,
            order_id=order_id,
            rating=rating,
            title=title,
            body=body,
            is_verified_purchase=True,
            status=ReviewStatus.PENDING,
        )
        self.db.add(review)
        await self.db.commit()
        await self.db.refresh(review)
        return review

    async def get_product_reviews(
        self,
        product_id: uuid.UUID,
        page: int = 1,
        limit: int = 20,
    ) -> dict:
        offset = (page - 1) * limit

        # Total count and avg rating (approved only)
        agg_result = await self.db.execute(
            select(
                func.count(Review.id).label("total"),
                func.coalesce(func.avg(Review.rating), 0.0).label("avg"),
            ).where(
                Review.product_id == product_id,
                Review.status == ReviewStatus.APPROVED,
            )
        )
        agg = agg_result.one()

        # Rating distribution
        dist_result = await self.db.execute(
            select(Review.rating, func.count(Review.id).label("cnt"))
            .where(
                Review.product_id == product_id,
                Review.status == ReviewStatus.APPROVED,
            )
            .group_by(Review.rating)
        )
        distribution: dict[int, int] = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        for row in dist_result.all():
            distribution[row.rating] = row.cnt

        # Paginated reviews
        reviews_result = await self.db.execute(
            select(Review)
            .where(
                Review.product_id == product_id,
                Review.status == ReviewStatus.APPROVED,
            )
            .order_by(Review.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        reviews = list(reviews_result.scalars().all())

        return {
            "reviews": reviews,
            "total": agg.total or 0,
            "avg_rating": float(agg.avg or 0.0),
            "rating_distribution": distribution,
        }

    async def moderate_review(
        self, review_id: uuid.UUID, status: ReviewStatus
    ) -> Review:
        result = await self.db.execute(select(Review).where(Review.id == review_id))
        review = result.scalar_one_or_none()
        if not review:
            raise HTTPException(status_code=404, detail="Review not found")

        review.status = status
        await self.db.flush()

        # If approved, recalculate product avg_rating
        if status == ReviewStatus.APPROVED:
            await self._recalculate_product_rating(review.product_id)

        await self.db.commit()
        await self.db.refresh(review)
        return review

    async def _recalculate_product_rating(self, product_id: uuid.UUID) -> None:
        agg_result = await self.db.execute(
            select(
                func.count(Review.id).label("cnt"),
                func.coalesce(func.avg(Review.rating), 0.0).label("avg"),
            ).where(
                Review.product_id == product_id,
                Review.status == ReviewStatus.APPROVED,
            )
        )
        row = agg_result.one()
        await self.db.execute(
            update(Product)
            .where(Product.id == product_id)
            .values(avg_rating=float(row.avg or 0.0), review_count=int(row.cnt or 0))
        )
