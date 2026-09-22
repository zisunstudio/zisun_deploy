"""The Journal, as the public reads it. Published articles only."""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_async_db
from app.models.catalog import Product
from app.models.journal import JournalArticle
from app.schemas.catalog import ProductResponse

router = APIRouter()


class ArticleCard(BaseModel):
    id: uuid.UUID
    slug: str
    title: str
    dek: Optional[str] = None
    kind: str
    cover_url: Optional[str] = None
    published_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Article(ArticleCard):
    body_md: str
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    search_intent: Optional[str] = None
    updated_at: datetime
    # The pieces the article earns the right to recommend - resolved fresh,
    # so price, stock and facts are the pieces' own, never the article's.
    products: list[ProductResponse] = []


async def _products(db: AsyncSession, ids: Optional[list]) -> list[Product]:
    if not ids:
        return []
    wanted = [uuid.UUID(str(i)) for i in ids if i]
    rows = (await db.execute(
        select(Product).options(selectinload(Product.variants), selectinload(Product.media), selectinload(Product.category))
        .where(Product.id.in_(wanted), Product.deleted_at.is_(None), Product.is_active.is_(True))
    )).scalars().all()
    by = {p.id: p for p in rows}
    return [by[i] for i in wanted if i in by]


@router.get("", response_model=list[ArticleCard])
async def list_articles(kind: Optional[str] = None, limit: int = Query(50, le=100), db: AsyncSession = Depends(get_async_db)):
    stmt = select(JournalArticle).where(JournalArticle.status == "published").order_by(JournalArticle.published_at.desc()).limit(limit)
    if kind:
        stmt = stmt.where(JournalArticle.kind == kind)
    return (await db.execute(stmt)).scalars().all()


# Declared before /{slug}: a path route only wins if it is registered first.
@router.get("/for-product/{product_id}", response_model=list[ArticleCard])
async def articles_for_product(product_id: uuid.UUID, db: AsyncSession = Depends(get_async_db)):
    """Published articles that recommend this piece - the product page's
    'From the journal' links, which are also the internal links search
    engines follow from a product back into the knowledge layer."""
    rows = (await db.execute(
        select(JournalArticle).where(JournalArticle.status == "published", JournalArticle.product_ids.contains([str(product_id)]))
        .order_by(JournalArticle.published_at.desc()).limit(4)
    )).scalars().all()
    return rows


@router.get("/{slug}", response_model=Article)
async def get_article(slug: str, db: AsyncSession = Depends(get_async_db)):
    a = (await db.execute(select(JournalArticle).where(JournalArticle.slug == slug, JournalArticle.status == "published"))).scalar_one_or_none()
    if not a:
        raise HTTPException(404, "No such article")
    out = Article.model_validate(a)
    out.products = [ProductResponse.model_validate(p) for p in await _products(db, a.product_ids)]
    return out
