"""Admin analytics housekeeping: forget the shop's own devices."""
import logging

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_db
from app.models.analytics import AnalyticsEvent

router = APIRouter()
logger = logging.getLogger(__name__)


@router.delete("/visitors/{visitor_id}")
async def forget_visitor(visitor_id: str, db: AsyncSession = Depends(get_async_db)):
    """Delete every event one device recorded.

    The founder's own browsing was counted as customers until the device
    was marked as the shop's (lib/internal.ts); this removes what it
    recorded before that. The id is the device's own `visitor` value, which
    only that device knows, so nothing of a customer's can be named here.
    """
    vid = visitor_id.strip()
    if len(vid) < 8 or len(vid) > 80:
        raise HTTPException(status_code=422, detail="That does not look like a device id")
    result = await db.execute(sa.delete(AnalyticsEvent).where(AnalyticsEvent.properties.op("->>")("visitor") == vid))
    await db.commit()
    logger.info("analytics: forgot visitor %s (%d events)", vid[:8], result.rowcount or 0)
    return {"deleted": int(result.rowcount or 0)}
