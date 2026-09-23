"""Issuing a tax invoice number, and snapshotting the tax onto an order.

Two rules the number has to obey, both from how GST serials work:

* **Consecutive.** The series must not be full of holes, so a number is taken
  when the order becomes real - prepaid reaching PAID, or COD confirmed by
  the customer - and never when the row is merely created. Most abandoned
  checkouts would otherwise each burn a serial.
* **Unique, under concurrency.** Two orders paid in the same second must not
  take the same number, so the counter row is locked for the moment it is
  read and bumped. Low volume makes the lock free; correctness does not.

The series restarts each Indian financial year (April to March), which is
what "25-26" in `ZS/25-26/0001` means.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import gst

logger = logging.getLogger(__name__)

PREFIX = "ZS"


def financial_year(when: Optional[datetime] = None) -> str:
    """"25-26" for any date from 1 April 2025 to 31 March 2026."""
    d = when or datetime.now(timezone.utc)
    start = d.year if d.month >= 4 else d.year - 1
    return f"{start % 100:02d}-{(start + 1) % 100:02d}"


async def next_invoice_number(db: AsyncSession, when: Optional[datetime] = None) -> str:
    """Take the next serial for this financial year, atomically."""
    fy = financial_year(when)
    # One statement: insert the year's row if it is the first invoice, bump it
    # otherwise, and return the new value. Postgres serialises the upsert, so
    # two orders paid at once cannot read the same number.
    row = (await db.execute(
        text(
            """
            INSERT INTO invoice_counters (financial_year, last_number)
            VALUES (:fy, 1)
            ON CONFLICT (financial_year)
            DO UPDATE SET last_number = invoice_counters.last_number + 1
            RETURNING last_number
            """
        ),
        {"fy": fy},
    )).scalar_one()
    return f"{PREFIX}/{fy}/{int(row):04d}"


def snapshot_tax(order, items: list[dict], state: Optional[str]) -> None:
    """Work out the tax for this order and write it onto the row.

    Called once, at creation. Never recomputed: rates move by notification
    and an invoice must go on printing the numbers it was issued with.
    """
    try:
        inv = gst.compute(items, shipping_paise=int(order.shipping_amount or 0), state=state)
    except Exception:  # noqa: BLE001
        # Tax arithmetic must never be the reason a sale fails. The order is
        # still correct; the breakdown is simply absent and reads as such.
        logger.exception("GST snapshot failed for order %s", getattr(order, "id", "?"))
        return

    order.place_of_supply = inv.place_of_supply
    order.taxable_amount = inv.taxable_paise
    order.cgst_amount = inv.cgst_paise
    order.sgst_amount = inv.sgst_paise
    order.igst_amount = inv.igst_paise
    order.tax_breakdown = gst.as_dict(inv)


async def issue_if_due(db: AsyncSession, order) -> Optional[str]:
    """Give this order its invoice number, once, when it becomes real."""
    if order.invoice_number:
        return order.invoice_number
    try:
        number = await next_invoice_number(db)
    except Exception:  # noqa: BLE001
        logger.exception("Could not take an invoice number for order %s", order.id)
        return None
    order.invoice_number = number
    order.invoiced_at = datetime.now(timezone.utc)
    return number
