"""ML infrastructure models — embeddings and search query logging.

Embeddings are stored as JSONB (float arrays) in Sprint 1.
Sprint 2 upgrades these columns to pgvector `vector` type via a
dedicated migration once the pgvector extension is confirmed available.
"""
import uuid
from typing import Optional
from sqlalchemy import String, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .base import BaseModel


class ProductEmbedding(BaseModel):
    __tablename__ = "product_embeddings"

    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    # Stored as JSON float arrays; upgraded to vector(384) in Sprint 2 migration
    text_embedding: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # Stored as JSON float arrays; upgraded to vector(1280) in Sprint 2 migration
    image_embedding: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    model_version: Mapped[str] = mapped_column(String(100), nullable=False, default="v1")


class SearchQuery(BaseModel):
    __tablename__ = "search_queries"

    query_text: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    result_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    clicked_product_ids: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    session_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("users.id"), nullable=True)
