"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";

import { adminApi } from "@/lib/adminApi";
import {
  Button, Card, CardHeader, EmptyState, Field, Input, Page, Pill, Select, TableScroll, inputClass, td, th,
} from "@/components/admin/ui";

/**
 * Channels: the website and the marketplaces, as one business.
 *
 * No marketplace offers ZISUN an API yet, so orders and payouts come in as
 * the files each seller portal exports. Every import is previewed - which
 * columns were recognised, which SKUs are not ZISUN pieces, how much stock
 * would move - and nothing is written until she confirms. A marketplace SKU
 * that ZISUN does not know is mapped once, here, under Listings.
 */

type Channel = {
  id: string; code: string; name: string; is_marketplace: boolean; is_active: boolean;
  settlement_days: number | null; orders: number; gross_paise: number; settled_paise: number;
  orders_settled: number; listings: number; last_import_at: string | null;
};
type Listing = {
  id: string; external_sku: string; external_listing_id: string | null; product_variant_id: string;
  sku: string | null; product_name: string | null; size: string | null; colour: string | null; stock: number | null;
};
type Variant = { id: string; sku: string; size: string | null; color: string | null; stock: number };
type Product = { id: string; name: string; variants: Variant[] };
type Preview = {
  kind: string; filename: string; columns: { field: string; header: string | null }[]; missing: string[];
  unused: string[]; rows_total: number; orders: number; lines: number; unmapped_skus: string[];
  stock_units: number; problems: string[]; sample: Record<string, unknown>[]; ready: boolean;
};
type ImportResult = {
  kind: string; rows_total: number; orders_created: number; orders_updated: number; orders_unchanged: number;
  rows_skipped: number; stock_adjusted: number; problems: string[];
};
type Connection = { configured: boolean; missing: string[]; last_sync_at: string | null; marketplace_id: string; every_minutes: number };
type ImportRow = {
  id: string; kind: string; filename: string; rows_total: number; orders_created: number;
  orders_updated: number; rows_skipped: number; problems: string[] | null; created_at: string;
};

const rupees = (p: number) => `₹${Math.round(p / 100).toLocaleString("en-IN")}`;
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "never";

const FIELD_LABEL: Record<string, string> = {
  order_id: "Order id", sku: "SKU", quantity: "Quantity", unit_price: "Unit price", line_total: "Line total",
  order_date: "Order date", status: "Status", state: "State", pincode: "Pincode", city: "City", name: "Customer",
  line1: "Address", line2: "Address 2", payment: "Payment", invoice: "Invoice no.", amount: "Amount",
  settled_on: "Settled on",
};

