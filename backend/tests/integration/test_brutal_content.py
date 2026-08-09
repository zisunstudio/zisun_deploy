"""BRUTAL real-database tests for the content service — card CRUD, publish/
unpublish with feed-cache invalidation, and product linking (incl. re-link
dedup). Auto-skips if Postgres is unreachable.
"""
import uuid

import pytest
import fakeredis.aioredis
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.core.config import settings
from app.models.catalog import Product
from app.models.user import User, UserRole
from app.models.content import ContentStatus, ContentType, TagType
from app.schemas.content import (
    ContentCardCreate, ContentCardUpdate, ContentTagCreate, ContentProductLink,
)
from app.services.content import ContentService


_engine = create_async_engine(settings.async_database_uri, poolclass=NullPool)
_Session = async_sessionmaker(bind=_engine, expire_on_commit=False, class_=AsyncSession)


def _db_reachable_sync() -> bool:
    try:
        import psycopg2
        psycopg2.connect(
            host=settings.POSTGRES_SERVER, port=settings.POSTGRES_PORT,
            user=settings.POSTGRES_USER, password=settings.POSTGRES_PASSWORD,
            dbname=settings.POSTGRES_DB, connect_timeout=2,
        ).close()
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _db_reachable_sync(), reason="Postgres not reachable")

TABLES = ["content_products", "content_tags", "content_cards", "products", "users"]


@pytest.fixture
async def db():
    async with _Session() as s:
        await s.execute(text(f"TRUNCATE {', '.join(TABLES)} RESTART IDENTITY CASCADE"))
        await s.commit()
        yield s


async def mk_admin(db) -> User:
    u = User(phone=f"+9198{uuid.uuid4().int % 10**8:08d}", role=UserRole.admin)
    db.add(u); await db.flush()
    await db.commit()
    return u


@pytest.fixture
def redis():
    return fakeredis.aioredis.FakeRedis(decode_responses=True)


async def mk_product(db, name="Kurta"):
    p = Product(name=name, base_price=100000, is_active=True)
    db.add(p); await db.flush()
    return p


def card_create(**kw):
    return ContentCardCreate(
        type=kw.get("type", ContentType.IMAGE),
        media_url=kw.get("media_url", "https://cdn/x.jpg"),
        thumbnail_url=kw.get("thumbnail_url"),
        caption=kw.get("caption", "Onam edit"),
        tags=kw.get("tags", []),
    )


class TestContentCRUD:
    async def test_create_with_tags_persists(self, db):
        svc = ContentService(db)
        admin = await mk_admin(db)
        card = await svc.create_card(
            card_create(tags=[
                ContentTagCreate(tag_name="onam", tag_type=TagType.occasion),
                ContentTagCreate(tag_name="summer", tag_type=TagType.season),
            ]),
            created_by=admin.id,
        )
        assert card.status == ContentStatus.DRAFT
        assert {t.tag_name for t in card.tags} == {"onam", "summer"}

    async def test_get_missing_404(self, db):
        svc = ContentService(db)
        with pytest.raises(HTTPException) as ei:
            await svc.get_card(uuid.uuid4())
        assert ei.value.status_code == 404

    async def test_partial_update(self, db):
        svc = ContentService(db)
        admin = await mk_admin(db)
        card = await svc.create_card(card_create(caption="old"), created_by=admin.id)
        updated = await svc.update_card(card.id, ContentCardUpdate(caption="new caption"))
        assert updated.caption == "new caption"
        assert updated.media_url == "https://cdn/x.jpg"  # untouched

    async def test_delete(self, db):
        svc = ContentService(db)
        admin = await mk_admin(db)
        card = await svc.create_card(card_create(), created_by=admin.id)
        await svc.delete_card(card.id)
        with pytest.raises(HTTPException) as ei:
            await svc.get_card(card.id)
        assert ei.value.status_code == 404


class TestPublishFlow:
    async def test_publish_sets_status_and_invalidates_cache(self, db, redis):
        # Seed a stale feed cache entry
        await redis.set("feed:page:1:limit:20", "[]", ex=300)
        await redis.set("unrelated:key", "keep", ex=300)
        svc = ContentService(db)
        admin = await mk_admin(db)
        card = await svc.create_card(card_create(), created_by=admin.id)
        published = await svc.publish_card(card.id, redis=redis)
        assert published.status == ContentStatus.PUBLISHED
        assert published.published_at is not None
        # feed cache cleared, unrelated key survives
        assert await redis.get("feed:page:1:limit:20") is None
        assert await redis.get("unrelated:key") == "keep"

    async def test_unpublish_resets(self, db, redis):
        svc = ContentService(db)
        admin = await mk_admin(db)
        card = await svc.create_card(card_create(), created_by=admin.id)
        await svc.publish_card(card.id, redis=redis)
        unpub = await svc.unpublish_card(card.id, redis=redis)
        assert unpub.status == ContentStatus.DRAFT
        assert unpub.published_at is None

    async def test_invalidate_without_redis_is_noop(self, db):
        svc = ContentService(db)
        admin = await mk_admin(db)
        card = await svc.create_card(card_create(), created_by=admin.id)
        # No redis passed — must not raise
        published = await svc.publish_card(card.id, redis=None)
        assert published.status == ContentStatus.PUBLISHED


class TestProductLinking:
    async def test_link_and_unlink(self, db):
        svc = ContentService(db)
        admin = await mk_admin(db)
        p = await mk_product(db)
        await db.commit()
        card = await svc.create_card(card_create(), created_by=admin.id)
        linked = await svc.link_product(
            card.id, ContentProductLink(product_id=p.id, display_order=1,
                                        position_x=0.5, position_y=0.5))
        assert len(linked.products) == 1 and linked.products[0].product_id == p.id

        unlinked = await svc.unlink_product(card.id, p.id)
        assert unlinked.products == []

    async def test_relinking_same_product_replaces_not_duplicates(self, db):
        svc = ContentService(db)
        admin = await mk_admin(db)
        p = await mk_product(db)
        await db.commit()
        card = await svc.create_card(card_create(), created_by=admin.id)
        await svc.link_product(card.id, ContentProductLink(product_id=p.id, display_order=1))
        relinked = await svc.link_product(
            card.id, ContentProductLink(product_id=p.id, display_order=9))
        # Still exactly one link, with the updated display_order
        assert len(relinked.products) == 1
        assert relinked.products[0].display_order == 9
