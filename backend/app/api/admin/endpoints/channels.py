"""Sales channels: the website and the marketplaces, as one business.

Orders and payouts arrive as files exported from each seller portal (no
marketplace offers ZISUN an API yet - see models/channel.py). Every import
is previewed first: the console shows which columns were recognised, which
SKUs are not ZISUN pieces and how much stock would move, and nothing is
written until she confirms. A file that is half-understood is refused, not
half-imported.
"""
import json
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_async_db
from app.models.catalog import ProductVariant
from app.models.channel import ChannelImport, ChannelListing, SalesChannel
from app.schemas.channel import (
    ChannelCreate, ChannelImportOut, ChannelOut, ColumnMatch, ImportPreview, ImportResultOut,
    ListingOut, ListingsUpsert,
)
from app.core.config import settings
from app.services import amazon_sp
from app.services import channel_files as files
from app.services import channels as svc

router = APIRouter()

MAX_FILE_BYTES = 15 * 1024 * 1024


async def _channel_or_404(db: AsyncSession, code: str) -> SalesChannel:
    c = await svc.get_channel(db, code)
    if c is None:
        raise HTTPException(404, f"No channel '{code}'")
    return c


async def _read_upload(file: UploadFile) -> bytes:
    data = await file.read()
    if not data:
        raise HTTPException(400, "The file is empty")
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(413, "That file is larger than 15 MB")
    return data


def _overrides(raw: Optional[str]) -> dict:
    if not raw:
        return {}
    try:
        d = json.loads(raw)
    except ValueError:
        raise HTTPException(400, "Column overrides must be JSON like {\"sku\": \"Seller SKU\"}")
    return {str(k): str(v) for k, v in d.items() if v}


# ── Channels ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[ChannelOut])
async def list_channels(db: AsyncSession = Depends(get_async_db)):
    return await svc.summary(db)


@router.post("/", response_model=ChannelOut, status_code=201)
async def create_channel(body: ChannelCreate, db: AsyncSession = Depends(get_async_db)):
    if await svc.get_channel(db, body.code):
        raise HTTPException(409, f"Channel '{body.code}' already exists")
    db.add(SalesChannel(code=body.code, name=body.name, is_marketplace=body.is_marketplace,
                        settlement_days=body.settlement_days))
    await db.commit()
    return next(c for c in await svc.summary(db) if c["code"] == body.code)


# ── Listings: marketplace SKU -> ZISUN variant ───────────────────────────────

@router.get("/{code}/listings", response_model=List[ListingOut])
async def list_listings(code: str, db: AsyncSession = Depends(get_async_db)):
    c = await _channel_or_404(db, code)
    rows = (await db.execute(
        select(ChannelListing)
        .options(selectinload(ChannelListing.variant).selectinload(ProductVariant.product))
        .where(ChannelListing.channel_id == c.id, ChannelListing.is_active.is_(True))
        .order_by(ChannelListing.external_sku)
    )).scalars().all()
    return [ListingOut(
        id=l.id, external_sku=l.external_sku, external_listing_id=l.external_listing_id,
        product_variant_id=l.product_variant_id,
        sku=l.variant.sku if l.variant else None,
        product_name=l.variant.product.name if l.variant and l.variant.product else None,
        size=l.variant.size if l.variant else None, colour=l.variant.color if l.variant else None,
        stock=l.variant.stock if l.variant else None,
    ) for l in rows]


@router.put("/{code}/listings", response_model=List[ListingOut])
async def upsert_listings(code: str, body: ListingsUpsert, db: AsyncSession = Depends(get_async_db)):
    c = await _channel_or_404(db, code)
    for item in body.items:
        v = (await db.execute(select(ProductVariant.id).where(ProductVariant.id == item.product_variant_id))).scalar_one_or_none()
        if v is None:
            raise HTTPException(404, f"No variant {item.product_variant_id}")
        existing = (await db.execute(
            select(ChannelListing).where(ChannelListing.channel_id == c.id,
                                         ChannelListing.external_sku == item.external_sku.strip())
        )).scalar_one_or_none()
        if existing:
            existing.product_variant_id = item.product_variant_id
            existing.external_listing_id = item.external_listing_id
            existing.is_active = True
        else:
            db.add(ChannelListing(channel_id=c.id, product_variant_id=item.product_variant_id,
                                  external_sku=item.external_sku.strip(),
                                  external_listing_id=item.external_listing_id))
    await db.commit()
    return await list_listings(code, db)


