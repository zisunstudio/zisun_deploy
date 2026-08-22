from celery import Celery
from celery.schedules import crontab

from app.core.config import settings


def _redis_url() -> str:
    """Celery refuses a `rediss://` URL that doesn't say how to verify the cert.

    Managed Redis (Upstash, Fly, Heroku) hands out TLS URLs. Passed through
    untouched, Celery raises at IMPORT time:

        ValueError: A rediss:// URL must have parameter ssl_cert_reqs and this
        must be set to CERT_REQUIRED, CERT_OPTIONAL, or CERT_NONE

    which kills the worker and beat containers before any task runs — and it
    happens identically in the broker and the result backend. `required`
    (CERT_REQUIRED) is the safe default: these providers present valid certs,
    so there is no reason to weaken verification.

    Plain `redis://` (local dev, Railway's private network) is left alone.
    """
    url = settings.REDIS_URL
    if url.startswith("rediss://") and "ssl_cert_reqs" not in url:
        url += ("&" if "?" in url else "?") + "ssl_cert_reqs=required"
    return url


_REDIS_URL = _redis_url()

celery_app = Celery(
    "zisun",
    broker=_REDIS_URL,
    backend=_REDIS_URL,
    include=["app.tasks.commerce"],
)

celery_app.conf.beat_schedule = {
    "cleanup-zombie-orders": {
        "task": "app.tasks.commerce.cleanup_zombie_orders",
        "schedule": 300,  # every 5 minutes
    },
    "release-expired-locks": {
        "task": "app.tasks.commerce.release_expired_locks",
        "schedule": 300,
    },
    "sweep-cod-confirmations": {
        "task": "app.tasks.commerce.sweep_cod_confirmations",
        "schedule": 600,  # every 10 minutes
    },
    "process-outbox": {
        "task": "app.tasks.commerce.process_outbox",
        "schedule": 30,
    },
    "razorpay-daily-reconciliation": {
        "task": "tasks.razorpay_daily_reconciliation",
        "schedule": crontab(hour=2, minute=0),  # 02:00 UTC daily
    },
}
celery_app.conf.timezone = "Asia/Kolkata"
