"""Referral codes that earn for the person who shares them.

Two kinds of owner, one mechanism (a Coupon with an owner):

- **customer**: anyone whose website order has been delivered gets her own
  code. A friend who uses it takes Rs 100 off her first order; when that
  order is delivered and the hold has passed, the owner earns Rs 150 of
  store credit.
- **creator**: a code the founder issues by hand to someone with an
  audience. Same Rs 100 off for the buyer; the creator earns Rs 150 in cash,
  paid by UPI and marked paid in the console.

Rules that keep it from leaking money:

- A referral code works only on a buyer's *first* order, never for the
  code's owner, and only once per buyer. A code shared on a coupon site
  therefore buys new customers or nothing.
- Nothing is earned until the whole sale is finished: the parcel delivered
  and HOLD_DAYS passed. The hold covers ZISUN's own exchange process end to
  end - 24 hours to raise it, 3 days to post the piece back, up to 8 days in
  transit - so a reward is never earned on a sale that is still open. A
  cancelled, refused or returned order earns nothing.
- If an order comes back *after* its reward was earned, the reward is
  reversed. Credit simply leaves the balance (it is derived). Cash already
  paid to a creator is listed in the console to deduct from her next payment.
- A code is for a new household, not a new phone number: it is refused when
  the parcel is going to an address the code's owner has used, or to an
  address that has already received a ZISUN order.
- Store credit is never a stored balance. It is earned rewards minus what
  live orders have spent, so a cancelled order gives its credit back by
  being cancelled, with no reversal to forget.

Settlement happens when someone reads: the owner's account, the console's
referral page, or a checkout that might spend credit. No beat schedule, so
no Redis commands (CLAUDE.md: the Upstash budget).
"""
from __future__ import annotations

import logging
import re
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.coupon import Coupon, CouponType
from app.models.order import Order, OrderStatus
from app.models.referral import ReferralReward
from app.models.user import User

logger = logging.getLogger(__name__)

BUYER_DISCOUNT_PAISE = 10_000      # Rs 100 off for the friend
REFERRER_REWARD_PAISE = 15_000     # Rs 150 to the person who shared
MIN_ORDER_PAISE = 50_000           # a referral code needs a Rs 500 bag
HOLD_DAYS = 14

KIND_CUSTOMER = "customer"
KIND_CREATOR = "creator"

# An order that is not (or is no longer) a sale.
_DEAD = (OrderStatus.CANCELLED, OrderStatus.FAILED_PAYMENT)
_VOID = (OrderStatus.CANCELLED, OrderStatus.FAILED_PAYMENT, OrderStatus.RETURNED)

_CODE_RE = re.compile(r"^[A-Z0-9]{4,20}$")


def code_stem(name: Optional[str]) -> str:
    """The letters a code starts with: her first name, up to six letters."""
    first = (name or "").strip().split(" ")[0] if name else ""
    letters = re.sub(r"[^A-Za-z]", "", first).upper()[:6]
    return letters if len(letters) >= 2 else "ZISUN"


def normalise_code(code: str) -> str:
    """Upper-case, no spaces. Raises 400 if it is not 4-20 letters or digits."""
    c = re.sub(r"\s+", "", code or "").upper()
    if not _CODE_RE.match(c):
        raise HTTPException(400, "A code is 4 to 20 letters or digits, no spaces or symbols.")
    return c


def reward_kind(coupon: Coupon) -> str:
    """What the owner earns: store credit for a customer, cash for a creator."""
    return "cash" if coupon.referral_kind == KIND_CREATOR else "credit"


def settle_decision(status: OrderStatus, delivered_seen_at: Optional[datetime], now: datetime,
                    current: str = "pending") -> tuple[str, Optional[datetime]]:
    """Where a reward goes next, given its order's status.

    Returns (new_status, delivered_seen_at). Pure, so the rule is tested
    without a database. `current` is the reward's status now: a pending
    reward can become earned or void; an earned or paid one can only be
    reversed, and only by its order coming back.
    """
    if current in ("earned", "paid"):
        return ("reversed" if status in _VOID else current), delivered_seen_at
    if current != "pending":
        return current, delivered_seen_at
    if status in _VOID:
        return "void", delivered_seen_at
    if status == OrderStatus.DELIVERED:
        seen = delivered_seen_at or now
        if now - seen >= timedelta(days=HOLD_DAYS):
            return "earned", seen
        return "pending", seen
    return "pending", delivered_seen_at


_REASON = {
    OrderStatus.CANCELLED: "The order was cancelled",
    OrderStatus.FAILED_PAYMENT: "The payment did not go through",
    OrderStatus.RETURNED: "The order came back",
}


def address_key(line1: Optional[str], pincode: Optional[str]) -> str:
    """One household, however it was typed: letters and digits of the first line, plus the pincode."""
    return re.sub(r"[^a-z0-9]", "", (line1 or "").lower()) + "|" + re.sub(r"\D", "", pincode or "")


# ── Using a code at checkout ─────────────────────────────────────────────────