@router.delete("/{code}/listings/{listing_id}", status_code=204)
async def delete_listing(code: str, listing_id: uuid.UUID, db: AsyncSession = Depends(get_async_db)):
    c = await _channel_or_404(db, code)
    l = (await db.execute(select(ChannelListing).where(ChannelListing.id == listing_id,
                                                       ChannelListing.channel_id == c.id))).scalar_one_or_none()
    if l is None:
        raise HTTPException(404, "No such listing")
    await db.delete(l)
    await db.commit()


# ── Files: preview, then import ──────────────────────────────────────────────

@router.post("/{code}/preview", response_model=ImportPreview)
async def preview_import(
    code: str,
    file: UploadFile = File(...),
    kind: str = Form("orders"),
    overrides: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_async_db),
):
    """What an import *would* do. Nothing is written."""
    c = await _channel_or_404(db, code)
    if kind not in ("orders", "settlements"):
        raise HTTPException(400, "kind must be 'orders' or 'settlements'")
    data = await _read_upload(file)
    headers, rows = files.read_table(data, file.filename or "")
    if not headers:
        raise HTTPException(400, "Could not read a table from that file. Export it as CSV or Excel (.xlsx).")
    mapping = files.detect_columns(headers, c.code, kind=kind, overrides=_overrides(overrides))
    columns = [ColumnMatch(field=f, header=mapping.columns.get(f)) for f in
               (files.SETTLEMENT if kind == "settlements" else files.FORMATS.get(c.code, files.GENERIC))]
    base = dict(kind=kind, filename=file.filename or "", columns=columns, missing=mapping.missing,
                unused=mapping.unused[:30])

    if not mapping.ok:
        return ImportPreview(**base, rows_total=len(rows), orders=0, ready=False,
                             problems=[f"No column found for: {', '.join(mapping.missing)}. "
                                       "Choose the column by name below, or export the report again."])

    if kind == "settlements":
        sett, problems, n = files.settlements_from_rows(headers, rows, mapping)
        sample = [{"order": s.external_id, "amount_paise": s.amount_paise,
                   "settled_on": s.settled_on.isoformat() if s.settled_on else None} for s in sett[:5]]
        return ImportPreview(**base, rows_total=n, orders=len(sett), problems=problems, sample=sample, ready=True)

    parsed = files.orders_from_rows(headers, rows, mapping)
    lookup = await svc.sku_lookup(db, c)
    unmapped = svc.unmapped_skus(parsed, lookup)
    stock_units = sum(l.quantity for o in parsed.orders for l in o.lines
                      if o.status in ("PAID", "PACKED", "SHIPPED", "DELIVERED"))
    sample = [{"order": o.external_id, "status": o.status, "lines": len(o.lines),
               "total_paise": o.total_paise, "state": o.state, "pincode": o.pincode,
               "ordered_at": o.ordered_at.isoformat() if o.ordered_at else None} for o in parsed.orders[:5]]
    problems = list(parsed.problems)
    if unmapped:
        problems.append(f"{len(unmapped)} SKU{'s' if len(unmapped) > 1 else ''} not known to ZISUN: "
                        f"{', '.join(unmapped[:8])}{'…' if len(unmapped) > 8 else ''}. "
                        "Their orders will be skipped until mapped under Listings.")
    return ImportPreview(**base, rows_total=parsed.rows_total, orders=len(parsed.orders),
                         lines=sum(len(o.lines) for o in parsed.orders), unmapped_skus=unmapped,
                         stock_units=stock_units, problems=problems, sample=sample, ready=True)


