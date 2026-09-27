"""Amazon Selling Partner API: orders and payouts, into the same books.

Amazon is the one marketplace on ZISUN's list with a seller API. It needs
things that do not exist yet - a Professional seller account, a developer
profile approved by Amazon, and an application registered against it - so
this module is built to the API's documented shapes and proven against a
faked Amazon in `tests/unit/test_amazon_sp.py`. The day the account opens,
three variables (`AMAZON_SP_CLIENT_ID`, `AMAZON_SP_CLIENT_SECRET`,
`AMAZON_SP_REFRESH_TOKEN`) turn it on. Without them it refuses to run
rather than pretending: `NotConfigured` names what is missing, and there is
no mock path in production, for the reasons `Settings` fails closed.

What it does, and what it deliberately hands to code that already exists:

* **Auth** is Login with Amazon: a long-lived refresh token is traded for an
  hour's access token, sent as `x-amz-access-token`. (AWS SigV4 signing was
  dropped from SP-API in 2023; nothing here signs anything.)
* **Orders** come from `GET /orders/v0/orders?LastUpdatedAfter=...` -
  *updated*, not created, so a status change reaches ZISUN without a second
  mechanism - then `GET /orders/v0/orders/{id}/orderItems` per order. Both
  paginate with `NextToken`. A `Pending` order has no items yet (Amazon has
  not authorised the payment) and is skipped until it turns `Unshipped`.
* **Every order becomes an `ExternalOrder`** - the same shape the file
  import produces - and goes through `channels.ingest_orders`. So the one
  stock count, the money rules (owed until settled, then what Amazon paid),
  "never Shiprocket", "no ZISUN invoice number" all hold without a line of
  them being repeated here.
* **Stock**: an order Amazon fulfils from its own warehouse (`AFN`) draws on
  units that left ZISUN's shelf when they were sent to Amazon, so it does
  not touch ZISUN's count; a merchant-fulfilled order (`MFN`) does.
* **Payouts**: Amazon writes settlement reports on its own schedule; they
  are listed, downloaded (gzipped tab-separated files) and read by the
  *same* reader as a hand-exported settlement file, line amounts summed per
  order - which is the net after Amazon's fees, the only honest figure.
* **Rate limits** are real (getOrders allows about one call a minute):
  429 and 5xx are retried with backoff and `Retry-After` is honoured.
* **Buyer PII** (name, street, phone) is returned only to applications
  Amazon has approved for it; without that, city, state and pincode still
  come, which is what GST and the console need.

India is served from Amazon's EU region endpoint; its marketplace id is
A21TJRUUN4KGV. Both are settings so a second country is a variable.
"""
from __future__ import annotations

import asyncio
import gzip
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional

import httpx

from app.services.channel_files import (
    ExternalOrder, Line, Parsed, detect_columns, map_status, parse_date, read_table, settlements_from_rows,
)

logger = logging.getLogger(__name__)

LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token"
DEFAULT_ENDPOINT = "https://sellingpartnerapi-eu.amazon.com"
INDIA_MARKETPLACE = "A21TJRUUN4KGV"
SETTLEMENT_REPORT = "GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2"

#: Amazon's order statuses, decided here rather than by keyword: "Unshipped"
#: contains "ship" and is not shipped. None means "not an order yet".
ORDER_STATUS: dict[str, Optional[str]] = {
    "Pending": None,               # payment not authorised; no items available
    "PendingAvailability": None,
    "Unshipped": "PAID",
    "PartiallyShipped": "SHIPPED",
    "Shipped": "SHIPPED",
    "InvoiceUnconfirmed": "SHIPPED",
    "Canceled": "CANCELLED",
    "Unfulfillable": "CANCELLED",
}

RETRY_DELAYS = (1.0, 2.0, 4.0, 8.0, 16.0)


class NotConfigured(RuntimeError):
    """The connector was asked to run without its credentials."""


class SpApiError(RuntimeError):
    """Amazon answered, and the answer was a refusal."""