async def check_buyer(db: AsyncSession, coupon: Coupon, buyer_id: Optional[uuid.UUID]) -> None:
    """Refuse a referral code its rules do not allow. No-op for other coupons."""
    if coupon.owner_user_id is None or buyer_id is None:
        return
    if coupon.owner_user_id == buyer_id:
        raise HTTPException(400, "This is your own code - share it with a friend instead.")
    prior = await db.scalar(
        select(func.count(Order.id)).where(
            Order.user_id == buyer_id,
            Order.status.notin_(_DEAD),
            Order.channel_id.is_(None),
        )
    )
    if prior:
        raise HTTPException(400, "A friend's code is for a first order.")


async def check_address(db: AsyncSession, coupon: Coupon, buyer_id: Optional[uuid.UUID],
                        line1: Optional[str], pincode: Optional[str]) -> None:
    """Refuse a referral code for a household that is not new to ZISUN.

    The first-order rule is checked on the buyer's account, and an account is
    a phone number - so a second SIM was a second "first order", and a code
    owner could order to her own door under another number and be paid for
    referring herself. The address closes both.
    """
    from app.models.order import Address  # noqa: PLC0415

    if coupon.owner_user_id is None or not (line1 and pincode):
        return
    key = address_key(line1, pincode)
    pin = re.sub(r"\D", "", pincode)
    rows = (await db.execute(
        select(Address.user_id, Address.line1, Address.pincode, Address.id).where(Address.pincode == pin)
    )).all()
    same = [r for r in rows if address_key(r.line1, r.pincode) == key]
    if any(r.user_id == coupon.owner_user_id for r in same):
        raise HTTPException(400, "This code belongs to someone at this address, so it cannot be used here.")
    others = [r.id for r in same if r.user_id != buyer_id]
    if others:
        prior = await db.scalar(select(func.count(Order.id)).where(
            Order.address_id.in_(others), Order.status.notin_(_DEAD), Order.channel_id.is_(None)))
        if prior:
            raise HTTPException(400, "A friend's code is for a first order, and this address has ordered from us before.")


async def record(db: AsyncSession, coupon: Optional[Coupon], order: Order) -> None:
    """Write the pending reward for an order placed with someone's code."""
    if coupon is None or coupon.owner_user_id is None:
        return
    db.add(ReferralReward(
        coupon_id=coupon.id,
        referrer_user_id=coupon.owner_user_id,
        order_id=order.id,
        kind=reward_kind(coupon),
        amount_paise=REFERRER_REWARD_PAISE,
        status="pending",
    ))


# ── Settling and balances ────────────────────────────────────────────────────

async def settle(db: AsyncSession, referrer_id: Optional[uuid.UUID] = None) -> int:
    """Move rewards on: pending to earned or void, earned or paid to reversed.

    Returns how many changed. Caller commits.
    """
    now = datetime.now(timezone.utc)
    stmt = (
        select(ReferralReward, Order.status)
        .join(Order, Order.id == ReferralReward.order_id)
        .where(ReferralReward.status.in_(("pending", "earned", "paid")))
    )
    if referrer_id is not None:
        stmt = stmt.where(ReferralReward.referrer_user_id == referrer_id)
    changed = 0
    for reward, status in (await db.execute(stmt)).all():
        new_status, seen = settle_decision(status, reward.delivered_seen_at, now, reward.status)
        if seen != reward.delivered_seen_at:
            reward.delivered_seen_at = seen
        if new_status != reward.status:
            if new_status == "earned":
                reward.earned_at = now
            elif new_status == "void":
                reward.reason = _REASON.get(status, "The order did not complete")
            elif new_status == "reversed":
                reward.reversed_at = now
                reward.reason = ("Paid, then the order came back" if reward.status == "paid"
                                 else "Earned, then the order came back")
            reward.status = new_status
            changed += 1
    return changed


async def credit_balance(db: AsyncSession, user_id: uuid.UUID) -> int:
    """Store credit she can spend now, in paise. Settle first."""
    earned = await db.scalar(
        select(func.coalesce(func.sum(ReferralReward.amount_paise), 0)).where(
            ReferralReward.referrer_user_id == user_id,
            ReferralReward.kind == "credit",
            ReferralReward.status == "earned",
        )
    ) or 0
    spent = await db.scalar(
        select(func.coalesce(func.sum(Order.credit_applied), 0)).where(
            Order.user_id == user_id,
            Order.status.notin_(_DEAD),
        )
    ) or 0
    return max(0, int(earned) - int(spent))


# ── Issuing codes ────────────────────────────────────────────────────────────

async def _unique_code(db: AsyncSession, stem: str) -> str:
    for _ in range(20):
        code = f"{stem}{secrets.randbelow(900) + 100}"
        if not await db.scalar(select(Coupon.id).where(Coupon.code == code)):
            return code
    return f"{stem}{secrets.token_hex(3).upper()}"


def _referral_coupon(code: str, owner: User, kind: str, label: Optional[str]) -> Coupon:
    return Coupon(
        code=code,
        type=CouponType.FLAT,
        value=BUYER_DISCOUNT_PAISE,
        min_order_value=MIN_ORDER_PAISE,
        usage_limit=None,
        per_user_limit=1,
        is_active=True,
        is_referral=True,
        owner_user_id=owner.id,
        referral_kind=kind,
        owner_label=label,
    )


