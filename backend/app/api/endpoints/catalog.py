"""Catalog API endpoints — categories, products, search, feed, media uploads."""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_db
from app.core.redis import get_redis
from app.core.security import get_current_user, require_role
from app.schemas.catalog import (
    CategoryDetail,
    CategoryResponse,
    ProductCreate,
    ProductListResponse,
    ProductResponse,
    SearchResponse,
    SortBy,
)
from app.services.catalog import CatalogService
from app.services import truth as truth_svc

router = APIRouter()


# ── Categories ────────────────────────────────────────────────────────────────


@router.get("/categories", response_model=list[CategoryResponse], tags=["Catalog"])
async def list_categories(db: AsyncSession = Depends(get_async_db)):
    """List all active categories with product counts."""
    svc = CatalogService(db)
    return await svc.list_categories()


@router.get("/categories/{slug}", response_model=CategoryDetail, tags=["Catalog"])
async def get_category_by_slug(slug: str, db: AsyncSession = Depends(get_async_db)):
    """Get a single category by slug with its active products."""
    svc = CatalogService(db)
    return await svc.get_category_by_slug(slug)


# ── Products ──────────────────────────────────────────────────────────────────


@router.get("/products", response_model=ProductListResponse, tags=["Catalog"])
async def list_products(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    category_id: Optional[str] = Query(None, description="Filter by category UUID"),
    sort_by: SortBy = Query(SortBy.shelf),
    db: AsyncSession = Depends(get_async_db),
):
    """Paginated product listing with optional category filter and sort."""
    svc = CatalogService(db)
    result = await svc.list_products(
        page=page,
        limit=limit,
        category_id=category_id,
        sort_by=sort_by.value,
    )
    return result


@router.get("/products/{product_id}", response_model=ProductResponse, tags=["Catalog"])
async def get_product(product_id: uuid.UUID, db: AsyncSession = Depends(get_async_db)):
    """Get a single product with variants, media, and category."""
    svc = CatalogService(db)
    return await svc.get_product(product_id)


# ── Search ────────────────────────────────────────────────────────────────────


@router.get("/search", response_model=SearchResponse, tags=["Catalog"])
async def search_products(
    q: str = Query(..., min_length=1, description="Search query"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_async_db),
):
    """Full-text product search using PostgreSQL tsvector (ILIKE fallback)."""
    svc = CatalogService(db)
    result = await svc.search_products(q=q, page=page, limit=limit)
    return {**result, "query": q}


# ── Feed ─────────────────────────────────────────────────────────────────────


@router.get("/feed", tags=["Catalog"])
async def get_feed(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_async_db),
    redis=Depends(get_redis),
):
    """Curated feed of active products. Results cached in Redis for 5 minutes.

    Wrapped in the same envelope the catalogue endpoints use. The service
    returns a bare list, and the storefront reads `feedData.items` — so the home
    page silently rendered no products at all: `undefined` is falsy, the feed
    stayed empty, and the hero fell back to a static photograph. The page had no
    price on it anywhere, which is not a small styling problem on a shop.

    `total` is the size of this page, not of the feed: the service has no cheap
    total to offer and the client uses `items.length < limit` to decide whether
    to ask for more. Named honestly rather than invented.
    """
    svc = CatalogService(db, redis=redis)
    items = await svc.get_feed(page=page, limit=limit, redis=redis)
    return {"items": items, "total": len(items), "page": page, "limit": limit}


# ── Admin: media upload URL ───────────────────────────────────────────────────


@router.post(
    "/admin/products/{product_id}/media",
    tags=["Admin", "Catalog"],
)
async def get_media_upload_url(
    product_id: uuid.UUID,
    content_type: str = Query(
        "image/jpeg",
        description="MIME type: image/jpeg, image/png, image/webp, video/mp4",
    ),
    db: AsyncSession = Depends(get_async_db),
    _current_user=Depends(require_role("admin")),
):
    """
    Generate a presigned R2 upload URL for a product image or video.
    Requires admin role.
    """
    svc = CatalogService(db)
    return await svc.get_media_upload_url(product_id=product_id, content_type=content_type)


# ── Admin: create product (kept for backward compat) ─────────────────────────


@router.post("/admin/products", response_model=ProductResponse, status_code=201, tags=["Admin"])
async def create_product(
    product_in: ProductCreate,
    db: AsyncSession = Depends(get_async_db),
    _current_user=Depends(require_role("admin")),
):
    """Create a new product with variants (admin only)."""
    svc = CatalogService(db)
    return await svc.create_product(product_in)


# ── GET /truth — what the catalogue lets the site claim ───────────────────────

@router.get("/truth", tags=["Catalog"])
async def catalogue_truth(db: AsyncSession = Depends(get_async_db)):
    """The brand claims the live pieces support, and the facts that would
    unlock more. The storefront's home page, footer, meta descriptions and
    llms.txt are written from this - see services/truth.py."""
    from sqlalchemy import select
    from app.models.catalog import Product
    rows = (await db.execute(
        select(Product.fabric_composition, Product.craft, Product.origin, Product.will_rerun, Product.batch_size, Product.is_active)
        .where(Product.deleted_at.is_(None), Product.is_active.is_(True))
    )).all()
    t = truth_svc.compute([
        {"fabric_composition": r[0], "craft": r[1], "origin": r[2], "will_rerun": r[3], "batch_size": r[4], "is_active": r[5]}
        for r in rows
    ])
    # The free text she types is audited against the same facts: a category
    # description saying "handloom" over pieces that record none is the same
    # untruth as the old hard-coded home page, just entered by hand.
    from app.models.catalog import Category
    cats = (await db.execute(select(Category.name, Category.description).where(Category.is_active.is_(True)))).all()
    for name, desc in cats:
        t.unsupported += truth_svc.audit_text(f"Category \u201c{name}\u201d", desc, t)
    descs = (await db.execute(
        select(Product.name, Product.description).where(Product.deleted_at.is_(None), Product.is_active.is_(True))
    )).all()
    for name, desc in descs:
        t.unsupported += truth_svc.audit_text(name, desc, t)
    return truth_svc.as_dict(t)
