"""The ZISUN Journal - see alembic 0020 for the why."""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

KINDS = ("style", "fabric", "occasion", "fit", "care", "founder", "collection", "explainer")
STATUSES = ("draft", "approved", "published")


class JournalArticle(Base):
    __tablename__ = "journal_articles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    dek: Mapped[Optional[str]] = mapped_column(String(300))
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    body_md: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    product_ids: Mapped[Optional[list]] = mapped_column(JSONB)
    cover_url: Mapped[Optional[str]] = mapped_column(String(1000))
    meta_title: Mapped[Optional[str]] = mapped_column(String(160))
    meta_description: Mapped[Optional[str]] = mapped_column(String(320))
    brief: Mapped[Optional[str]] = mapped_column(Text)
    search_intent: Mapped[Optional[str]] = mapped_column(String(200))
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
