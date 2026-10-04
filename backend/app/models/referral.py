import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import BaseModel


class ReferralReward(BaseModel):
    """What a referral code's owner is owed for one order it brought.

    One row per referred order (order_id is unique), written when the order
    is placed and settled later by `services.referral.settle`:
    pending -> earned once the parcel has been delivered and the hold has
    passed, or pending -> void if it was cancelled or came back. A creator's
    earned cash becomes `paid` when the founder marks the UPI transfer done;
    a customer's earned reward is store credit and counts towards her
    balance the moment it is earned. If the order comes back after that, the
    reward becomes `reversed`: credit leaves the balance (which is derived),
    and cash already paid is shown as owed back against future earnings.
    """
    __tablename__ = "referral_rewards"

    coupon_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("coupons.id"), nullable=False, index=True)
    referrer_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), nullable=False, unique=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # "credit" | "cash"
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    # When settle() first saw the order DELIVERED. Orders carry no delivery
    # timestamp, so the hold is counted from here - late, never early.
    delivered_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    earned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    # Why a reward is void or reversed, in words the console can show.
    reason: Mapped[Optional[str]] = mapped_column(String(120))
    reversed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
