"""Pre-dispatch COD confirmation.

COD orders return at roughly 26% against under 2% for prepaid, and a fashion
RTO costs Rs 200-250 in two-way freight with nothing collected at the door. The
cheapest control is to ask the customer to confirm before anything ships.

Two things make it work, and both are easy to leave out:

  * Speed. Reply rates fall sharply once the order is out of mind, so the ask
    goes out on the outbox tick immediately after the order is placed, not on a
    nightly batch.
  * A dispatch gate. Asking and shipping anyway saves nothing. `may_dispatch`
    is enforced where the shipment is created, not merely displayed in an admin
    screen.
"""
import logging
import re
from datetime import datetime, timezone
from typing import Optional

from app.models.order import CODConfirmation, Order, OrderStatus, PaymentMethod

logger = logging.getLogger(__name__)

# Button ids carry the order, so a reply is unambiguous even when a customer
# has two orders open at once.
_YES_PREFIX = "cod_yes:"
_NO_PREFIX = "cod_no:"

# Free-text fallbacks, for customers who type rather than tap. Deliberately
# narrow: "no thanks" must cancel, but a sentence containing "no" must not.
_YES_WORDS = {"yes", "y", "ok", "okay", "confirm", "confirmed", "haan", "ha", "sari", "sare"}
_NO_WORDS = {"no", "n", "cancel", "stop", "dont", "don't", "nahi", "venda", "beda"}


def needs_confirmation(order: Order) -> bool:
    """True when this order should be held until the customer confirms."""
    return (
        order.payment_method == PaymentMethod.COD
        and order.status not in (OrderStatus.CANCELLED, OrderStatus.RETURNED)
    )


def may_dispatch(order: Order) -> bool:
    """Whether this order is allowed to leave the building.

    Prepaid orders are always allowed — the money is already collected. A COD
    order is allowed only once the customer has said yes. PENDING, DECLINED,
    UNREACHABLE and NULL all mean no: NULL is included on purpose, so an order
    created before this flow existed, or by a path that forgot to ask, is held
    rather than waved through.
    """
    if order.payment_method != PaymentMethod.COD:
        return True
    return order.cod_confirmation == CODConfirmation.CONFIRMED


def interpret_reply(text: str = "", button_id: str = "") -> Optional[tuple[str, bool]]:
    """Turn an inbound WhatsApp reply into (order_id, confirmed).

    Returns None when the message is not an answer to a confirmation, which is
    most inbound traffic — customers ask questions on the same thread.
    """
    if button_id:
        for prefix, confirmed in ((_YES_PREFIX, True), (_NO_PREFIX, False)):
            if button_id.startswith(prefix):
                return button_id[len(prefix):], confirmed
        return None

    # No button, so this is free text and carries no order id. The caller
    # resolves which order it refers to; here we only decide yes or no.
    word = re.sub(r"[^a-z' ]", "", (text or "").strip().lower())
    if word in _YES_WORDS:
        return ("", True)
    if word in _NO_WORDS:
        return ("", False)
    return None


def mark_sent(order: Order) -> None:
    order.cod_confirmation = CODConfirmation.PENDING
    order.cod_confirmation_sent_at = datetime.now(timezone.utc)
    order.cod_confirmation_attempts = (order.cod_confirmation_attempts or 0) + 1


def apply_reply(order: Order, confirmed: bool) -> bool:
    """Record the customer's answer. Returns True if the order changed.

    Idempotent: WhatsApp redelivers webhooks, and a customer can tap a button
    twice. A second yes after a yes is a no-op, and an answer arriving after
    the order was already cancelled is ignored rather than resurrecting it.
    """
    if order.status in (OrderStatus.CANCELLED, OrderStatus.RETURNED):
        return False
    if order.cod_confirmation in (CODConfirmation.CONFIRMED, CODConfirmation.DECLINED):
        return False

    if confirmed:
        order.cod_confirmation = CODConfirmation.CONFIRMED
        order.cod_confirmed_at = datetime.now(timezone.utc)
    else:
        order.cod_confirmation = CODConfirmation.DECLINED
    return True


def confirmation_message(order_id: str, amount_paise: int, items_summary: str) -> str:
    """The text body, also used verbatim as the SMS fallback."""
    return (
        f"ZISUN order #{order_id[:8]}: {items_summary} for "
        f"Rs {amount_paise / 100:.0f}, Cash on Delivery.\n\n"
        "Reply YES to confirm and we will pack it today. "
        "Reply NO to cancel — no charge either way."
    )
