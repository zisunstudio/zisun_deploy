"""Analytics event ingestion — batch, non-blocking."""
import logging
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel


logger = logging.getLogger(__name__)

router = APIRouter()


class AnalyticsEventIn(BaseModel):
    event_type: str
    session_id: Optional[str] = None
    properties: dict = {}


class AnalyticsBatch(BaseModel):
    events: List[AnalyticsEventIn]


async def _write_events(events: List[AnalyticsEventIn], user_id) -> None:
    """Fire-and-forget write on the shared pool.

    This used to build a brand-new engine per batch and dispose of it after:
    a fresh TLS connection to a database 900 ms away for every beacon, a
    fresh client against Supavisor's fifteen-client cap, and none of the
    pooler options the shared engine carries. Page views are the most
    frequent request the api receives, so under a burst of traffic this was
    the thing most likely to exhaust the connection budget the checkout
    needed. The shared session factory reuses the pool and waits its turn.
    """
    from app.core.database import AsyncSessionLocal
    from app.models.analytics import AnalyticsEvent

    try:
        async with AsyncSessionLocal() as db:
            for ev in events:
                db.add(
                    AnalyticsEvent(
                        event_type=ev.event_type,
                        session_id=ev.session_id,
                        user_id=user_id,
                        properties=ev.properties,
                    )
                )
            await db.commit()
    except Exception as exc:
        logger.warning("Analytics write failed: %s", exc)


@router.post("/events", status_code=202)
async def ingest_events(
    body: AnalyticsBatch,
    background_tasks: BackgroundTasks,
):
    """Accept analytics event batch. Non-blocking — returns 202 immediately."""
    # user_id is None; we never block ingestion on auth
    user_id = None
    background_tasks.add_task(_write_events, body.events, user_id)
    return {"accepted": len(body.events)}
