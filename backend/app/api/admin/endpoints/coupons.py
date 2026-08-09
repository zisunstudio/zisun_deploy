import uuid
from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_db
from app.models.coupon import Coupon
from app.schemas.coupon import CouponCreate, CouponUpdate, CouponResponse
from app.services.coupon import CouponService

router = APIRouter()


@router.get("/", response_model=List[CouponResponse])
async def list_coupons(
    active_only: bool = Query(default=False),
    db: AsyncSession = Depends(get_async_db),
):
    svc = CouponService(db)
    coupons = await svc.list_coupons(active_only=active_only)
    return [CouponResponse.model_validate(c) for c in coupons]


@router.post("/", response_model=CouponResponse, status_code=201)
async def create_coupon(
    body: CouponCreate,
    db: AsyncSession = Depends(get_async_db),
):
    coupon = Coupon(
        code=body.code.upper(),
        type=body.type,
        value=body.value,
        min_order_value=body.min_order_value,
        max_discount=body.max_discount,
        usage_limit=body.usage_limit,
        per_user_limit=body.per_user_limit,
        expires_at=body.expires_at,
        is_active=body.is_active,
    )
    db.add(coupon)
    await db.commit()
    await db.refresh(coupon)
    return CouponResponse.model_validate(coupon)


@router.put("/{coupon_id}", response_model=CouponResponse)
async def update_coupon(
    coupon_id: uuid.UUID,
    body: CouponUpdate,
    db: AsyncSession = Depends(get_async_db),
):
    result = await db.execute(select(Coupon).where(Coupon.id == coupon_id))
    coupon = result.scalar_one_or_none()
    if not coupon:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Coupon not found")

    if body.is_active is not None:
        coupon.is_active = body.is_active
    if body.usage_limit is not None:
        coupon.usage_limit = body.usage_limit
    if body.expires_at is not None:
        coupon.expires_at = body.expires_at

    await db.commit()
    await db.refresh(coupon)
    return CouponResponse.model_validate(coupon)


@router.delete("/{coupon_id}", status_code=204)
async def deactivate_coupon(
    coupon_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
):
    result = await db.execute(select(Coupon).where(Coupon.id == coupon_id))
    coupon = result.scalar_one_or_none()
    if not coupon:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Coupon not found")
    coupon.is_active = False
    await db.commit()


@router.get("/{code}/usage-stats")
async def get_coupon_usage_stats(
    code: str,
    db: AsyncSession = Depends(get_async_db),
):
    svc = CouponService(db)
    coupon = await svc.get_coupon_by_code(code)
    stats = await svc.get_usage_stats(coupon.id)
    return {"coupon_id": str(coupon.id), "code": coupon.code, **stats}
