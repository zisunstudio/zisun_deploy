"""Public collections and the influencer short link.

A collection page shows only published collections and only live pieces,
in the order the founder set. `/influencers/{code}/landing` tells the
storefront's `/r/<code>` redirect where an influencer's link should land;
it records nothing - the visit is counted by the page it lands on.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core import memo
from app.core.database import get_async_db
from app.models.catalog import Product
from app.models.influencer import Collection, CollectionProduct, Influencer
from app.schemas.catalog import ProductResponse
from app.services.influencer import normalise_code

router = APIRouter()
TTL = 30


class CollectionPage(BaseModel):
    slug: str
    name: str
    description: Optional[str] = None
    products: List[ProductResponse]


async def load_collection(db: AsyncSession, slug: str, *, published_only: bool = True) -> Optional[CollectionPage]:
    q = select(Collection).where(Collection.slug == slug)
    if published_only:
        q = q.where(Collection.is_published.is_(True))
    col = (await db.execute(q)).scalar_one_or_none()
    if col is None:
        return None
    ids = [i.product_id for i in col.items]
    products = []
    if ids:
        rows = (await db.execute(
            select(Product).where(Product.id.in_(ids), Product.is_active.is_(True), Product.deleted_at.is_(None))
            .options(selectinload(Product.variants), selectinload(Product.media), selectinload(Product.category))
        )).scalars().all()
        by_id = {p.id: p for p in rows}
        products = [ProductResponse.model_validate(by_id[i], from_attributes=True) for i in ids if i in by_id]
    return CollectionPage(slug=col.slug, name=col.name, description=col.description, products=products)


@router.get("/catalog/collections/{slug}", response_model=CollectionPage, tags=["Catalog"])
async def get_collection(slug: str, db: AsyncSession = Depends(get_async_db)):
    slug = slug.strip().lower()

    async def load(db):
        return await load_collection(db, slug)
    page = await memo.cached(("collection", slug), TTL, lambda: load(db), memo.own_session(load))
    if page is None:
        raise HTTPException(status_code=404, detail="Collection not found")
    return page


@router.get("/influencers/{code}/landing", tags=["Catalog"])
async def influencer_landing(code: str, db: AsyncSession = Depends(get_async_db)):
    """Where `zisun.in/r/<code>` should land: her collection if it is
    published, the home page otherwise. 404 for an unknown or paused code,
    so a paused influencer's old link credits nobody."""
    c = normalise_code(code)
    if not c:
        raise HTTPException(status_code=404, detail="Unknown link")

    async def load(db):
        row = (await db.execute(
            select(Influencer.code, Collection.slug, Collection.is_published)
            .outerjoin(Collection, Collection.id == Influencer.collection_id)
            .where(Influencer.code == c, Influencer.is_active.is_(True))
        )).first()
        if row is None:
            return None
        return {"code": row.code, "path": f"/collections/{row.slug}" if row.slug and row.is_published else "/"}
    found = await memo.cached(("influencer_landing", c), TTL, lambda: load(db), memo.own_session(load))
    if found is None:
        raise HTTPException(status_code=404, detail="Unknown link")
    return found
