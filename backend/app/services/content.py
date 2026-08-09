"""Content card service — CRUD + publish + product linking."""
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.content import ContentCard, ContentTag, ContentProduct, ContentStatus
from app.schemas.content import ContentCardCreate, ContentCardUpdate, ContentProductLink

logger = logging.getLogger(__name__)


class ContentService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_cards(
        self, status: Optional[ContentStatus] = None
    ) -> List[ContentCard]:
        stmt = select(ContentCard).options(
            selectinload(ContentCard.tags),
            selectinload(ContentCard.products).selectinload(ContentProduct.product),
        )
        if status:
            stmt = stmt.where(ContentCard.status == status)
        stmt = stmt.order_by(
            ContentCard.published_at.desc().nullslast(),
            ContentCard.created_at.desc(),
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_card(self, card_id: uuid.UUID) -> ContentCard:
        stmt = (
            select(ContentCard)
            .options(
                selectinload(ContentCard.tags),
                selectinload(ContentCard.products).selectinload(ContentProduct.product),
            )
            .where(ContentCard.id == card_id)
            # populate_existing: refresh identity-mapped instances so a mutation
            # (link/unlink/publish) returns fresh relationship data in the same
            # session instead of a stale, previously-loaded collection.
            .execution_options(populate_existing=True)
        )
        result = await self.db.execute(stmt)
        card = result.scalar_one_or_none()
        if not card:
            raise HTTPException(404, "Content card not found")
        return card

    async def create_card(
        self, data: ContentCardCreate, created_by: uuid.UUID
    ) -> ContentCard:
        card = ContentCard(
            type=data.type,
            media_url=data.media_url,
            thumbnail_url=data.thumbnail_url,
            caption=data.caption,
            created_by=created_by,
        )
        self.db.add(card)
        await self.db.flush()
        for tag in data.tags or []:
            self.db.add(
                ContentTag(
                    content_card_id=card.id,
                    tag_name=tag.tag_name,
                    tag_type=tag.tag_type,
                )
            )
        await self.db.commit()
        return await self.get_card(card.id)

    async def update_card(
        self, card_id: uuid.UUID, data: ContentCardUpdate
    ) -> ContentCard:
        card = await self.get_card(card_id)
        if data.caption is not None:
            card.caption = data.caption
        if data.media_url is not None:
            card.media_url = data.media_url
        if data.thumbnail_url is not None:
            card.thumbnail_url = data.thumbnail_url
        await self.db.commit()
        return await self.get_card(card_id)

    async def publish_card(self, card_id: uuid.UUID, redis=None) -> ContentCard:
        card = await self.get_card(card_id)
        card.status = ContentStatus.PUBLISHED
        card.published_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self._invalidate_feed_cache(redis)
        return await self.get_card(card_id)

    async def unpublish_card(self, card_id: uuid.UUID, redis=None) -> ContentCard:
        card = await self.get_card(card_id)
        card.status = ContentStatus.DRAFT
        card.published_at = None
        await self.db.commit()
        await self._invalidate_feed_cache(redis)
        return await self.get_card(card_id)

    async def delete_card(self, card_id: uuid.UUID) -> None:
        card = await self.get_card(card_id)
        await self.db.delete(card)
        await self.db.commit()

    async def link_product(
        self, card_id: uuid.UUID, data: ContentProductLink
    ) -> ContentCard:
        card = await self.get_card(card_id)
        # Remove existing link for this product if present
        existing = next(
            (cp for cp in card.products if cp.product_id == data.product_id), None
        )
        if existing:
            await self.db.delete(existing)
        cp = ContentProduct(
            content_card_id=card_id,
            product_id=data.product_id,
            display_order=data.display_order,
            position_x=data.position_x,
            position_y=data.position_y,
        )
        self.db.add(cp)
        await self.db.commit()
        return await self.get_card(card_id)

    async def unlink_product(
        self, card_id: uuid.UUID, product_id: uuid.UUID
    ) -> ContentCard:
        card = await self.get_card(card_id)
        for cp in card.products:
            if cp.product_id == product_id:
                await self.db.delete(cp)
                break
        await self.db.commit()
        return await self.get_card(card_id)

    @staticmethod
    async def _invalidate_feed_cache(redis) -> None:
        """Clear all feed:page:* keys from Redis when content changes."""
        if not redis:
            return
        try:
            keys = await redis.keys("feed:page:*")
            if keys:
                await redis.delete(*keys)
        except Exception as exc:
            logger.warning("Feed cache invalidation failed: %s", exc)
