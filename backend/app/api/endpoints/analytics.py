"""Analytics event ingestion — batch, non-blocking."""
import logging
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


class AnalyticsEventIn(BaseModel):
    event_type: str
    session_id: Optional[str] = None
    properties: dict = {}


class AnalyticsBatch(BaseModel):
    events: List[AnalyticsEventIn]


async def _write_events(
    events: List[AnalyticsEventIn], user_id, db_url: str
) -> None:
    """Fire-and-forget DB write in its own engine/session."""
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from app.models.analytics import AnalyticsEvent

    engine = create_async_engine(db_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
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
    finally:
        await engine.dispose()


@router.post("/events", status_code=202)
async def ingest_events(
    body: AnalyticsBatch,
    background_tasks: BackgroundTasks,
):
    """Accept analytics event batch. Non-blocking — returns 202 immediately."""
    # user_id is None; we never block ingestion on auth
    user_id = None
    background_tasks.add_task(
        _write_events, body.events, user_id, settings.async_database_uri
    )
    return {"accepted": len(body.events)}
