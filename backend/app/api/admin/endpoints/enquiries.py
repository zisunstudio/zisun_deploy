"""The founder's side of the WhatsApp order book."""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_db
from app.models.enquiry import EnquiryStatus, WhatsAppEnquiry

router = APIRouter()


def _out(e: WhatsAppEnquiry) -> dict:
    return {
        "id": str(e.id), "created_at": e.created_at.isoformat(), "updated_at": e.updated_at.isoformat(),
        "status": e.status, "source": e.source,
        "product_id": str(e.product_id) if e.product_id else None, "variant_id": str(e.variant_id) if e.variant_id else None,
        "product_name": e.product_name, "size": e.size, "colour": e.colour, "quantity": e.quantity,
        "total_paise": e.total_paise, "items": e.items, "order_amount_paise": e.order_amount_paise, "note": e.note,
        "session_id": e.session_id,
    }


@router.get("")
async def list_enquiries(
    status: Optional[EnquiryStatus] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_async_db),
):
    stmt = select(WhatsAppEnquiry).order_by(WhatsAppEnquiry.created_at.desc()).limit(limit)
    if status:
        stmt = stmt.where(WhatsAppEnquiry.status == status.value)
    rows = (await db.execute(stmt)).scalars().all()
    return [_out(e) for e in rows]


class EnquiryPatch(BaseModel):
    status: Optional[EnquiryStatus] = None
    order_amount_paise: Optional[int] = Field(default=None, ge=0, le=100_000_000)
    note: Optional[str] = Field(default=None, max_length=2000)


@router.patch("/{enquiry_id}")
async def update_enquiry(enquiry_id: uuid.UUID, body: EnquiryPatch, db: AsyncSession = Depends(get_async_db)):
    e = (await db.execute(select(WhatsAppEnquiry).where(WhatsAppEnquiry.id == enquiry_id))).scalar_one_or_none()
    if not e:
        raise HTTPException(404, "Enquiry not found")
    if body.status is not None:
        e.status = body.status.value
        # Marking it ordered without saying what was paid defaults to what the
        # customer had in front of them; she can correct it.
        if body.status == EnquiryStatus.ORDERED and body.order_amount_paise is None and e.order_amount_paise is None:
            e.order_amount_paise = e.total_paise
    if body.order_amount_paise is not None:
        e.order_amount_paise = body.order_amount_paise
    if body.note is not None:
        e.note = body.note.strip() or None
    e.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(e)
    return _out(e)
