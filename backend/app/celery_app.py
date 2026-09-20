import os
import sys
import time

# Pause switch. With the broker dead, starting Celery is a crash loop, and on
# a metered Redis every retry of the loop is a billed AUTH - the loop kept
# Upstash's spent quota pinned at its limit. CELERY_PAUSED=1 on the worker
# and beat services makes the process sleep instead: zero broker traffic, no
# restart storm, one variable to unset once a working Redis is in place.
#
# It lives at import time, in this module, because Railway runs a service's
# startCommand directly and never enters the Dockerfile ENTRYPOINT - a
# switch in entrypoint.sh is invisible to the worker. Guarded on the process
# being the celery CLI so the api, which imports this module for its health
# probe, is never put to sleep by a stray variable.
if os.environ.get("CELERY_PAUSED") == "1" and os.path.basename(sys.argv[0]) == "celery":
    print("==> CELERY_PAUSED=1 - not starting Celery. Unset it once Redis is healthy.", flush=True)
    while True:
        time.sleep(3600)

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
        # 30s here exhausted Upstash's 500k command quota in days and took the
        # worker down with it. Outbox events are notifications, not payments —
        # two minutes of latency on a WhatsApp confirmation is invisible to a
        # customer; a dead worker is not.
        "schedule": 120,
    },
    "razorpay-daily-reconciliation": {
        "task": "tasks.razorpay_daily_reconciliation",
        "schedule": crontab(hour=2, minute=0),  # 02:00 UTC daily
    },
}
celery_app.conf.timezone = "Asia/Kolkata"

# ── Redis command budget ─────────────────────────────────────────────────────
# Celery is a continuous poller, and managed Redis is metered per command. On
# 2026-08-22 the default configuration burned Upstash's entire 500,000-command
# free quota: beat then failed with `max requests limit exceeded`, the worker
# crashed, Railway exhausted its restart retries, and background processing
# stopped silently for eight days. Nothing alerted, because a dead worker
# produces no errors — only work that never happens.
celery_app.conf.update(
    # Nothing in this codebase reads a task result (no AsyncResult anywhere), but
    # storing one costs a SET plus an EXPIRE for every task, forever.
    task_ignore_result=True,
    # Event streams for monitoring tools we do not run.
    worker_send_task_events=False,
    task_send_sent_event=False,
    # AMQP-style heartbeats are meaningless on a Redis broker and just add
    # traffic; TCP keepalive already covers a dead connection.
    broker_heartbeat=0,
    # Block longer on an empty queue: fewer wake-ups, same latency once a
    # message arrives, since BRPOP returns immediately when one does.
    broker_transport_options={"socket_timeout": 30},
    # A broker that refuses the connection is not going to accept it on the
    # ninety-ninth try, and on a metered Redis every try is a billed AUTH.
    # Three attempts, then exit and let the platform's restart policy - which
    # gives up after ten - bound the damage. Was the default of 100 per boot.
    broker_connection_retry_on_startup=True,
    broker_connection_max_retries=3,
    # Remote control (pidbox) is deliberately LEFT ON — `/health` uses
    # control.inspect() to prove the worker is alive, and that probe is the only
    # thing standing between a crashed worker and another silent eight days.
)
