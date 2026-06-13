import uuid
import logging
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.coupon import Coupon, CouponUsage, CouponType

logger = logging.getLogger(__name__)

COD_MAX_ORDER_VALUE_PAISE = 500_000  # ₹5000


class CouponService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_coupon_by_code(self, code: str) -> Coupon:
        result = await self.db.execute(
            select(Coupon).where(Coupon.code == code.upper())
        )
        coupon = result.scalar_one_or_none()
        if not coupon:
            raise HTTPException(status_code=404, detail="Coupon not found")
        return coupon

    async def validate_coupon(
        self,
        code: str,
        user_id: uuid.UUID,
        order_total: int,
    ) -> tuple[Coupon, int]:
        """Validate coupon and return (coupon, discount_amount_paise).

        Raises 400/404 on any validation failure.
        """
        coupon = await self.get_coupon_by_code(code)

        if not coupon.is_active:
            raise HTTPException(status_code=400, detail="Coupon is no longer active")

        now = datetime.now(timezone.utc)
        if coupon.expires_at and coupon.expires_at < now:
            raise HTTPException(status_code=400, detail="Coupon has expired")

        if order_total < coupon.min_order_value:
            min_inr = coupon.min_order_value // 100
            raise HTTPException(
                status_code=400,
                detail=f"Minimum order value of ₹{min_inr} required for this coupon",
            )

        # Check global usage limit
        if coupon.usage_limit is not None:
            count_result = await self.db.execute(
                select(func.count(CouponUsage.id)).where(CouponUsage.coupon_id == coupon.id)
            )
            total_uses = count_result.scalar() or 0
            if total_uses >= coupon.usage_limit:
                raise HTTPException(status_code=400, detail="Coupon usage limit reached")

        # Check per-user limit
        user_count_result = await self.db.execute(
            select(func.count(CouponUsage.id)).where(
                CouponUsage.coupon_id == coupon.id,
                CouponUsage.user_id == user_id,
            )
        )
        user_uses = user_count_result.scalar() or 0
        if user_uses >= coupon.per_user_limit:
            raise HTTPException(
                status_code=400,
                detail=f"You have already used this coupon {user_uses} time(s)",
            )

        discount = self._compute_discount(coupon, order_total)
        return coupon, discount

    def _compute_discount(self, coupon: Coupon, order_total: int) -> int:
        """Compute discount amount in paise."""
        if coupon.type == CouponType.FLAT:
            discount = min(coupon.value, order_total)
        else:
            discount = (order_total * coupon.value) // 100
            if coupon.max_discount is not None:
                discount = min(discount, coupon.max_discount)

        return max(0, discount)

    async def record_usage(
        self,
        coupon_id: uuid.UUID,
        user_id: uuid.UUID,
        order_id: uuid.UUID,
    ) -> None:
        """Create CouponUsage record. Call within the same transaction as order creation."""
        usage = CouponUsage(coupon_id=coupon_id, user_id=user_id, order_id=order_id)
        self.db.add(usage)

    async def generate_referral_coupon(self, user_id: uuid.UUID, phone_suffix: str) -> Coupon:
        """Create a unique referral coupon for a new user."""
        import secrets
        rand_part = secrets.token_hex(2).upper()
        code = f"REF-{phone_suffix}-{rand_part}"

        coupon = Coupon(
            code=code,
            type=CouponType.PERCENT,
            value=10,          # 10% off
            max_discount=10000,  # max ₹100 in paise
            min_order_value=50000,  # min ₹500
            usage_limit=1,
            per_user_limit=1,
            is_referral=True,
        )
        self.db.add(coupon)
        await self.db.flush()
        return coupon

    async def list_coupons(self, active_only: bool = False) -> list[Coupon]:
        stmt = select(Coupon).order_by(Coupon.created_at.desc())
        if active_only:
            stmt = stmt.where(Coupon.is_active.is_(True))
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_usage_stats(self, coupon_id: uuid.UUID) -> dict:
        count_result = await self.db.execute(
            select(func.count(CouponUsage.id)).where(CouponUsage.coupon_id == coupon_id)
        )
        return {"total_uses": count_result.scalar() or 0}
