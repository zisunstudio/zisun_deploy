"""Feature Engineering — Sprint 1 ML Foundation.

Computes and stores user and product features used for recommendations.
Run via: python -m scripts.ml.feature_engineering [--dry-run]

Features produced:
  UserFeatures:  recency (days since last order), frequency (order count),
                 monetary (total spend paise), last_category_id, session_count_7d
  ProductFeatures: order_count_7d, order_count_30d, avg_rating, review_count,
                   avg_unit_price
"""
import argparse
import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Allow running as `python -m scripts.ml.feature_engineering` from backend/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def build_user_features(conn, since_days: int = 90) -> list[dict]:
    """Query orders and compute RFM features per user."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=since_days)
    rows = conn.execute(
        """
        SELECT
            o.user_id,
            MAX(o.created_at)                          AS last_order_at,
            COUNT(o.id)                                AS order_frequency,
            COALESCE(SUM(o.total_amount), 0)           AS total_spend,
            (
                SELECT p.category_id
                FROM orders o2
                JOIN order_items oi ON oi.order_id = o2.id
                JOIN product_variants pv ON pv.id = oi.product_variant_id
                JOIN products p ON p.id = pv.product_id
                WHERE o2.user_id = o.user_id
                  AND o2.status = 'DELIVERED'
                ORDER BY o2.created_at DESC
                LIMIT 1
            ) AS last_category_id
        FROM orders o
        WHERE o.status IN ('PAID', 'PACKED', 'SHIPPED', 'DELIVERED')
          AND o.created_at >= %s
        GROUP BY o.user_id
        """,
        (cutoff,),
    ).fetchall()

    now = datetime.now(timezone.utc)
    features = []
    for row in rows:
        recency = (now - row["last_order_at"].replace(tzinfo=timezone.utc)).days
        features.append(
            {
                "user_id": str(row["user_id"]),
                "recency_days": recency,
                "frequency": row["order_frequency"],
                "monetary_paise": int(row["total_spend"]),
                "last_category_id": str(row["last_category_id"]) if row["last_category_id"] else None,
            }
        )
    return features


def build_product_features(conn) -> list[dict]:
    """Query orders and compute product-level demand + quality features."""
    now = datetime.now(timezone.utc)
    cutoff_7d = now - timedelta(days=7)
    cutoff_30d = now - timedelta(days=30)

    rows = conn.execute(
        """
        SELECT
            p.id                                              AS product_id,
            p.avg_rating,
            p.review_count,
            p.base_price,
            COALESCE(SUM(CASE WHEN o.created_at >= %s THEN oi.quantity ELSE 0 END), 0)
                                                              AS units_7d,
            COALESCE(SUM(CASE WHEN o.created_at >= %s THEN oi.quantity ELSE 0 END), 0)
                                                              AS units_30d
        FROM products p
        LEFT JOIN product_variants pv ON pv.product_id = p.id
        LEFT JOIN order_items oi ON oi.product_variant_id = pv.id
        LEFT JOIN orders o ON o.id = oi.order_id
            AND o.status IN ('PAID', 'PACKED', 'SHIPPED', 'DELIVERED')
        WHERE p.deleted_at IS NULL AND p.is_active
        GROUP BY p.id
        """,
        (cutoff_7d, cutoff_30d),
    ).fetchall()

    return [
        {
            "product_id": str(row["product_id"]),
            "avg_rating": float(row["avg_rating"]),
            "review_count": int(row["review_count"]),
            "base_price_paise": int(row["base_price"]),
            "units_sold_7d": int(row["units_7d"]),
            "units_sold_30d": int(row["units_30d"]),
        }
        for row in rows
    ]


def run(dry_run: bool = False) -> None:
    """Main entry point."""
    import os
    import psycopg2
    import psycopg2.extras

    dsn = (
        f"host={os.getenv('POSTGRES_SERVER', 'localhost')} "
        f"port={os.getenv('POSTGRES_PORT', '5432')} "
        f"dbname={os.getenv('POSTGRES_DB', 'zisun_db')} "
        f"user={os.getenv('POSTGRES_USER', 'postgres')} "
        f"password={os.getenv('POSTGRES_PASSWORD', 'postgres')}"
    )
    conn = psycopg2.connect(dsn, cursor_factory=psycopg2.extras.RealDictCursor)

    logger.info("Computing user features…")
    user_feats = build_user_features(conn)
    logger.info("  → %d user feature rows", len(user_feats))

    logger.info("Computing product features…")
    prod_feats = build_product_features(conn)
    logger.info("  → %d product feature rows", len(prod_feats))

    if dry_run:
        logger.info("DRY RUN — no writes performed")
        conn.close()
        return

    # In production these would be pushed to Feast online store (Redis).
    # For Sprint 1: log to stdout so ops can verify the pipeline runs.
    import json
    logger.info("User features sample: %s", json.dumps(user_feats[:3], default=str))
    logger.info("Product features sample: %s", json.dumps(prod_feats[:3], default=str))
    logger.info("Feature engineering complete. Integrate with Feast in Sprint 2.")

    conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ZISUN Feature Engineering")
    parser.add_argument("--dry-run", action="store_true", help="Skip DB writes")
    args = parser.parse_args()
    run(dry_run=args.dry_run)
