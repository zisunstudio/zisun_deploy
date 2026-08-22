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
    # has_twilio_auth, not TWILIO_AUTH_TOKEN: with API-key auth the token is
    # empty, and checking it directly would skip this fallback silently —
    # customers would simply never receive an order confirmation.
    if settings.TWILIO_ACCOUNT_SID and settings.has_twilio_auth:
        try:
            from app.core.twilio import get_twilio_client  # noqa: PLC0415

            twilio = get_twilio_client()
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


async def send_cod_confirmation(
    phone: str,
    order_id: str,
    amount_paise: int,
    items_summary: str,
) -> bool:
    """Ask the customer to confirm a COD order before it is packed.

    Sent as an interactive two-button message where possible. A tap is far
    likelier than a typed reply, and the button id carries the order id, so the
    answer is unambiguous even when someone has two orders open — free text
    cannot say which order "yes" refers to.

    Falls back to plain WhatsApp text, then SMS, then a dev-mode log. Every
    fallback still asks for YES or NO, and the inbound handler understands both
    shapes, so a customer on a client that cannot render buttons is not stuck.
    """
    from app.core.config import settings  # deferred import avoids circular deps
    from app.services.cod_confirmation import confirmation_message

    body = confirmation_message(order_id, amount_paise, items_summary)

    if settings.WHATSAPP_ACCESS_TOKEN and settings.WHATSAPP_PHONE_NUMBER_ID:
        import httpx  # noqa: PLC0415

        interactive = {
            "messaging_product": "whatsapp",
            "to": phone.lstrip("+"),
            "type": "interactive",
            "interactive": {
                "type": "button",
                "body": {"text": body},
                "action": {
                    "buttons": [
                        {
                            "type": "reply",
                            "reply": {"id": f"cod_yes:{order_id}", "title": "Confirm order"},
                        },
                        {
                            "type": "reply",
                            "reply": {"id": f"cod_no:{order_id}", "title": "Cancel order"},
                        },
                    ]
                },
            },
        }
        plain = {
            "messaging_product": "whatsapp",
            "to": phone.lstrip("+"),
            "type": "text",
            "text": {"body": body},
        }

        async with httpx.AsyncClient() as client:
            for payload, shape in ((interactive, "interactive"), (plain, "text")):
                try:
                    resp = await client.post(
                        f"https://graph.facebook.com/v18.0/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages",
                        headers={"Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}"},
                        json=payload,
                        timeout=10,
                    )
                    if resp.status_code == 200:
                        logger.info(
                            "COD confirmation (%s) sent for order %s", shape, order_id
                        )
                        return True
                    logger.warning(
                        "WhatsApp %s COD ask returned %s for order %s: %s",
                        shape,
                        resp.status_code,
                        order_id,
                        resp.text,
                    )
                except Exception as exc:
                    logger.error(
                        "WhatsApp %s COD ask failed for order %s: %s", shape, order_id, exc
                    )

    if settings.TWILIO_ACCOUNT_SID and settings.has_twilio_auth:
        try:
            from app.core.twilio import get_twilio_client  # noqa: PLC0415

            get_twilio_client().messages.create(
                body=body, from_=settings.TWILIO_FROM_NUMBER, to=phone
            )
            logger.info("COD confirmation SMS sent for order %s", order_id)
            return True
        except Exception as exc:
            logger.error("COD confirmation SMS failed for order %s: %s", order_id, exc)

    logger.warning("DEV MODE — COD confirmation for %s: %s", order_id, body)
    return False
