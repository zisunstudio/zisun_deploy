"""A customer's own referral code and store credit."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_db
from app.core.security import get_current_user
from app.models.referral import ReferralReward
from app.services import referral

router = APIRouter()


@router.get("/me")
async def my_referrals(
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(get_current_user),
):
    """Her code (once she has a delivered order), her credit, and each friend's order.

    Friends are listed by status only - never by name or number: that a
    friend bought is hers to know, who the friend is may not be.
    """
    await referral.settle(db, current_user.id)
    code = await referral.customer_code(db, current_user)
    balance = await referral.credit_balance(db, current_user.id)
    rewards = (await db.execute(
        select(ReferralReward.status, ReferralReward.amount_paise, ReferralReward.kind, ReferralReward.created_at)
        .where(ReferralReward.referrer_user_id == current_user.id)
        .order_by(ReferralReward.created_at.desc())
        .limit(50)
    )).all()
    await db.commit()
    return {
        "code": code.code if code else None,
        "kind": code.referral_kind if code else None,
        "friend_discount_paise": referral.BUYER_DISCOUNT_PAISE,
        "reward_paise": referral.REFERRER_REWARD_PAISE,
        "hold_days": referral.HOLD_DAYS,
        "credit_paise": balance,
        "rewards": [
            {"status": s, "amount_paise": a, "kind": k, "created_at": c.isoformat() if c else None}
            for s, a, k, c in rewards
        ],
    }
