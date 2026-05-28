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

    # Log inbound events (Phase 2: full handler)
    logger.info("WhatsApp webhook received", extra={"body_size": len(body)})
    return {"status": "ok"}