@dataclass(frozen=True)
class Config:
    client_id: str
    client_secret: str
    refresh_token: str
    endpoint: str = DEFAULT_ENDPOINT
    marketplace_id: str = INDIA_MARKETPLACE

    @classmethod
    def from_settings(cls, s) -> "Config":
        missing = [n for n in ("AMAZON_SP_CLIENT_ID", "AMAZON_SP_CLIENT_SECRET", "AMAZON_SP_REFRESH_TOKEN")
                   if not getattr(s, n, "")]
        if missing:
            raise NotConfigured("Amazon is not connected: set " + ", ".join(missing))
        return cls(
            client_id=s.AMAZON_SP_CLIENT_ID,
            client_secret=s.AMAZON_SP_CLIENT_SECRET,
            refresh_token=s.AMAZON_SP_REFRESH_TOKEN,
            endpoint=(getattr(s, "AMAZON_SP_ENDPOINT", "") or DEFAULT_ENDPOINT).rstrip("/"),
            marketplace_id=getattr(s, "AMAZON_MARKETPLACE_ID", "") or INDIA_MARKETPLACE,
        )


def configured(s) -> bool:
    return all(getattr(s, n, "") for n in ("AMAZON_SP_CLIENT_ID", "AMAZON_SP_CLIENT_SECRET", "AMAZON_SP_REFRESH_TOKEN"))


# ── The client ───────────────────────────────────────────────────────────────

class Client:
    """One session against SP-API. `transport` and `sleep` exist for the tests."""

    def __init__(self, cfg: Config, *, transport: Optional[httpx.AsyncBaseTransport] = None,
                 sleep: Callable[[float], Any] = asyncio.sleep, pace_seconds: float = 0.0):
        self.cfg = cfg
        self._transport = transport
        self._sleep = sleep
        self._pace = pace_seconds
        self._token: Optional[str] = None
        self._token_until = 0.0
        self._http: Optional[httpx.AsyncClient] = None
        self.calls = 0

    async def __aenter__(self) -> "Client":
        self._http = httpx.AsyncClient(timeout=30.0, transport=self._transport)
        return self

    async def __aexit__(self, *exc) -> None:
        if self._http:
            await self._http.aclose()

    async def token(self) -> str:
        if self._token and time.monotonic() < self._token_until:
            return self._token
        r = await self._http.post(LWA_TOKEN_URL, data={
            "grant_type": "refresh_token", "refresh_token": self.cfg.refresh_token,
            "client_id": self.cfg.client_id, "client_secret": self.cfg.client_secret,
        })
        if r.status_code != 200:
            raise SpApiError(f"Login with Amazon refused the refresh token ({r.status_code}). "
                             "The token may have been revoked; re-authorise the app in Seller Central.")
        body = r.json()
        self._token = body["access_token"]
        self._token_until = time.monotonic() + int(body.get("expires_in", 3600)) - 60
        return self._token

    async def get(self, path: str, params: Optional[dict] = None) -> dict:
        """GET with Amazon's headers, retried on throttling and outages."""
        last: Optional[httpx.Response] = None
        for attempt, delay in enumerate((*RETRY_DELAYS, None)):
            self.calls += 1
            r = await self._http.get(self.cfg.endpoint + path, params=params,
                                     headers={"x-amz-access-token": await self.token(), "Accept": "application/json"})
            if r.status_code == 200:
                if self._pace:
                    await self._sleep(self._pace)
                return r.json()
            last = r
            if r.status_code == 401 and attempt == 0:
                self._token = None                # expired early; fetch a fresh one once
                continue
            if r.status_code in (429, 500, 502, 503, 504) and delay is not None:
                wait = float(r.headers.get("Retry-After") or delay)
                logger.info("SP-API %s answered %s; retrying in %.0fs", path, r.status_code, wait)
                await self._sleep(wait)
                continue
            break
        assert last is not None
        detail = ""
        try:
            detail = (last.json().get("errors") or [{}])[0].get("message", "")
        except Exception:  # noqa: BLE001
            pass
        raise SpApiError(f"SP-API {path} answered {last.status_code}: {detail or last.text[:200]}")

    async def _pages(self, path: str, params: dict, key: str, token_key: str = "NextToken") -> list[dict]:
        out: list[dict] = []
        next_token: Optional[str] = None
        while True:
            q = {token_key: next_token} if next_token else dict(params)
            body = await self.get(path, q)
            payload = body.get("payload", body)
            out.extend(payload.get(key) or [])
            next_token = payload.get(token_key) or payload.get("nextToken")
            if not next_token:
                return out

    async def orders_updated_since(self, since: datetime) -> list[dict]:
        # Amazon refuses a LastUpdatedAfter inside the last two minutes.
        cutoff = min(since, datetime.now(timezone.utc) - timedelta(minutes=3))
        return await self._pages("/orders/v0/orders", {
            "MarketplaceIds": self.cfg.marketplace_id,
            "LastUpdatedAfter": cutoff.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }, "Orders")

    async def order_items(self, order_id: str) -> list[dict]:
        return await self._pages(f"/orders/v0/orders/{order_id}/orderItems", {}, "OrderItems")

    async def settlement_reports(self, since: datetime) -> list[dict]:
        reports = await self._pages("/reports/2021-06-30/reports", {
            "reportTypes": SETTLEMENT_REPORT,
            "processingStatuses": "DONE",
            "createdSince": since.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }, "reports", token_key="nextToken")
        return [r for r in reports if r.get("reportDocumentId")]

    async def report_document(self, document_id: str) -> bytes:
        doc = await self.get(f"/reports/2021-06-30/documents/{document_id}")
        r = await self._http.get(doc["url"])
        if r.status_code != 200:
            raise SpApiError(f"Could not download report document {document_id} ({r.status_code})")
        data = r.content
        if (doc.get("compressionAlgorithm") or "").upper() == "GZIP":
            data = gzip.decompress(data)
        return data


