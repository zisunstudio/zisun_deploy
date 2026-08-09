import logging

logger = logging.getLogger(__name__)


async def send_order_confirmation(
    phone: str,
    order_id: str,
    amount_paise: int,
    items_summary: str,
) -> bool:
    """Send an order confirmation via WhatsApp (primary) or SMS (fallback).

    When neither credential set is configured, logs the message in DEV MODE
    and returns False without raising.
    """
    from app.core.config import settings  # deferred import avoids circular deps

    amount_inr = amount_paise / 100
    msg = (
        f"Order #{order_id[:8]} confirmed! "
        f"₹{amount_inr:.0f} for {items_summary}. "
        f"Track at zisun.in/orders/{order_id}"
    )

    # ── WhatsApp Business API ─────────────────────────────────────────────
    if settings.WHATSAPP_ACCESS_TOKEN and settings.WHATSAPP_PHONE_NUMBER_ID:
        import httpx  # noqa: PLC0415

        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(
                    f"https://graph.facebook.com/v18.0/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages",
                    headers={"Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}"},
                    json={
                        "messaging_product": "whatsapp",
                        "to": phone.lstrip("+"),
                        "type": "text",
                        "text": {"body": msg},
                    },
                    timeout=10,
                )
                if resp.status_code == 200:
                    logger.info("WhatsApp sent for order %s", order_id)
                    return True
                logger.warning(
                    "WhatsApp API returned %s for order %s: %s",
                    resp.status_code,
                    order_id,
                    resp.text,
                )
            except Exception as exc:
                logger.error("WhatsApp send failed for order %s: %s", order_id, exc)

    # ── SMS via Twilio ────────────────────────────────────────────────────
    if settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN:
        try:
            from twilio.rest import Client as TwilioClient  # noqa: PLC0415

            twilio = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
            twilio.messages.create(
                body=msg,
                from_=settings.TWILIO_FROM_NUMBER,
                to=phone,
            )
            logger.info("SMS sent for order %s", order_id)
            return True
        except Exception as exc:
            logger.error("SMS send failed for order %s: %s", order_id, exc)

    # ── Dev fallback ──────────────────────────────────────────────────────
    logger.warning("DEV MODE — Order confirmation for %s: %s", order_id, msg)
    return False
