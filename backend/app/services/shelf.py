"""Shelf order — where each product sits when nobody has said otherwise.

The founder can pin a product to a position by dragging it (products.shelf_rank).
Everything she has not pinned is arranged by an attention score, so the pieces
people are actually engaging with rise without anyone curating them daily.

The score is a recency-weighted sum of engagement, the same family of formula
behind Hacker News' "gravity" and Reddit's "hot": each event contributes a
weight for how strong a signal it is, multiplied by exp(-age / tau) so that a
view last night counts for more than one three weeks ago. tau is the half-life
in days divided by ln 2; at TAU_DAYS = 7 an event is worth half as much after
about five days and a tenth after about sixteen. That keeps the shelf current
without letting one viral afternoon own the top row for a month.

Weights are ordered by how much intent they show, not by how often they happen.
An impression is nearly free (the card scrolled past); opening the product is a
choice; adding to the bag is a commitment; starting checkout is money. Doubling
each step is deliberate — it means one add-to-cart outranks eight passive views,
which matches what those events actually predict about a sale.

Computed in SQL over the last WINDOW_DAYS of analytics_events, grouped by the
product_id inside the event's properties JSON. Read-only; nothing is stored, so
the ranking is always live and the founder's pins always win.
"""
from __future__ import annotations

import math

import sqlalchemy as sa
from sqlalchemy import select

from app.models.analytics import AnalyticsEvent

WINDOW_DAYS = 30
TAU_DAYS = 7.0
EVENT_WEIGHTS: dict[str, float] = {
    "product_impression": 1.0,
    "product_viewed": 4.0,
    "size_guide_opened": 6.0,
    "add_to_cart": 16.0,
    "checkout_initiated": 40.0,
}


def attention_score_subquery():
    """A subquery of (product_id text, score float) for every product with any events.

    The product id lives in `properties->>'product_id'` as text, so the outer
    query joins on `cast(products.id as text)`. Decay is computed inside the
    database: `exp(-age_days / tau)` per row, summed per product.
    """
    age_days = sa.extract("epoch", sa.func.now() - AnalyticsEvent.created_at) / 86400.0
    decay = sa.func.exp(-age_days / TAU_DAYS)
    weight = sa.case(
        *[(AnalyticsEvent.event_type == k, v) for k, v in EVENT_WEIGHTS.items()],
        else_=0.0,
    )
    product_id_text = AnalyticsEvent.properties.op("->>")("product_id")
    return (
        select(
            product_id_text.label("product_id"),
            sa.func.sum(weight * decay).label("score"),
        )
        .where(
            AnalyticsEvent.event_type.in_(list(EVENT_WEIGHTS)),
            AnalyticsEvent.created_at >= sa.func.now() - sa.text(f"interval '{WINDOW_DAYS} days'"),
            product_id_text.isnot(None),
        )
        .group_by(product_id_text)
        .subquery("attention")
    )


def half_life_days() -> float:
    """For the dashboard copy: how long until an event counts half as much."""
    return TAU_DAYS * math.log(2)
