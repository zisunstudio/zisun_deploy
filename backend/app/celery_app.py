from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "zisun",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
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
