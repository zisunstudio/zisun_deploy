"""The storefront records a WhatsApp enquiry the moment the link is tapped.

Public and unauthenticated - the tap happens before anyone signs in - so it
accepts only what the page has in front of it, caps every field, and writes
one row. The general rate limit applies. Nothing here can read anything.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_db
from app.models.enquiry import EnquirySource, WhatsAppEnquiry

router = APIRouter()


class EnquiryItem(BaseModel):
    product_id: Optional[uuid.UUID] = None
    name: str = Field(..., max_length=255)
    size: Optional[str] = Field(default=None, max_length=50)
    colour: Optional[str] = Field(default=None, max_length=120)
    quantity: int = Field(default=1, ge=1, le=99)
    price_paise: int = Field(default=0, ge=0, le=100_000_000)


class EnquiryIn(BaseModel):
    source: EnquirySource
    session_id: Optional[str] = Field(default=None, max_length=255)
    product_id: Optional[uuid.UUID] = None
    variant_id: Optional[uuid.UUID] = None
    product_name: Optional[str] = Field(default=None, max_length=255)
    size: Optional[str] = Field(default=None, max_length=50)
    colour: Optional[str] = Field(default=None, max_length=120)
    quantity: int = Field(default=1, ge=1, le=99)
    total_paise: int = Field(default=0, ge=0, le=100_000_000)
    items: Optional[list[EnquiryItem]] = Field(default=None, max_length=50)


@router.post("", status_code=201)
async def record_enquiry(body: EnquiryIn, db: AsyncSession = Depends(get_async_db)):
    row = WhatsAppEnquiry(
        session_id=body.session_id,
        source=body.source.value,
        product_id=body.product_id,
        variant_id=body.variant_id,
        product_name=(body.product_name or "").strip() or None,
        size=(body.size or "").strip() or None,
        colour=(body.colour or "").strip() or None,
        quantity=body.quantity,
        total_paise=body.total_paise,
        items=[i.model_dump(mode="json") for i in body.items] if body.items else None,
    )
    db.add(row)
    await db.commit()
    return {"id": str(row.id)}
