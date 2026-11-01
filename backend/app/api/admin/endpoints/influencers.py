"""Console: collections, influencers, their performance and payouts."""
import re
import uuid
from datetime import datetime, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api.endpoints.collections import load_collection
from app.core.database import get_async_db
from app.models.coupon import Coupon, CouponType
from app.models.influencer import Collection, CollectionProduct, Influencer, InfluencerCommission
from app.models.order import Order
from app.services import influencer as svc

collections_router = APIRouter()
influencers_router = APIRouter()


def _slug(raw: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (raw or "").lower()).strip("-")[:80]
    if not svc.SLUG_RE.match(s):
        raise HTTPException(status_code=422, detail="Use at least two letters or numbers for the link")
    return s


# ── Collections ─────────────────────────────────────────────────────────────

class CollectionIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    slug: Optional[str] = Field(None, max_length=80)
    description: Optional[str] = Field(None, max_length=2000)
    is_published: Optional[bool] = None
    product_ids: Optional[List[uuid.UUID]] = Field(None, max_length=60)


def _collection_out(c: Collection) -> dict:
    return {"id": str(c.id), "slug": c.slug, "name": c.name, "description": c.description,
            "is_published": c.is_published, "product_ids": [str(i.product_id) for i in c.items],
            "updated_at": c.updated_at.isoformat() if c.updated_at else None}


async def _free_slug(db: AsyncSession, slug: str, own: Optional[uuid.UUID] = None) -> None:
    other = (await db.execute(select(Collection.id).where(Collection.slug == slug))).scalar_one_or_none()
    if other and other != own:
        raise HTTPException(status_code=409, detail=f"Another collection already uses the link /collections/{slug}")


def _set_products(c: Collection, ids: List[uuid.UUID]) -> None:
    seen, ordered = set(), []
    for i in ids:
        if i not in seen:
            seen.add(i); ordered.append(i)
    c.items = [CollectionProduct(collection_id=c.id, product_id=pid, position=n) for n, pid in enumerate(ordered)]


@collections_router.get("")
async def list_collections(db: AsyncSession = Depends(get_async_db)):
    rows = (await db.execute(select(Collection).order_by(Collection.created_at.desc()))).scalars().all()
    return [_collection_out(c) for c in rows]


@collections_router.post("", status_code=201)
async def create_collection(body: CollectionIn, db: AsyncSession = Depends(get_async_db)):
    slug = _slug(body.slug or body.name)
    await _free_slug(db, slug)
    c = Collection(id=uuid.uuid4(), name=body.name.strip(), slug=slug, description=(body.description or "").strip() or None,
                   is_published=bool(body.is_published))
    _set_products(c, body.product_ids or [])
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return _collection_out(c)


@collections_router.get("/{cid}")
async def get_collection(cid: uuid.UUID, db: AsyncSession = Depends(get_async_db)):
    c = await db.get(Collection, cid)
    if not c:
        raise HTTPException(status_code=404, detail="Collection not found")
    preview = await load_collection(db, c.slug, published_only=False)
    return {**_collection_out(c), "preview": preview.model_dump(mode="json") if preview else None}


@collections_router.put("/{cid}")
async def update_collection(cid: uuid.UUID, body: CollectionIn, db: AsyncSession = Depends(get_async_db)):
    c = await db.get(Collection, cid)
    if not c:
        raise HTTPException(status_code=404, detail="Collection not found")
    c.name = body.name.strip()
    if body.slug is not None:
        slug = _slug(body.slug)
        await _free_slug(db, slug, c.id)
        c.slug = slug
    if "description" in body.model_fields_set:
        c.description = (body.description or "").strip() or None
    if body.is_published is not None:
        c.is_published = body.is_published
    if body.product_ids is not None:
        await db.execute(delete(CollectionProduct).where(CollectionProduct.collection_id == c.id))
        await db.flush()
        db.expire(c, ["items"])
        _set_products(c, body.product_ids)
    await db.commit()
    await db.refresh(c)
    return _collection_out(c)


@collections_router.delete("/{cid}", status_code=204)
async def delete_collection(cid: uuid.UUID, db: AsyncSession = Depends(get_async_db)):
    c = await db.get(Collection, cid)
    if c:
        await db.delete(c)   # influencers pointing at it fall back to the home page
        await db.commit()


# ── Influencers ─────────────────────────────────────────────────────────────

class InfluencerIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    code: Optional[str] = Field(None, max_length=30)
    instagram: Optional[str] = Field(None, max_length=300)
    phone: Optional[str] = Field(None, max_length=20)
    collection_id: Optional[uuid.UUID] = None
    # A piece, a category or "/" instead of a collection. Empty: her collection.
    landing: Optional[str] = Field(None, max_length=300)
    commission_type: Literal["percent", "fixed"] = "percent"
    # Whole percent (10 = 10%), or paise per order for "fixed".
    commission_value: int = Field(0, ge=0, le=10_000_000)
    is_active: bool = True
    notes: Optional[str] = Field(None, max_length=2000)
    # Her own discount code. Created once; leave blank to have none.
    discount_code: Optional[str] = Field(None, max_length=20)
    discount_percent: Optional[int] = Field(None, ge=1, le=50)


def _influencer_out(i: Influencer, code: Optional[Coupon]) -> dict:
    return {"id": str(i.id), "name": i.name, "code": i.code, "instagram": i.instagram, "phone": i.phone,
            "collection_id": str(i.collection_id) if i.collection_id else None, "landing": i.landing,
            "commission_type": i.commission_type, "commission_value": i.commission_value,
            "is_active": i.is_active, "notes": i.notes,
            "discount_code": code.code if code else None, "discount_percent": code.value if code else None,
            "created_at": i.created_at.isoformat() if i.created_at else None}


