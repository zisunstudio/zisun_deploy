"""Marketplace syncs that run on their own: today, Amazon.

Every half hour beat asks the worker to pull what changed at Amazon and
write it through the same path a hand-imported file takes
(`services/amazon_sp.sync` -> `services/channels.ingest_orders`). With no
credentials it says so once and stops - it does not invent orders, and it
does not page anyone, because a marketplace that is not connected is not a
fault.

Half an hour is chosen against two budgets: Amazon allows roughly one
getOrders call a minute, and Upstash meters every Redis command beat
spends dispatching - 48 dispatches a day is nothing beside the sweeps that
already run every two to five minutes.
"""
import logging

from app.celery_app import celery_app
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.tasks.commerce import run_async

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.channels.sync_amazon", ignore_result=True)
def sync_amazon() -> None:
    from app.services import amazon_sp

    if not amazon_sp.configured(settings):
        logger.info("Amazon sync skipped: not connected (set AMAZON_SP_CLIENT_ID, "
                    "AMAZON_SP_CLIENT_SECRET, AMAZON_SP_REFRESH_TOKEN)")
        return
    run_async(_sync_amazon())


async def _sync_amazon() -> None:
    from app.services import amazon_sp

    async with AsyncSessionLocal() as db:
        try:
            summary = await amazon_sp.sync(db)
        except amazon_sp.SpApiError as exc:
            # Amazon's own words, at WARNING: a revoked token or a throttled
            # day is something the founder fixes, not a crash to bury.
            logger.warning("Amazon sync failed: %s", exc)
            return
        o = summary.get("orders") or {}
        logger.info("Amazon sync: %s seen, %s new, %s moved on, %s skipped, %s api calls",
                    o.get("seen"), o.get("created"), o.get("updated"), o.get("skipped"), summary.get("api_calls"))