export default function AdminChannelsPage() {
  const qc = useQueryClient();
  const [code, setCode] = useState<string | null>(null);

  const { data: channels, isLoading } = useQuery({
    queryKey: ["admin-channels"],
    queryFn: async () => (await adminApi.get<Channel[]>("/channels/")).data,
  });
  const selected = channels?.find((c) => c.code === code) ?? null;
  // Open on the marketplace she last worked in, or the first one: a phone
  // should not land on an empty state with the real content one tap away.
  useEffect(() => {
    if (code || !channels?.length) return;
    const busiest = [...channels].filter((c) => c.is_marketplace).sort((a, b) => b.orders - a.orders)[0];
    if (busiest) setCode(busiest.code);
  }, [channels, code]);

  const { data: listings } = useQuery({
    queryKey: ["admin-channel-listings", code],
    enabled: !!code,
    queryFn: async () => (await adminApi.get<Listing[]>(`/channels/${code}/listings`)).data,
  });
  const { data: imports } = useQuery({
    queryKey: ["admin-channel-imports", code],
    enabled: !!code,
    queryFn: async () => (await adminApi.get<ImportRow[]>(`/channels/${code}/imports`)).data,
  });
  const { data: products } = useQuery({
    queryKey: ["admin-products-for-listings"],
    enabled: !!code,
    queryFn: async () => (await adminApi.get<Product[]>("/products/?include_inactive=true&limit=200")).data,
  });
  const variants = useMemo(() =>
    (products ?? []).flatMap((p) => p.variants.map((v) => ({ ...v, label: `${p.name} · ${[v.size, v.color].filter(Boolean).join(" / ")} · ${v.sku}` }))),
    [products]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-channels"] });
    qc.invalidateQueries({ queryKey: ["admin-channel-listings", code] });
    qc.invalidateQueries({ queryKey: ["admin-channel-imports", code] });
  };

  return (
    <Page
      title="Channels"
      description="Everything sold anywhere, in one place. Marketplaces send orders and payouts as files; bring them in here."
    >
      {isLoading && <p className="text-sm text-gray-500">Loading…</p>}

      {/* One card per channel. Stacked on a phone, a row on a desk. */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 mb-6">
        {(channels ?? []).map((c) => (
          <button
            key={c.code}
            type="button"
            onClick={() => setCode(c.is_marketplace ? c.code : null)}
            className={`text-left rounded-xl border bg-white px-4 py-3 sm:min-w-[210px] transition-colors ${
              code === c.code ? "border-ink ring-1 ring-ink" : "border-gray-200 hover:border-gray-400"
            } ${!c.is_marketplace ? "cursor-default" : ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-gray-900">{c.name}</span>
              {c.is_marketplace
                ? <Pill tone={c.orders ? "good" : "neutral"}>{c.orders ? `${c.orders} orders` : "not started"}</Pill>
                : <Pill tone="good">{c.orders} orders</Pill>}
            </div>
            <div className="mt-1.5 text-xs text-gray-600">
              {c.is_marketplace ? (
                <>
                  <div>Owed {rupees(c.gross_paise - c.settled_paise)} · paid {rupees(c.settled_paise)}</div>
                  <div className="text-gray-400">{c.listings} listings mapped · last file {when(c.last_import_at)}</div>
                </>
              ) : (
                <div>{rupees(c.gross_paise)} across the website</div>
              )}
            </div>
          </button>
        ))}
      </div>

      {!selected && (
        <EmptyState
          title="Choose a marketplace above"
          body="Then map its SKUs to your pieces once, and import its order and payout files whenever you export them."
        />
      )}

      {selected && (
        <div className="space-y-6">
          {selected.code === "amazon" && <AmazonPanel onDone={refresh} />}
          <ImportPanel channel={selected} onDone={refresh} />
          <ListingsPanel channel={selected} listings={listings ?? []} variants={variants} onChange={refresh} />
          <HistoryPanel imports={imports ?? []} />
        </div>
      )}
    </Page>
  );
}

// ── Amazon: the one marketplace with an API ──────────────────────────────────

function AmazonPanel({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [note, setNote] = useState<string | null>(null);
  const { data: conn } = useQuery({
    queryKey: ["admin-amazon-connection"],
    queryFn: async () => (await adminApi.get<Connection>("/channels/amazon/connection")).data,
  });
  const sync = useMutation({
    mutationFn: async () => adminApi.post("/channels/amazon/sync"),
    onSuccess: () => { setNote("Asked Amazon. Orders and payouts will appear here within a few minutes."); onDone(); qc.invalidateQueries({ queryKey: ["admin-amazon-connection"] }); },
    onError: (e: unknown) => setNote(detail(e, "Could not start the sync.")),
  });
  if (!conn) return null;
  return (
    <Card>
      <CardHeader
        title="Amazon connection"
        meta={conn.configured
          ? `Connected. Orders and payouts are pulled every ${conn.every_minutes} minutes; last ${when(conn.last_sync_at)}.`
          : "Not connected. Files still work; connect for orders and payouts to arrive on their own."}
      />
      {conn.configured ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" disabled={sync.isPending} onClick={() => sync.mutate()}>
            {sync.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}<span className="ml-1.5">Sync from Amazon now</span>
          </Button>
          {note && <span className="text-sm text-gray-700">{note}</span>}
        </div>
      ) : (
        <div className="text-sm text-gray-700 space-y-1">
          <p>Needs a Professional seller account and a developer application approved in Seller Central. Then set on <span className="font-mono text-xs">zisun-api</span>, <span className="font-mono text-xs">zisun-worker</span> and <span className="font-mono text-xs">zisun-beat</span>:</p>
          <ul className="list-disc pl-5 font-mono text-xs">{conn.missing.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      )}
    </Card>
  );
}

// ── Import: preview, then confirm ────────────────────────────────────────────

function ImportPanel({ channel, onDone }: { channel: Channel; onDone: () => void }) {
  const [kind, setKind] = useState<"orders" | "settlements">("orders");
  const [file, setFile] = useState<File | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [adjustStock, setAdjustStock] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const body = () => {
    const fd = new FormData();
    fd.append("file", file!);
    fd.append("kind", kind);
    if (Object.keys(overrides).length) fd.append("overrides", JSON.stringify(overrides));
    fd.append("adjust_stock", String(adjustStock));
    return fd;
  };
  const multipart = { headers: { "Content-Type": "multipart/form-data" } };

  const previewM = useMutation({
    mutationFn: async () => (await adminApi.post<Preview>(`/channels/${channel.code}/preview`, body(), multipart)).data,
    onMutate: () => { setError(null); setResult(null); },
    onSuccess: (p) => setPreview(p),
    onError: (e: unknown) => setError(detail(e, "Could not read that file.")),
  });
  const importM = useMutation({
    mutationFn: async () => (await adminApi.post<ImportResult>(`/channels/${channel.code}/import`, body(), multipart)).data,
    onSuccess: (r) => { setResult(r); setPreview(null); setFile(null); if (fileRef.current) fileRef.current.value = ""; onDone(); },
    onError: (e: unknown) => setError(detail(e, "The import failed. Nothing was written.")),
  });

  const reset = () => { setPreview(null); setResult(null); setError(null); setOverrides({}); };

  return (
    <Card>
      <CardHeader
        title={`Import a file from ${channel.name}`}
        meta={kind === "orders"
          ? "The order report exported from the seller portal (CSV, TSV or Excel)."
          : "The payout / settlement report. Marks what the marketplace has actually paid."}
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="What is in the file">
          <Select value={kind} onChange={(e) => { setKind(e.target.value as "orders" | "settlements"); reset(); }}>
            <option value="orders">Orders</option>
            <option value="settlements">Payouts (settlements)</option>
          </Select>
        </Field>
        <Field label="File" className="sm:col-span-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,.tsv,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); reset(); }}
            className={`${inputClass} py-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1 file:text-sm`}
          />
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" disabled={!file || previewM.isPending} onClick={() => previewM.mutate()}>
          {previewM.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          <span className="ml-1.5">Check the file</span>
        </Button>
      </div>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {preview && (
        <div className="mt-5 space-y-4">
          {/* Which column answers each field. A missing one can be chosen by name. */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Columns recognised</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {preview.columns.map((c) => {
                const missing = preview.missing.includes(c.field);
                return (
                  <div key={c.field} className="flex items-center justify-between gap-3 text-sm">
                    <span className={missing ? "text-red-700 font-medium" : "text-gray-700"}>{FIELD_LABEL[c.field] ?? c.field}</span>
                    {c.header
                      ? <span className="text-gray-900 truncate max-w-[55%]" title={c.header}>{c.header}</span>
                      : missing ? (
                        <select
                          className="h-8 rounded-md border border-red-300 text-sm max-w-[55%]"
                          value={overrides[c.field] ?? ""}
                          onChange={(e) => setOverrides((o) => ({ ...o, [c.field]: e.target.value }))}
                        >
                          <option value="">choose a column…</option>
                          {preview.unused.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      ) : <span className="text-gray-400">not in file</span>}
                  </div>
                );
              })}
            </div>
            {preview.missing.length > 0 && (
              <Button className="mt-3" disabled={preview.missing.some((f) => !overrides[f]) || previewM.isPending} onClick={() => previewM.mutate()}>
                Check again with these columns
              </Button>
            )}
          </div>

          {preview.ready && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-800 space-y-1">
              <div><strong>{preview.orders}</strong> {kind === "orders" ? "orders" : "payouts"} in <strong>{preview.rows_total}</strong> rows
                {kind === "orders" && <> · <strong>{preview.stock_units}</strong> units would come off stock</>}</div>
              {preview.problems.map((p, i) => <div key={i} className="text-amber-800">{p}</div>)}
              {preview.sample.length > 0 && (
                <details className="pt-1">
                  <summary className="cursor-pointer text-xs text-gray-500">First few, as read</summary>
                  <pre className="mt-1 text-[11px] leading-snug overflow-x-auto">{JSON.stringify(preview.sample, null, 1)}</pre>
                </details>
              )}
            </div>
          )}

          {preview.ready && (
            <div className="flex flex-wrap items-center gap-3">
              {kind === "orders" && (
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={adjustStock} onChange={(e) => setAdjustStock(e.target.checked)} className="h-4 w-4 accent-ink" />
                  Take these units off stock
                  <span className="text-xs text-gray-400">(untick if you counted the shelf after these sold)</span>
                </label>
              )}
              <Button variant="primary" disabled={importM.isPending} onClick={() => importM.mutate()}>
                {importM.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span className="ml-1.5">Import {preview.orders} {kind === "orders" ? "orders" : "payouts"}</span>
              </Button>
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="mt-5 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-gray-800 space-y-1">
          <div>
            {result.kind === "orders"
              ? <><strong>{result.orders_created}</strong> new, <strong>{result.orders_updated}</strong> moved on, {result.orders_unchanged} already known
                {result.stock_adjusted > 0 && <> · {result.stock_adjusted} units off stock</>}</>
              : <><strong>{result.orders_updated}</strong> orders marked paid, {result.orders_unchanged} already were</>}
            {result.rows_skipped > 0 && <> · {result.rows_skipped} rows skipped</>}
          </div>
          {result.problems.map((p, i) => <div key={i} className="text-amber-800">{p}</div>)}
        </div>
      )}
    </Card>
  );
}

// ── Listings: their SKU -> our piece ─────────────────────────────────────────

function ListingsPanel({ channel, listings, variants, onChange }: {
  channel: Channel; listings: Listing[]; variants: (Variant & { label: string })[]; onChange: () => void;
}) {
  const [sku, setSku] = useState("");
  const [variantId, setVariantId] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: async () => adminApi.put(`/channels/${channel.code}/listings`, {
      items: [{ external_sku: sku.trim(), product_variant_id: variantId }],
    }),
    onSuccess: () => { setSku(""); setVariantId(""); setErr(null); onChange(); },
    onError: (e: unknown) => setErr(detail(e, "Could not save that mapping.")),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => adminApi.delete(`/channels/${channel.code}/listings/${id}`),
    onSuccess: onChange,
  });

  return (
    <Card>
      <CardHeader
        title="Listings"
        meta={`What ${channel.name} calls each piece. A SKU listed under the same code as ZISUN's needs no mapping.`}
      />
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-3 items-end">
        <Field label={`${channel.name} SKU`}>
          <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="as it appears in their file" />
        </Field>
        <Field label="Is this piece">
          <Select value={variantId} onChange={(e) => setVariantId(e.target.value)}>
            <option value="">choose…</option>
            {variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </Select>
        </Field>
        <Button variant="primary" disabled={!sku.trim() || !variantId || add.isPending} onClick={() => add.mutate()}>Map</Button>
      </div>
      {err && <p className="mt-2 text-sm text-red-700">{err}</p>}

      {listings.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">Nothing mapped yet.</p>
      ) : (
        <div className="mt-4">
          {/* Stacked rows on a phone; the table from sm up. A table that
              scrolls inside its frame still fails the phone-width harness,
              and this list is short enough to read as rows. */}
          <ul className="sm:hidden divide-y divide-gray-100">
            {listings.map((l) => (
              <li key={l.id} className="py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-xs text-gray-900 truncate">{l.external_sku}</div>
                  <div className="text-sm text-gray-800 truncate">{l.product_name}</div>
                  <div className="text-xs text-gray-500">{[l.size, l.colour].filter(Boolean).join(" / ")} · {l.sku} · stock {l.stock ?? "—"}</div>
                </div>
                <Button size="sm" onClick={() => remove.mutate(l.id)}>Remove</Button>
              </li>
            ))}
          </ul>
          <div className="hidden sm:block">
          <TableScroll minWidth={520}>
            <table className="w-full">
              <thead><tr>
                <th className={th}>{channel.name} SKU</th><th className={th}>ZISUN piece</th><th className={th}>Stock</th><th className={th}></th>
              </tr></thead>
              <tbody>
                {listings.map((l) => (
                  <tr key={l.id} className="border-t border-gray-100">
                    <td className={td}><span className="font-mono text-xs">{l.external_sku}</span></td>
                    <td className={td}>{l.product_name} <span className="text-gray-500">{[l.size, l.colour].filter(Boolean).join(" / ")}</span> <span className="font-mono text-xs text-gray-400">{l.sku}</span></td>
                    <td className={td}>{l.stock ?? "—"}</td>
                    <td className={td}><Button size="sm" onClick={() => remove.mutate(l.id)}>Remove</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── History: every file, and what it did ─────────────────────────────────────

function HistoryPanel({ imports }: { imports: ImportRow[] }) {
  if (imports.length === 0) return null;
  return (
    <Card>
      <CardHeader title="Files brought in" />
      <ul className="divide-y divide-gray-100">
        {imports.map((i) => (
          <li key={i.id} className="py-2.5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-gray-900 truncate max-w-[60%]" title={i.filename}>{i.filename}</span>
              <span className="text-xs text-gray-500">{when(i.created_at)} · {i.kind}</span>
            </div>
            <div className="text-xs text-gray-600 mt-0.5">
              {i.rows_total} rows · {i.orders_created} new · {i.orders_updated} moved on{i.rows_skipped ? ` · ${i.rows_skipped} skipped` : ""}
            </div>
            {i.problems && i.problems.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-amber-800">{i.problems.length} noted</summary>
                <ul className="mt-1 text-xs text-gray-700 list-disc pl-4 space-y-0.5">{i.problems.map((p, k) => <li key={k}>{p}</li>)}</ul>
              </details>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function detail(e: unknown, fallback: string): string {
  const d = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof d === "string" ? d : fallback;
}
