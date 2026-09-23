"""What an order is worth, and whether the money actually arrived.

The board had three different definitions of revenue in one payload:

  * `commerce.revenue_window_paise` summed **every** order in the window
    whatever its status, so a prepaid order the customer abandoned at the
    Razorpay sheet and an order she cancelled both counted as money earned.
  * `week.revenue_paise` summed everything except CANCELLED, so it still
    counted abandoned prepaid attempts.
  * `whatsapp.revenue_window_paise` summed enquiries the founder had marked
    "ordered" by hand, which are not orders at all.

Underneath that sits a sharper problem: **PAYMENT_PENDING means two opposite
things.** A RAZORPAY order resting there is a customer who opened the payment
sheet and never paid. A COD order rests there by design - the codebase says so
itself in tasks/commerce.py ("COD is NOT a zombie. A cash order rests in
PAYMENT_PENDING") - and is a perfectly healthy order awaiting its confirmation
call. Any figure that adds them together answers no question truthfully.

So every order here is classified by status *and* payment method, and money is
reported in two columns that are never added up into one "revenue":

  collected - the money is in. Prepaid that reached PAID, and COD that was
              actually DELIVERED, because cash exists only once the courier
              hands it over.
  committed - a real order that owes money: COD placed, confirmed, packed or
              shipped. Genuine demand, not yet cash, and a chunk of it will
              come back as RTO.

Pure functions over plain rows; no database, no settings; unit-tested.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Optional

# Statuses as plain strings so this module never imports the ORM enums and can
# be unit-tested without a database. They must match app/models/order.py.
CREATED = "CREATED"
PAYMENT_PENDING = "PAYMENT_PENDING"
PAID = "PAID"
FAILED_PAYMENT = "FAILED_PAYMENT"
PACKED = "PACKED"
SHIPPED = "SHIPPED"
DELIVERED = "DELIVERED"
CANCELLED = "CANCELLED"
RETURNED = "RETURNED"

COD = "COD"
RAZORPAY = "RAZORPAY"

#: Statuses that mean the shop owes the customer a garment.
OPEN = (PAID, PACKED, SHIPPED)
#: Statuses past the point of no return, in both directions.
DONE = (DELIVERED,)
DEAD = (CANCELLED, FAILED_PAYMENT, RETURNED)

#: How long a prepaid order may sit unpaid before it is abandoned rather than
#: in flight. Matches the zombie sweep in tasks/commerce.py; changing one
#: without the other makes the board disagree with the cleanup.
ABANDON_AFTER_MINUTES = 30


def _method(value) -> str:
    return str(getattr(value, "value", value) or "").upper()


def _status(value) -> str:
    return str(getattr(value, "value", value) or "").upper()


def classify(status, payment_method, *, minutes_old: Optional[float] = None) -> str:
    """One word for what this order actually is.

    `minutes_old` separates a prepaid order still at the payment sheet from
    one the customer walked away from; without it, an unpaid prepaid order is
    assumed abandoned, which is the safe direction for a money figure.
    """
    s, m = _status(status), _method(payment_method)
    if s == RETURNED:
        return "returned"
    if s == CANCELLED:
        return "cancelled"
    if s == FAILED_PAYMENT:
        return "payment_failed"
    if s == DELIVERED:
        return "delivered"
    if s in (PAID, PACKED, SHIPPED):
        return "cod_placed" if m == COD else "paid"
    if s in (CREATED, PAYMENT_PENDING):
        if m == COD:
            return "cod_placed"
        if minutes_old is not None and minutes_old < ABANDON_AFTER_MINUTES:
            return "payment_in_flight"
        return "payment_abandoned"
    return "other"


#: A real order someone placed, whether or not the money has arrived.
REAL = ("paid", "delivered", "cod_placed")


@dataclass
class Money:
    collected_paise: int = 0     # money in hand
    committed_paise: int = 0     # real orders that still owe money (COD)
    lost_paise: int = 0          # abandoned or failed at payment
    refunded_paise: int = 0      # returned after the fact
    orders: int = 0              # real orders (collected + committed)
    by_kind: dict = field(default_factory=dict)


def summarise(rows: Iterable[dict]) -> Money:
    """Roll up orders. Each row: {status, payment_method, total_amount, minutes_old?}."""
    out = Money()
    for r in rows:
        kind = classify(r.get("status"), r.get("payment_method"), minutes_old=r.get("minutes_old"))
        amount = int(r.get("total_amount") or 0)
        out.by_kind[kind] = out.by_kind.get(kind, 0) + 1
        if kind in ("paid", "delivered"):
            out.collected_paise += amount
            out.orders += 1
        elif kind == "cod_placed":
            out.committed_paise += amount
            out.orders += 1
        elif kind in ("payment_abandoned", "payment_failed"):
            out.lost_paise += amount
        elif kind == "returned":
            out.refunded_paise += amount
    return out


@dataclass
class PaymentHealth:
    """Prepaid only. COD never touches a gateway, so it cannot fail at one."""
    attempted: int = 0
    succeeded: int = 0
    failed: int = 0
    abandoned: int = 0
    in_flight: int = 0
    success_rate: Optional[float] = None       # of settled attempts
    abandon_rate: Optional[float] = None
    #: Orders whose gateway said captured while the order never reached PAID,
    #: or the reverse. Either way a human has to look: money and fulfilment
    #: disagree, and that is the one discrepancy worth waking someone for.
    mismatched: int = 0


def payment_health(rows: Iterable[dict], *, captured_order_ids: Optional[set] = None) -> PaymentHealth:
    """`rows` are prepaid orders; `captured_order_ids` come from the payments table."""
    h = PaymentHealth()
    captured = captured_order_ids or set()
    for r in rows:
        if _method(r.get("payment_method")) != RAZORPAY:
            continue
        h.attempted += 1
        kind = classify(r.get("status"), RAZORPAY, minutes_old=r.get("minutes_old"))
        reached_paid = kind in ("paid", "delivered")
        if reached_paid:
            h.succeeded += 1
        elif kind == "payment_failed":
            h.failed += 1
        elif kind == "payment_in_flight":
            h.in_flight += 1
        elif kind == "payment_abandoned":
            h.abandoned += 1
        # Gateway and order disagreeing is a reconciliation problem, and the
        # webhook is the only thing that marks an order PAID - so a captured
        # payment on an unpaid order means the webhook never landed.
        if (r.get("id") in captured) != reached_paid and kind != "payment_in_flight":
            h.mismatched += 1
    settled = h.succeeded + h.failed + h.abandoned
    if settled:
        h.success_rate = round(h.succeeded / settled * 100, 1)
        h.abandon_rate = round(h.abandoned / settled * 100, 1)
    return h


def as_dict(m: Money, p: PaymentHealth) -> dict:
    return {
        "money": {
            "collected_paise": m.collected_paise,
            "committed_paise": m.committed_paise,
            "lost_paise": m.lost_paise,
            "refunded_paise": m.refunded_paise,
            "orders": m.orders,
            "by_kind": m.by_kind,
        },
        "payment": {
            "attempted": p.attempted, "succeeded": p.succeeded, "failed": p.failed,
            "abandoned": p.abandoned, "in_flight": p.in_flight,
            "success_rate": p.success_rate, "abandon_rate": p.abandon_rate,
            "mismatched": p.mismatched,
        },
    }