@router.post("/{code}/import", response_model=ImportResultOut)
async def run_import(
    code: str,
    file: UploadFile = File(...),
    kind: str = Form("orders"),
    overrides: Optional[str] = Form(None),
    adjust_stock: bool = Form(True),
    db: AsyncSession = Depends(get_async_db),
):
    """Write the file. Idempotent: the same file again changes nothing."""
    c = await _channel_or_404(db, code)
    if kind not in ("orders", "settlements"):
        raise HTTPException(400, "kind must be 'orders' or 'settlements'")
    data = await _read_upload(file)
    headers, rows = files.read_table(data, file.filename or "")
    if not headers:
        raise HTTPException(400, "Could not read a table from that file")
    mapping = files.detect_columns(headers, c.code, kind=kind, overrides=_overrides(overrides))
    if not mapping.ok:
        raise HTTPException(422, f"No column found for: {', '.join(mapping.missing)}")

    if kind == "settlements":
        sett, problems, n = files.settlements_from_rows(headers, rows, mapping)
        result = await svc.ingest_settlements(db, c, sett, n, problems)
    else:
        parsed = files.orders_from_rows(headers, rows, mapping)
        result = await svc.ingest_orders(db, c, parsed, adjust_stock=adjust_stock)

    db.add(ChannelImport(
        channel_id=c.id, kind=kind, filename=(file.filename or "upload")[:255],
        rows_total=result.rows_total, orders_created=result.orders_created,
        orders_updated=result.orders_updated, rows_skipped=result.rows_skipped,
        problems=result.problems[:200] or None,
    ))
    await db.commit()
    return ImportResultOut(kind=kind, filename=file.filename or "", rows_total=result.rows_total,
                           orders_created=result.orders_created, orders_updated=result.orders_updated,
                           orders_unchanged=result.orders_unchanged, rows_skipped=result.rows_skipped,
                           stock_adjusted=result.stock_adjusted, problems=result.problems)


@router.get("/{code}/imports", response_model=List[ChannelImportOut])
async def list_imports(code: str, db: AsyncSession = Depends(get_async_db)):
    c = await _channel_or_404(db, code)
    rows = (await db.execute(
        select(ChannelImport).where(ChannelImport.channel_id == c.id)
        .order_by(ChannelImport.created_at.desc()).limit(30)
    )).scalars().all()
    return rows


# ── Amazon: the one channel with an API ──────────────────────────────────────

@router.get("/amazon/connection")
async def amazon_connection(db: AsyncSession = Depends(get_async_db)):
    """Whether Amazon is connected, which variables are missing if not, and
    when it last synced. The console shows this on the Amazon card."""
    c = await _channel_or_404(db, "amazon")
    missing = [n for n in ("AMAZON_SP_CLIENT_ID", "AMAZON_SP_CLIENT_SECRET", "AMAZON_SP_REFRESH_TOKEN")
               if not getattr(settings, n, "")]
    last = await amazon_sp.last_sync_at(db, c)
    return {"configured": not missing, "missing": missing, "last_sync_at": last,
            "marketplace_id": settings.AMAZON_MARKETPLACE_ID, "every_minutes": 30}


@router.post("/amazon/sync", status_code=202)
async def amazon_sync_now():
    """Ask the worker to pull from Amazon now rather than at the next half hour.

    Queued, not run here: a sync makes one call per order at Amazon's pace
    and can take minutes, which no request should wait on.
    """
    if not amazon_sp.configured(settings):
        raise HTTPException(409, "Amazon is not connected: set AMAZON_SP_CLIENT_ID, "
                                 "AMAZON_SP_CLIENT_SECRET and AMAZON_SP_REFRESH_TOKEN on zisun-api, "
                                 "zisun-worker and zisun-beat.")
    from app.tasks.channels import sync_amazon  # noqa: PLC0415
    try:
        sync_amazon.delay()
    except Exception as exc:  # noqa: BLE001 - the broker is down; say so
        raise HTTPException(503, f"Could not reach the job queue: {type(exc).__name__}. "
                                 "The half-hourly sync will run when it is back.")
    return {"queued": True}
