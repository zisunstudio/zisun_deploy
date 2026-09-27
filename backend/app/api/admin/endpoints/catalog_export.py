"""Catalogue export: the master sheet, and marketplace templates filled in.

See services/catalog_export.py for why templates are read rather than
guessed. Preview first, then fill: the preview says which template column
each ZISUN field went to, and she can change any of them.
"""
import json
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_async_db
from app.models.catalog import Product
from app.schemas.catalog import LegalMetrology
from app.services import catalog_export as ce
from app.services import gst

router = APIRouter()

MAX_TEMPLATE_BYTES = 20 * 1024 * 1024
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
XLSM = "application/vnd.ms-excel.sheet.macroEnabled.12"


async def _rows(db: AsyncSession, include_inactive: bool) -> list[dict]:
    stmt = (
        select(Product)
        .options(selectinload(Product.variants), selectinload(Product.media), selectinload(Product.category))
        .where(Product.deleted_at.is_(None))
        .order_by(Product.name)
    )
    if not include_inactive:
        stmt = stmt.where(Product.is_active.is_(True))
    products = (await db.execute(stmt)).scalars().all()
    return ce.rows_for(products, legal=LegalMetrology.resolve, rate_for=gst.rate_for, default_hsn=gst.DEFAULT_HSN)


def _overrides(raw: Optional[str]) -> dict:
    if not raw:
        return {}
    try:
        d = json.loads(raw)
    except ValueError:
        raise HTTPException(400, "Column choices must be JSON like {\"4\": \"sku\"}")
    valid = {k for k, _, _ in ce.FIELDS}
    out = {}
    for k, v in d.items():
        if v not in ("", None) and v not in valid:
            raise HTTPException(400, f"Unknown field '{v}'")
        out[str(k)] = v or ""
    return out


@router.get("/fields")
async def list_fields():
    """Every field a template column can be filled from, for the chooser."""
    return [{"key": k, "label": label} for k, label, _ in ce.FIELDS]


@router.get("/master")
async def master_sheet(
    format: str = Query("xlsx", pattern="^(xlsx|csv)$"),
    include_inactive: bool = Query(False, description="Include pieces that are switched off"),
    db: AsyncSession = Depends(get_async_db),
):
    """One row per live size and colour, every field ZISUN holds."""
    rows = await _rows(db, include_inactive)
    if format == "csv":
        return Response(ce.master_csv(rows), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": 'attachment; filename="zisun-catalogue.csv"'})
    return Response(ce.master_xlsx(rows), media_type=XLSX,
                    headers={"Content-Disposition": 'attachment; filename="zisun-catalogue.xlsx"'})


async def _template(file: UploadFile) -> tuple[bytes, str]:
    name = file.filename or "template.xlsx"
    if not name.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(400, "Upload the template as .xlsx or .xlsm. An old .xls must be saved as .xlsx first.")
    data = await file.read()
    if not data:
        raise HTTPException(400, "The file is empty")
    if len(data) > MAX_TEMPLATE_BYTES:
        raise HTTPException(413, "That template is larger than 20 MB")
    return data, name


@router.post("/template/preview")
async def preview_template(
    file: UploadFile = File(...),
    overrides: Optional[str] = Form(None),
    include_inactive: bool = Form(False),
    db: AsyncSession = Depends(get_async_db),
):
    """Which column each ZISUN field would fill, and how many rows. Nothing is written."""
    data, name = await _template(file)
    try:
        layout = ce.inspect_template(data, name, _overrides(overrides))
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception:  # noqa: BLE001 - a corrupt or password-protected file
        raise HTTPException(422, "Could not open that file as an Excel workbook.")
    rows = await _rows(db, include_inactive)
    mapped = {f for _, _, f in layout.columns if f}
    return {
        "sheet": layout.sheet, "header_row": layout.header_row, "first_data_row": layout.first_data_row,
        "columns": [{"column": c, "header": h, "field": f, "label": ce.FIELD_LABEL.get(f) if f else None}
                    for c, h, f in layout.columns],
        "matched": len(mapped), "total_columns": len(layout.columns),
        "missing_required": [ce.FIELD_LABEL[k] for k in ce.REQUIRED_FOR_TEMPLATE if k not in mapped],
        "rows": len(rows),
        "sample": {h: (rows[0].get(f) if rows and f else None) for c, h, f in layout.columns if f} if rows else {},
    }


@router.post("/template/fill")
async def fill_template(
    file: UploadFile = File(...),
    overrides: Optional[str] = Form(None),
    include_inactive: bool = Form(False),
    db: AsyncSession = Depends(get_async_db),
):
    """The same template, one row per variant written under its header."""
    data, name = await _template(file)
    rows = await _rows(db, include_inactive)
    if not rows:
        raise HTTPException(409, "No live sizes to export. Switch a piece on, or include switched-off pieces.")
    try:
        out, layout = ce.fill_template(data, name, rows, _overrides(overrides))
    except ValueError as e:
        raise HTTPException(422, str(e))
    stem = name.rsplit(".", 1)[0]
    ext = name.rsplit(".", 1)[-1].lower()
    return Response(out, media_type=XLSM if ext == "xlsm" else XLSX, headers={
        "Content-Disposition": f'attachment; filename="{stem}-zisun-filled.{ext}"',
        "X-Rows-Written": str(len(rows)), "X-Sheet": layout.sheet,
        "Access-Control-Expose-Headers": "X-Rows-Written, X-Sheet",
    })