# ── Amazon's shapes -> ZISUN's ───────────────────────────────────────────────

def _paise(money: Optional[dict]) -> Optional[int]:
    try:
        return int(round(float((money or {}).get("Amount")) * 100))
    except (TypeError, ValueError):
        return None


def to_external_order(order: dict, items: list[dict]) -> tuple[Optional[ExternalOrder], Optional[str]]:
    """(order, None) or (None, why it was left out)."""
    oid = order.get("AmazonOrderId") or ""
    raw = order.get("OrderStatus") or ""
    status = ORDER_STATUS.get(raw, map_status(raw)) if raw in ORDER_STATUS or raw else map_status(raw)
    if status is None:
        return None, f"Amazon order {oid}: {raw} - not an order yet, will be picked up next time"
    lines: list[Line] = []
    for it in items:
        qty = int(it.get("QuantityOrdered") or 0)
        sku = (it.get("SellerSKU") or "").strip()
        if qty <= 0 or not sku:
            continue
        total = _paise(it.get("ItemPrice"))
        if total is None:
            if status == "CANCELLED":
                total = 0
            else:
                return None, f"Amazon order {oid}: no price on {sku} - skipped"
        lines.append(Line(sku=sku, quantity=qty, unit_price_paise=int(round(total / qty))))
    if not lines:
        return None, f"Amazon order {oid}: no items returned - skipped"
    addr = order.get("ShippingAddress") or {}
    line1 = ", ".join(x for x in (addr.get("AddressLine1"), addr.get("AddressLine2")) if x) or None
    return ExternalOrder(
        external_id=oid,
        lines=lines,
        status=status,
        ordered_at=parse_date(order.get("PurchaseDate") or ""),
        name=addr.get("Name") or order.get("BuyerInfo", {}).get("BuyerName"),
        line1=line1,
        line2=addr.get("AddressLine3"),
        city=addr.get("City"),
        state=addr.get("StateOrRegion"),
        pincode=(addr.get("PostalCode") or "").replace(" ", "")[:6] or None,
        payment="COD" if (order.get("PaymentMethod") or "").upper() == "COD" else "PREPAID",
        invoice=None,
        # AFN: Amazon's warehouse ships it, from units already off ZISUN's shelf.
        holds_our_stock=(order.get("FulfillmentChannel") or "MFN").upper() != "AFN",
    ), None


async def fetch_orders(client: Client, since: datetime) -> Parsed:
    orders = await client.orders_updated_since(since)
    out: list[ExternalOrder] = []
    problems: list[str] = []
    for o in orders:
        raw = o.get("OrderStatus") or ""
        if raw in ORDER_STATUS and ORDER_STATUS[raw] is None:
            continue                      # Pending: quiet, not a problem
        items = await client.order_items(o.get("AmazonOrderId") or "")
        ext, why = to_external_order(o, items)
        if ext is None:
            problems.append(why or "skipped")
        else:
            out.append(ext)
    return Parsed(orders=out, problems=problems, rows_total=len(orders))


