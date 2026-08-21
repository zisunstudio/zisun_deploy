#!/usr/bin/env python3
"""Import a product catalogue straight into the database.

The supported path is /admin -> Bulk Import Products (CSV). That needs an admin
session, which needs an OTP, which needs Twilio -- so under LAUNCH_MODE=browse
there is no way in. This script runs the *same* import against the database
directly, so a browse-only storefront can still have a catalogue in it.

It deliberately calls the admin endpoint's own handler rather than
reimplementing the parse: same required columns, same all-or-nothing
validation, same grouping of rows into products, same duplicate-SKU refusal.
A second implementation would drift from the endpoint and quietly accept a
catalogue the real importer would have rejected.

Usage (from backend/, with the same env the API runs with):

    python scripts/import_catalog.py scripts/sample_catalog.csv
    python scripts/import_catalog.py my_catalogue.csv --dry-run

Prices are INTEGER PAISE -- Rs 1,499 is 149900. One row per variant; rows sharing
a `name` become one product.
"""
import argparse
import asyncio
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import func, select                      # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402


async def _run(csv_path: str, dry_run: bool) -> int:
    from fastapi import HTTPException, UploadFile
    from app.api.admin.endpoints.products import admin_bulk_import_products_csv
    from app.core.config import settings
    from app.core.database import _async_connect_args
    from app.models.catalog import Product, ProductVariant

    with open(csv_path, "rb") as fh:
        raw = fh.read()

    engine = create_async_engine(
        settings.async_database_uri,
        pool_pre_ping=True,
        connect_args=_async_connect_args(),
    )

    # The handler ends with its own commit(), so a dry run cannot simply
    # rollback afterwards -- by then there is nothing left to roll back and
    # the rows are already live. Binding the session to an outer transaction
    # with join_transaction_mode="create_savepoint" turns that inner commit()
    # into a RELEASE SAVEPOINT, leaving the outer transaction the real say.
    async with engine.connect() as conn:
        outer = await conn.begin()
        Session = async_sessionmaker(
            bind=conn, expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )
        async with Session() as db:
            before = (await db.execute(select(func.count(Product.id)))).scalar_one()
            print(f"Connected to {settings.POSTGRES_SERVER}:{settings.POSTGRES_PORT}"
                  f"/{settings.POSTGRES_DB} -- {before} product(s) already present")

            upload = UploadFile(file=io.BytesIO(raw), filename=os.path.basename(csv_path))
            try:
                result = await admin_bulk_import_products_csv(file=upload, db=db)
            except HTTPException as exc:
                # The endpoint reports every bad row at once; print them all rather
                # than making the operator fix one line per run.
                detail = exc.detail
                print(f"\nImport REJECTED ({exc.status_code}) -- nothing was written.")
                if isinstance(detail, dict) and "errors" in detail:
                    for e in detail["errors"]:
                        print(f"  - {e}")
                else:
                    print(f"  - {detail}")
                await outer.rollback()
                await engine.dispose()
                return 1

        if dry_run:
            await outer.rollback()
            print("\nDRY RUN -- rolled back, nothing written. Would have created:")
        else:
            await outer.commit()
            print("\nImported:")

        print(f"  products: {result['created_products']}")
        print(f"  variants: {result['created_variants']}")
        for p in result["products"]:
            print(f"    - {p['name']} ({p['variants']} variant(s))")

    # A fresh session on the engine, not the connection above: reusing it
    # would report a dry run's uncommitted counts as if they were real.
    VerifySession = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with VerifySession() as db:
        products = (await db.execute(select(func.count(Product.id)))).scalar_one()
        variants = (await db.execute(select(func.count(ProductVariant.id)))).scalar_one()
        stock = (await db.execute(select(func.coalesce(func.sum(ProductVariant.stock), 0)))).scalar_one()
        print(f"\nCatalogue now: {products} product(s), {variants} variant(s), {stock} unit(s) in stock")

    await engine.dispose()
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv", nargs="?", default="scripts/sample_catalog.csv",
                    help="CSV to import (default: scripts/sample_catalog.csv)")
    ap.add_argument("--dry-run", action="store_true",
                    help="validate and roll back -- proves the CSV and the DB connection without writing")
    args = ap.parse_args()

    if not os.path.exists(args.csv):
        print(f"No such file: {args.csv}", file=sys.stderr)
        return 2
    return asyncio.run(_run(args.csv, args.dry_run))


if __name__ == "__main__":
    raise SystemExit(main())
