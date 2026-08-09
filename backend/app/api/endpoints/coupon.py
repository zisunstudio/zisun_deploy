from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_db
from app.core.security import get_current_user
from app.schemas.coupon import CouponApplyRequest, CouponApplyResponse
from app.services.coupon import CouponService

router = APIRouter()


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
