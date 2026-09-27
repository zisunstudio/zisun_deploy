"""Referral codes in the console: every code, what it has sold, what is owed."""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_db
from app.models.coupon import Coupon
from app.models.order import Order
from app.models.referral import ReferralReward
from app.models.user import User
from app.services import referral

router = APIRouter()


@router.get("/")
async def list_referrals(db: AsyncSession = Depends(get_async_db)):
    """Every code with an owner, and every reward, settled as of now.

    Cash rewards that are earned and unpaid are listed with the creator's
    phone, so the founder can pay by UPI and tick them off.
    """
    await referral.settle(db)
    codes = await referral.summaries(db)
    owed = (await db.execute(
        select(ReferralReward, Coupon.code, User.name, User.phone, Order.total_amount, Order.status)
        .join(Coupon, Coupon.id == ReferralReward.coupon_id)
        .join(User, User.id == ReferralReward.referrer_user_id)
        .join(Order, Order.id == ReferralReward.order_id)
        .where(ReferralReward.status.in_(("pending", "earned")))
        .order_by(ReferralReward.created_at.desc())
        .limit(200)
    )).all()
    await db.commit()
    return {
        "rules": {
            "friend_discount_paise": referral.BUYER_DISCOUNT_PAISE,
            "reward_paise": referral.REFERRER_REWARD_PAISE,
            "min_order_paise": referral.MIN_ORDER_PAISE,
            "hold_days": referral.HOLD_DAYS,
        },
        "codes": [c.__dict__ for c in codes],
        "rewards": [
            {
                "id": str(r.id), "code": code, "owner": name, "phone": phone,
                "kind": r.kind, "status": r.status, "amount_paise": r.amount_paise,
                "order_id": str(r.order_id), "order_total_paise": total, "order_status": status.value,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "earned_at": r.earned_at.isoformat() if r.earned_at else None,
            }
            for r, code, name, phone, total, status in owed
        ],
    }


class CreatorCode(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    phone: str = Field(..., pattern=r"^\+91[6-9]\d{9}$")
    code: Optional[str] = Field(default=None, max_length=20)


@router.post("/creators", status_code=201)
async def create_creator(body: CreatorCode, db: AsyncSession = Depends(get_async_db)):
    coupon = await referral.create_creator_code(db, name=body.name.strip(), phone=body.phone, code=body.code)
    await db.commit()
    return {"code": coupon.code}


class Paid(BaseModel):
    reward_ids: List[uuid.UUID] = Field(..., min_length=1, max_length=200)


@router.post("/rewards/paid")
async def mark_paid(body: Paid, db: AsyncSession = Depends(get_async_db)):
    n = await referral.mark_paid(db, body.reward_ids)
    await db.commit()
    return {"marked": n}


class Active(BaseModel):
    active: bool


@router.patch("/codes/{code}")
async def set_active(code: str, body: Active, db: AsyncSession = Depends(get_async_db)):
    coupon = await db.scalar(select(Coupon).where(Coupon.code == code.upper(), Coupon.owner_user_id.isnot(None)))
    if coupon is None:
        raise HTTPException(404, "No such referral code")
    coupon.is_active = body.active
    await db.commit()
    return {"code": coupon.code, "active": coupon.is_active}
