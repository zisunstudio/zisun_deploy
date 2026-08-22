"""WhatsApp webhook — verification (GET) + inbound events (POST)."""
import hashlib
import hmac
import logging

from fastapi import APIRouter, HTTPException, Query, Request

from app.core.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)


def _resolve_verify_token() -> str:
    """Return the configured verify token, preferring WHATSAPP_VERIFY_TOKEN
    and falling back to WHATSAPP_WEBHOOK_VERIFY_TOKEN."""
    return settings.WHATSAPP_VERIFY_TOKEN or settings.WHATSAPP_WEBHOOK_VERIFY_TOKEN


@router.get("/webhooks/whatsapp")
async def whatsapp_verify(
    hub_mode: str = Query(alias="hub.mode"),
    hub_challenge: str = Query(alias="hub.challenge"),
    hub_verify_token: str = Query(alias="hub.verify.token"),
):
    """WhatsApp webhook verification handshake."""
    verify_token = _resolve_verify_token()
    if hub_mode == "subscribe" and hub_verify_token == verify_token:
        return int(hub_challenge)
    raise HTTPException(status_code=403, detail="Forbidden")


@router.post("/webhooks/whatsapp", status_code=200)
async def whatsapp_inbound(request: Request):
    """Receive inbound WhatsApp messages and delivery status updates."""
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")

    # Verify HMAC-SHA256 signature
    if settings.WHATSAPP_APP_SECRET:
        expected = "sha256=" + hmac.new(
            settings.WHATSAPP_APP_SECRET.encode(),
            body,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise HTTPException(status_code=400, detail="Invalid signature")

    logger.info("WhatsApp webhook received", extra={"body_size": len(body)})

    try:
        await _handle_inbound(await request.json())
    except Exception as exc:
        # Always 200. Meta retries anything else, and a redelivery loop over a
        # message we cannot parse is worse than dropping it — the reply is
        # already recorded in the thread and the sweep will nudge again.
        logger.exception("WhatsApp inbound handling failed: %s", exc)

    return {"status": "ok"}


def _extract_messages(payload: dict) -> list[dict]:
    """Pull the message list out of Meta's nested envelope."""
    out: list[dict] = []
    for entry in payload.get("entry", []) or []:
        for change in entry.get("changes", []) or []:
            out.extend((change.get("value") or {}).get("messages", []) or [])
    return out


async def _handle_inbound(payload: dict) -> None:
    """Apply COD confirmation replies. Ignores everything else.

    Most inbound traffic is customers asking questions on the same thread, so
    anything that is not recognisably yes or no is left alone rather than
    guessed at — reading "no, when will it arrive?" as a cancellation would be
    considerably worse than not answering it.
    """
    from sqlalchemy import select

    from app.core.database import AsyncSessionLocal
    from app.models.order import CODConfirmation, Order, OrderStatus
    from app.models.user import User
    from app.services.cod_confirmation import apply_reply, interpret_reply

    messages = _extract_messages(payload)
    if not messages:
        return

    async with AsyncSessionLocal() as db:
        for message in messages:
            sender = message.get("from", "")
            button_id = (
                (message.get("interactive") or {}).get("button_reply") or {}
            ).get("id", "")
            text = ((message.get("text") or {}).get("body") or "")

            verdict = interpret_reply(text=text, button_id=button_id)
            if verdict is None:
                continue
            order_id, confirmed = verdict

            if order_id:
                order = (
                    await db.execute(select(Order).where(Order.id == order_id))
                ).scalar_one_or_none()
            else:
                # Free text carries no order id, so resolve by sender. Match on
                # the phone's last ten digits: Meta reports 919876543210 while
                # the user record may hold +91 98765 43210.
                tail = "".join(c for c in sender if c.isdigit())[-10:]
                if not tail:
                    continue
                order = (
                    await db.execute(
                        select(Order)
                        .join(User, User.id == Order.user_id)
                        .where(
                            User.phone.like(f"%{tail}"),
                            Order.cod_confirmation == CODConfirmation.PENDING,
                            Order.status.notin_(
                                [OrderStatus.CANCELLED, OrderStatus.RETURNED]
                            ),
                        )
                        .order_by(Order.created_at.desc())
                        .limit(1)
                    )
                ).scalar_one_or_none()

            if order is None:
                logger.info("COD reply from %s matched no pending order", sender[-4:])
                continue

            if apply_reply(order, confirmed):
                logger.info(
                    "COD order %s %s by customer",
                    order.id,
                    "confirmed" if confirmed else "declined",
                )
                if not confirmed:
                    from app.tasks.commerce import _release_locks

                    await _release_locks(db, order.id)

        await db.commit()