async def _discount(db: AsyncSession, inf_id: uuid.UUID) -> Optional[Coupon]:
    return (await db.execute(select(Coupon).where(Coupon.influencer_id == inf_id).order_by(Coupon.created_at.desc()))).scalars().first()


async def _apply_discount(db: AsyncSession, inf: Influencer, body: InfluencerIn) -> None:
    raw = (body.discount_code or "").strip().upper()
    current = await _discount(db, inf.id)
    if not raw:
        return
    if not re.fullmatch(r"[A-Z0-9]{4,20}", raw):
        raise HTTPException(status_code=422, detail="A discount code is 4 to 20 letters or numbers")
    if current and current.code == raw:
        if body.discount_percent:
            current.value = body.discount_percent
        current.is_active = inf.is_active
        return
    if (await db.execute(select(Coupon.id).where(Coupon.code == raw))).scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"The code {raw} is already in use")
    if current:
        current.is_active = False   # one live code per influencer; the old one stops working
    db.add(Coupon(code=raw, type=CouponType.PERCENT, value=body.discount_percent or 10, min_order_value=0,
                  per_user_limit=1, is_active=inf.is_active, influencer_id=inf.id))


def _validate(body: InfluencerIn) -> None:
    if body.landing and not svc.safe_landing(body.landing):
        raise HTTPException(status_code=422, detail="Her link can open a piece, a category, a collection or the home page")
    if body.commission_type == "percent" and body.commission_value > 50:
        raise HTTPException(status_code=422, detail="A commission above 50% is almost certainly a typing slip")


@influencers_router.get("")
async def list_influencers(db: AsyncSession = Depends(get_async_db)):
    infs = (await db.execute(select(Influencer).order_by(Influencer.created_at.desc()))).scalars().all()
    return [_influencer_out(i, await _discount(db, i.id)) for i in infs]


@influencers_router.post("", status_code=201)
async def create_influencer(body: InfluencerIn, db: AsyncSession = Depends(get_async_db)):
    _validate(body)
    code = svc.normalise_code(body.code or body.name)
    if not code:
        raise HTTPException(status_code=422, detail="The link name needs at least two letters or numbers")
    if (await db.execute(select(Influencer.id).where(Influencer.code == code))).scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"zisun.in/r/{code} is already someone's link")
    inf = Influencer(id=uuid.uuid4(), name=body.name.strip(), code=code, instagram=body.instagram, phone=body.phone,
                     collection_id=body.collection_id, landing=svc.safe_landing(body.landing), commission_type=body.commission_type,
                     commission_value=body.commission_value, is_active=body.is_active, notes=body.notes)
    db.add(inf)
    await db.flush()
    await _apply_discount(db, inf, body)
    await db.commit()
    return _influencer_out(inf, await _discount(db, inf.id))


@influencers_router.put("/{iid}")
async def update_influencer(iid: uuid.UUID, body: InfluencerIn, db: AsyncSession = Depends(get_async_db)):
    _validate(body)
    inf = await db.get(Influencer, iid)
    if not inf:
        raise HTTPException(status_code=404, detail="Influencer not found")
    # The code is her link; changing it would break every post already out.
    for f in ("instagram", "phone", "collection_id", "commission_type", "commission_value", "is_active", "notes"):
        setattr(inf, f, getattr(body, f))
    inf.landing = svc.safe_landing(body.landing)
    inf.name = body.name.strip()
    await _apply_discount(db, inf, body)
    current = await _discount(db, inf.id)
    if current and not inf.is_active:
        current.is_active = False
    await db.commit()
    return _influencer_out(inf, await _discount(db, inf.id))


@influencers_router.get("/performance")
async def performance(start: datetime = Query(...), end: datetime = Query(...), db: AsyncSession = Depends(get_async_db)):
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    if end <= start or (end - start).days > 400:
        raise HTTPException(status_code=422, detail="Pick a range of up to a year")
    out = await svc.performance(db, start, end)
    await db.commit()   # settlement moved some rows
    return out


@influencers_router.get("/{iid}/commissions")
async def commissions(iid: uuid.UUID, db: AsyncSession = Depends(get_async_db)):
    await svc.settle(db)
    rows = (await db.execute(
        select(InfluencerCommission, Order.created_at, Order.status, Order.payment_method, Order.total_amount)
        .join(Order, Order.id == InfluencerCommission.order_id)
        .where(InfluencerCommission.influencer_id == iid).order_by(Order.created_at.desc()).limit(300)
    )).all()
    await db.commit()
    return [{"id": str(c.id), "order_id": str(c.order_id), "order_ref": str(c.order_id)[:8].upper(),
             "ordered_at": at.isoformat() if at else None, "order_status": getattr(st, "value", st),
             "payment_method": getattr(pm, "value", pm), "order_total_paise": total,
             "base_paise": c.base_paise, "amount_paise": c.amount_paise, "rule": c.rule, "status": c.status,
             "reason": c.reason, "earned_at": c.earned_at.isoformat() if c.earned_at else None,
             "paid_at": c.paid_at.isoformat() if c.paid_at else None, "payout_ref": c.payout_ref}
            for c, at, st, pm, total in rows]


class PayIn(BaseModel):
    ids: List[uuid.UUID] = Field(..., min_length=1, max_length=500)
    payout_ref: str = Field(..., min_length=1, max_length=80)


@influencers_router.post("/commissions/pay")
async def pay(body: PayIn, db: AsyncSession = Depends(get_async_db)):
    n = await svc.mark_paid(db, body.ids, body.payout_ref)
    await db.commit()
    return {"paid": n}
