from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_db
from app.core import memo
from app.core.security import get_current_user
from app.schemas.coupon import CouponApplyRequest, CouponApplyResponse, PublicCoupon
from app.services.coupon import CouponService

router = APIRouter()


@router.get("/active", response_model=list[PublicCoupon])
async def active_coupons(db: AsyncSession = Depends(get_async_db)):
    """The coupons a shopper may use right now, for the storefront to advertise.

    Public on purpose: a code nobody can see is a code nobody uses. Referral
    coupons are left out - they are minted per customer and shown to that
    customer, not to the shop. Expired and inactive ones are filtered here
    rather than trusted to the admin flipping a flag on the day.
    """
    async def load():
        coupons = await CouponService(db).list_coupons(active_only=True)
        return [
            PublicCoupon.model_validate(c, from_attributes=True)
            for c in coupons if not c.is_referral
        ]
    # The expiry filter runs on every request, outside the cache, so a code
    # whose timer has passed is withdrawn on the second it ends - the cache
    # only saves the database read, never the decision.
    now = datetime.now(timezone.utc)
    live = [
        c for c in await memo.cached(("coupons_active",), 30, load)
        if getattr(c, "expires_at", None) is None or c.expires_at > now
    ]
    # Soonest to expire first: that is the one worth the shopper's attention.
    live.sort(key=lambda c: (c.expires_at is None, c.expires_at or now))
    return live


@router.post("/apply", response_model=CouponApplyResponse)
async def apply_coupon_preview(
    body: CouponApplyRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(get_current_user),
):
    """Validate a coupon and preview the discount. Does NOT commit anything."""
    svc = CouponService(db)
    coupon, discount = await svc.validate_coupon(
        code=body.code,
        user_id=current_user.id,
        order_total=body.order_total,
    )
    final_total = max(0, body.order_total - discount)
    return CouponApplyResponse(
        code=coupon.code,
        discount_amount=discount,
        final_total=final_total,
        message=f"Coupon applied! You save ₹{discount // 100}",
    )