@dataclass
class SettlementFetch:
    rows: list = field(default_factory=list)
    problems: list[str] = field(default_factory=list)
    rows_total: int = 0
    report_ids: list[str] = field(default_factory=list)


async def fetch_settlements(client: Client, since: datetime) -> SettlementFetch:
    """Every settlement report Amazon has produced since `since`, read by the
    same code as a hand-exported one."""
    out = SettlementFetch()
    for rep in await client.settlement_reports(since):
        data = await client.report_document(rep["reportDocumentId"])
        headers, rows = read_table(data, "settlement.txt")
        if not headers:
            out.problems.append(f"Settlement report {rep.get('reportId')}: empty document")
            continue
        mapping = detect_columns(headers, "amazon", kind="settlements")
        if not mapping.ok:
            out.problems.append(f"Settlement report {rep.get('reportId')}: no column for {', '.join(mapping.missing)}")
            continue
        sett, problems, n = settlements_from_rows(headers, rows, mapping)
        out.rows.extend(sett)
        out.problems.extend(problems)
        out.rows_total += n
        out.report_ids.append(str(rep.get("reportId")))
    return out


# ── The sync ─────────────────────────────────────────────────────────────────

OVERLAP = timedelta(hours=6)          # re-read a little; ingest is idempotent
FIRST_SYNC_WINDOW = timedelta(days=30)


async def last_sync_at(db, channel) -> Optional[datetime]:
    from sqlalchemy import func, select
    from app.models.channel import ChannelImport
    return (await db.execute(
        select(func.max(ChannelImport.created_at))
        .where(ChannelImport.channel_id == channel.id, ChannelImport.kind == "api-orders")
    )).scalar_one_or_none()


async def sync(db, *, cfg: Optional[Config] = None, since: Optional[datetime] = None,
               settlements: bool = True, transport: Optional[httpx.AsyncBaseTransport] = None) -> dict:
    """Pull what changed at Amazon and write it through the file import's
    own path. The caller owns the session; this commits."""
    from app.core.config import settings
    from app.models.channel import ChannelImport
    from app.services import channels as svc

    cfg = cfg or Config.from_settings(settings)
    channel = await svc.get_channel(db, "amazon")
    if channel is None:
        raise SpApiError("No 'amazon' channel row - run migration 0027")
    now = datetime.now(timezone.utc)
    if since is None:
        last = await last_sync_at(db, channel)
        since = (last - OVERLAP) if last else (now - FIRST_SYNC_WINDOW)

    summary: dict[str, Any] = {"since": since.isoformat(), "orders": None, "settlements": None}
    async with Client(cfg, transport=transport, pace_seconds=0.0 if transport else 0.5) as client:
        parsed = await fetch_orders(client, since)
        res = await svc.ingest_orders(db, channel, parsed, adjust_stock=True)
        db.add(ChannelImport(
            channel_id=channel.id, kind="api-orders",
            filename=f"SP-API orders updated since {since:%Y-%m-%d %H:%M} UTC",
            rows_total=res.rows_total, orders_created=res.orders_created,
            orders_updated=res.orders_updated, rows_skipped=res.rows_skipped,
            problems=res.problems[:200] or None,
        ))
        summary["orders"] = {"seen": res.rows_total, "created": res.orders_created, "updated": res.orders_updated,
                             "unchanged": res.orders_unchanged, "skipped": res.rows_skipped,
                             "stock_adjusted": res.stock_adjusted, "problems": res.problems}
        if settlements:
            f = await fetch_settlements(client, since)
            if f.report_ids:
                res2 = await svc.ingest_settlements(db, channel, f.rows, f.rows_total, f.problems)
                db.add(ChannelImport(
                    channel_id=channel.id, kind="api-settlements",
                    filename=f"SP-API settlement reports {', '.join(f.report_ids)}",
                    rows_total=res2.rows_total, orders_created=0, orders_updated=res2.orders_updated,
                    rows_skipped=res2.rows_skipped, problems=res2.problems[:200] or None,
                ))
                summary["settlements"] = {"reports": f.report_ids, "orders_marked_paid": res2.orders_updated,
                                          "problems": res2.problems}
            else:
                summary["settlements"] = {"reports": [], "orders_marked_paid": 0, "problems": f.problems}
        summary["api_calls"] = client.calls
    await db.commit()
    return summary
