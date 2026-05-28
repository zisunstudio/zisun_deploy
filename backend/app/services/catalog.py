"""Catalog service — categories, products, search, feed, media uploads."""
import json
import logging
import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.storage import generate_upload_presigned_url
from app.models.catalog import Category, Product, ProductMedia, ProductVariant
from app.schemas.catalog import ProductCreate

logger = logging.getLogger(__name__)


def _inject_effective_price(product: Product) -> None:
    """Mutate variant objects to add effective_price (not stored in DB)."""
    for variant in product.variants:
        variant.effective_price = product.base_price + variant.price_delta  # type: ignore[attr-defined]


class CatalogService:
    def __init__(self, db: AsyncSession, redis=None):
        self.db = db
        self.redis = redis

    # ── Categories ────────────────────────────────────────────────────────────

    async def list_categories(self) -> list:
        """List all active categories with product counts."""
        # Subquery for product count per category
        product_count_sq = (
            select(
                Product.category_id,
                func.count(Product.id).label("cnt"),
            )
            .where(Product.deleted_at.is_(None), Product.is_active.is_(True))
            .group_by(Product.category_id)
            .subquery()
        )

        stmt = (
            select(Category, func.coalesce(product_count_sq.c.cnt, 0).label("product_count"))
            .outerjoin(product_count_sq, Category.id == product_count_sq.c.category_id)
            .where(Category.is_active.is_(True))
            .order_by(Category.name)
        )
        result = await self.db.execute(stmt)
        rows = result.all()

        categories = []
        for row in rows:
            cat = row[0]
            cat.product_count = row[1]  # type: ignore[attr-defined]
            categories.append(cat)
        return categories

    async def get_category_by_slug(self, slug: str) -> Category:
        """Get category by slug, eagerly loading active non-deleted products."""
        stmt = (
            select(Category)
            .options(
                selectinload(Category.products).selectinload(Product.variants),
                selectinload(Category.products).selectinload(Product.media),
            )
            .where(Category.slug == slug, Category.is_active.is_(True))
        )
        result = await self.db.execute(stmt)
        category = result.scalar_one_or_none()
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")

        # Inject effective prices and filter only active products
        active_products = [p for p in category.products if p.is_active]
        for product in active_products:
            _inject_effective_price(product)
        category.products = active_products  # type: ignore[assignment]
        category.product_count = len(active_products)  # type: ignore[attr-defined]
        return category

    # ── Products ──────────────────────────────────────────────────────────────

    async def list_products(
        self,
        page: int = 1,
        limit: int = 20,
        category_id: Optional[str] = None,
        is_active: bool = True,
        sort_by: str = "newest",
    ) -> dict:
        """Paginated product listing with eager-loaded variants and media."""
        base_filter = [
            Product.deleted_at.is_(None),
            Product.is_active.is_(is_active),
        ]
        if category_id:
            base_filter.append(Product.category_id == category_id)

        # Count query
        count_stmt = select(func.count(Product.id)).where(*base_filter)
        total: int = (await self.db.execute(count_stmt)).scalar_one()

        # Data query
        stmt = (
            select(Product)
            .options(
                selectinload(Product.variants),
                selectinload(Product.media),
                selectinload(Product.category),
            )
            .where(*base_filter)
        )

        if sort_by == "price_asc":
            stmt = stmt.order_by(Product.base_price.asc())
        elif sort_by == "price_desc":
            stmt = stmt.order_by(Product.base_price.desc())
        else:  # newest
            stmt = stmt.order_by(Product.created_at.desc())

        stmt = stmt.limit(limit).offset((page - 1) * limit)
        result = await self.db.execute(stmt)
        products = list(result.scalars().all())

        for product in products:
            _inject_effective_price(product)

        return {"items": products, "total": total, "page": page, "limit": limit}

    async def get_product(self, product_id: uuid.UUID) -> Product:
        """Get a single product by ID with variants, media, and category."""
        stmt = (
            select(Product)
            .options(
                selectinload(Product.variants),
                selectinload(Product.media),
                selectinload(Product.category),
            )
            .where(
                Product.id == product_id,
                Product.deleted_at.is_(None),
            )
        )
        result = await self.db.execute(stmt)
        product = result.scalar_one_or_none()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")

        _inject_effective_price(product)
        return product

    # ── Search ────────────────────────────────────────────────────────────────

    async def search_products(self, q: str, page: int = 1, limit: int = 20) -> dict:
        """Full-text search using PostgreSQL tsvector, falling back to ILIKE."""
        base_filter = [
            Product.deleted_at.is_(None),
            Product.is_active.is_(True),
        ]

        # Try tsvector first (search_vector column populated by trigger/backfill)
        tsquery_expr = func.plainto_tsquery("english", q)

        # Check if we can use tsvector
        try:
            fts_filter = [
                *base_filter,
                text("search_vector @@ plainto_tsquery('english', :q)"),
            ]
            count_stmt = select(func.count(Product.id)).where(*base_filter).where(
                text("search_vector @@ plainto_tsquery('english', :q)")
            ).params(q=q)
            total: int = (await self.db.execute(count_stmt)).scalar_one()

            stmt = (
                select(Product)
                .options(
                    selectinload(Product.variants),
                    selectinload(Product.media),
                    selectinload(Product.category),
                )
                .where(*base_filter)
                .where(text("search_vector @@ plainto_tsquery('english', :q)"))
                .params(q=q)
                .order_by(
                    text("ts_rank(search_vector, plainto_tsquery('english', :q)) DESC").params(q=q)
                )
                .limit(limit)
                .offset((page - 1) * limit)
            )
            result = await self.db.execute(stmt)
            products = list(result.scalars().all())

            # If no results from FTS, fall back to ILIKE
            if total == 0:
                raise ValueError("no fts results")

        except Exception:
            # Fallback: ILIKE search on name and description
            ilike_pattern = f"%{q}%"
            from sqlalchemy import or_

            count_stmt = select(func.count(Product.id)).where(
                *base_filter,
                or_(
                    Product.name.ilike(ilike_pattern),
                    Product.description.ilike(ilike_pattern),
                ),
            )
            total = (await self.db.execute(count_stmt)).scalar_one()

            stmt = (
                select(Product)
                .options(
                    selectinload(Product.variants),
                    selectinload(Product.media),
                    selectinload(Product.category),
                )
                .where(
                    *base_filter,
                    or_(
                        Product.name.ilike(ilike_pattern),
                        Product.description.ilike(ilike_pattern),
                    ),
                )
                .order_by(Product.created_at.desc())
                .limit(limit)
                .offset((page - 1) * limit)
            )
            result = await self.db.execute(stmt)
            products = list(result.scalars().all())

        for product in products:
            _inject_effective_price(product)

        return {"items": products, "total": total, "page": page, "limit": limit}

    # ── Feed ─────────────────────────────────────────────────────────────────

    async def get_feed(self, page: int = 1, limit: int = 20, redis=None) -> list:
        """
        Curated feed. Phase 4: tries published ContentCards first, falls back
        to active products (Phase 2 behaviour). Results cached in Redis 300 s.
        """
        cache_redis = redis or self.redis
        cache_key = f"feed:page:{page}:limit:{limit}"

        if cache_redis:
            try:
                cached = await cache_redis.get(cache_key)
                if cached:
                    return json.loads(cached)
            except Exception as exc:
                logger.warning("Redis cache read failed: %s", exc)

        # ── Phase 4: ContentCard-driven feed ──────────────────────────────
        try:
            from app.models.content import ContentCard, ContentStatus, ContentProduct

            stmt = (
                select(ContentCard)
                .options(
                    selectinload(ContentCard.products)
                    .selectinload(ContentProduct.product)
                    .selectinload(Product.media),
                    selectinload(ContentCard.tags),
                )
                .where(ContentCard.status == ContentStatus.PUBLISHED)
                .order_by(ContentCard.published_at.desc())
                .offset((page - 1) * limit)
                .limit(limit)
            )
            result = await self.db.execute(stmt)
            cards = result.scalars().all()

            if cards:
                feed = []
                for card in cards:
                    active_products = [
                        cp.product
                        for cp in card.products
                        if cp.product
                        and cp.product.is_active
                        and not getattr(cp.product, "deleted_at", None)
                    ]
                    if not active_products:
                        continue
                    feed.append(
                        {
                            "id": str(card.id),
                            "type": card.type.value,
                            "media_url": card.media_url,
                            "thumbnail_url": card.thumbnail_url,
                            "caption": card.caption,
                            "products": [
                                {
                                    "id": str(p.id),
                                    "name": p.name,
                                    "base_price": p.base_price,
                                    "media": [
                                        {"url": m.url, "cdn_url": m.cdn_url}
                                        for m in p.media[:1]
                                    ],
                                }
                                for p in active_products
                            ],
                        }
                    )
                if feed:
                    if cache_redis:
                        try:
                            await cache_redis.set(
                                cache_key, json.dumps(feed), ex=300
                            )
                        except Exception as exc:
                            logger.warning("Redis cache write failed: %s", exc)
                    return feed
        except Exception as exc:
            logger.warning("ContentCard feed failed, falling back to products: %s", exc)

        # ── Fallback: product-based feed (Phase 2) ────────────────────────
        result_dict = await self.list_products(page=page, limit=limit, sort_by="newest")
        products = result_dict["items"]

        # Serialize to plain dicts for cache storage
        feed_items = []
        for p in products:
            item = {
                "id": str(p.id),
                "name": p.name,
                "base_price": p.base_price,
                "is_active": p.is_active,
                "category_id": str(p.category_id) if p.category_id else None,
                "media": [
                    {
                        "url": m.url,
                        "cdn_url": m.cdn_url,
                        "type": m.type.value if hasattr(m.type, "value") else str(m.type),
                    }
                    for m in p.media
                ],
                "variants": [
                    {
                        "id": str(v.id),
                        "sku": v.sku,
                        "size": v.size,
                        "color": v.color,
                        "stock": v.stock,
                        "price_delta": v.price_delta,
                        "effective_price": getattr(
                            v, "effective_price", p.base_price + v.price_delta
                        ),
                        "is_active": v.is_active,
                    }
                    for v in p.variants
                ],
            }
            feed_items.append(item)

        if cache_redis:
            try:
                await cache_redis.set(cache_key, json.dumps(feed_items), ex=300)
            except Exception as exc:
                logger.warning("Redis cache write failed: %s", exc)

        return feed_items

    # ── Media ─────────────────────────────────────────────────────────────────

    async def get_media_upload_url(
        self, product_id: uuid.UUID, content_type: str
    ) -> dict:
        """Generate a presigned R2 upload URL for a product image/video."""
        # Verify product exists
        await self.get_product(product_id)

        ext_map = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "video/mp4": "mp4",
        }
        ext = ext_map.get(content_type, "bin")
        key = f"products/{product_id}/{uuid.uuid4()}.{ext}"
        return generate_upload_presigned_url(key=key, content_type=content_type)

    # ── Create Product ────────────────────────────────────────────────────────

    async def create_product(self, product_in: ProductCreate) -> Product:
        """Create a product with its variants."""
        db_product = Product(
            name=product_in.name,
            description=product_in.description,
            base_price=product_in.base_price,
            category_id=product_in.category_id,
            vendor_id=product_in.vendor_id,
        )
        self.db.add(db_product)
        await self.db.flush()

        for variant_in in product_in.variants:
            db_variant = ProductVariant(
                product_id=db_product.id,
                sku=variant_in.sku,
                size=variant_in.size,
                color=variant_in.color,
                stock=variant_in.stock,
                price_delta=variant_in.price_delta,
            )
            self.db.add(db_variant)

        await self.db.commit()
        return await self.get_product(db_product.id)

    async def get_all_products(self, limit: int = 20, offset: int = 0):
        """Legacy helper kept for backward compatibility."""
        stmt = (
            select(Product)
            .options(selectinload(Product.variants))
            .where(Product.deleted_at.is_(None))
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        return result.scalars().all()