async def customer_code(db: AsyncSession, user: User) -> Optional[Coupon]:
    """Her own code, made the first time she asks after a delivered order.

    None if she has no delivered website order yet: a code means "I have
    worn this and I vouch for it", which needs the parcel in her hands.
    """
    existing = await db.scalar(
        select(Coupon).where(Coupon.owner_user_id == user.id, Coupon.is_referral.is_(True))
        .order_by(Coupon.created_at)
        .limit(1)
    )
    if existing is not None:
        return existing
    delivered = await db.scalar(
        select(func.count(Order.id)).where(
            Order.user_id == user.id,
            Order.status == OrderStatus.DELIVERED,
            Order.channel_id.is_(None),
        )
    )
    if not delivered:
        return None
    coupon = _referral_coupon(await _unique_code(db, code_stem(user.name)), user, KIND_CUSTOMER, user.name)
    db.add(coupon)
    await db.flush()
    return coupon


async def create_creator_code(db: AsyncSession, *, name: str, phone: str, code: Optional[str]) -> Coupon:
    """A code for a creator, issued by the founder. Finds or creates her user by phone."""
    user = await db.scalar(select(User).where(User.phone == phone))
    if user is None:
        user = User(phone=phone, name=name)
        db.add(user)
        await db.flush()
    elif not user.name:
        user.name = name
    chosen = normalise_code(code) if code else await _unique_code(db, code_stem(name))
    if await db.scalar(select(Coupon.id).where(Coupon.code == chosen)):
        raise HTTPException(409, f"{chosen} is already a code. Choose another.")
    coupon = _referral_coupon(chosen, user, KIND_CREATOR, name)
    db.add(coupon)
    await db.flush()
    return coupon


# ── What the console shows ───────────────────────────────────────────────────

@dataclass
class CodeSummary:
    code: str
    kind: str
    owner: str
    phone: Optional[str]
    active: bool
    orders: int
    pending_paise: int
    earned_paise: int      # earned and not yet paid (cash) / credited (credit)
    paid_paise: int
    owed_back_paise: int = 0   # cash paid before the order came back


async def summaries(db: AsyncSession) -> list[CodeSummary]:
    rows = (await db.execute(
        select(Coupon, User)
        .join(User, User.id == Coupon.owner_user_id)
        .where(Coupon.owner_user_id.isnot(None))
        .order_by(Coupon.created_at.desc())
    )).all()
    agg = {
        cid: (n, pend, earned, paid, back)
        for cid, n, pend, earned, paid, back in (await db.execute(
            select(
                ReferralReward.coupon_id,
                func.count(ReferralReward.id).filter(ReferralReward.status.notin_(("void", "reversed", "recovered"))),
                func.coalesce(func.sum(ReferralReward.amount_paise).filter(ReferralReward.status == "pending"), 0),
                func.coalesce(func.sum(ReferralReward.amount_paise).filter(ReferralReward.status == "earned"), 0),
                func.coalesce(func.sum(ReferralReward.amount_paise).filter(ReferralReward.status == "paid"), 0),
                func.coalesce(func.sum(ReferralReward.amount_paise).filter(
                    ReferralReward.status == "reversed", ReferralReward.paid_at.isnot(None)), 0),
            ).group_by(ReferralReward.coupon_id)
        )).all()
    }
    out = []
    for coupon, user in rows:
        n, pend, earned, paid, back = agg.get(coupon.id, (0, 0, 0, 0, 0))
        out.append(CodeSummary(
            code=coupon.code, kind=coupon.referral_kind or KIND_CUSTOMER,
            owner=coupon.owner_label or user.name or "—", phone=user.phone,
            active=coupon.is_active, orders=int(n),
            pending_paise=int(pend), earned_paise=int(earned), paid_paise=int(paid), owed_back_paise=int(back),
        ))
    return out


async def mark_paid(db: AsyncSession, reward_ids: list[uuid.UUID]) -> int:
    """Mark earned cash rewards as paid. Credit is never 'paid'; it is spent."""
    rewards = (await db.execute(
        select(ReferralReward).where(
            and_(ReferralReward.id.in_(reward_ids), ReferralReward.kind == "cash", ReferralReward.status == "earned")
        )
    )).scalars().all()
    now = datetime.now(timezone.utc)
    for r in rewards:
        r.status = "paid"
        r.paid_at = now
    return len(rewards)


async def mark_recovered(db: AsyncSession, reward_ids: list[uuid.UUID]) -> int:
    """Cash that was paid before an order came back has been deducted from a later payment."""
    rewards = (await db.execute(
        select(ReferralReward).where(
            and_(ReferralReward.id.in_(reward_ids), ReferralReward.status == "reversed", ReferralReward.paid_at.isnot(None))
        )
    )).scalars().all()
    for r in rewards:
        r.status = "recovered"
    return len(rewards)
