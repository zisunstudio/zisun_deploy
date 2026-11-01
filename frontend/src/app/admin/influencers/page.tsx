"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download } from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import { Button, Card, CardHeader, EmptyState, Field, Input, Page, Pill, Select, Textarea } from "@/components/admin/ui";
import LandingPicker, { choiceFromPath, choiceReady, resolveLanding, type Choice } from "@/components/admin/LandingPicker";
import { linkFor, pathFor, type Landing } from "@/lib/influencerLink";

/**
 * Influencers: who sends visitors, who sells, and what each is owed.
 *
 * Every number comes from things that already happen on the site - the
 * events each visit sends carry the influencer whose link was last tapped,
 * and orders carry who was credited (services/influencer.py). Clicks are
 * taps on her link; sessions are visits; visitors are phones. Orders count
 * only when real: a prepaid order nobody paid for is not one, and a COD
 * order is "owed" until the courier hands the cash over.
 */

type Perf = {
  id: string; name: string; code: string; instagram: string | null; is_active: boolean; discount_code: string | null; commission_rule: string;
  clicks: number; visitors: number; returning_visitors: number; sessions: number; product_views: number; add_to_cart: number; checkouts: number;
  orders: number; customers: number; orders_by_code: number; orders_by_link: number;
  statuses: Record<"confirmed" | "delivered" | "cod_pending" | "cancelled" | "returned" | "unpaid", number>;
  collected_paise: number; committed_paise: number; conversion: number | null; aov_paise: number | null;
  commission: { pending_paise: number; payable_paise: number; paid_paise: number; reversed_paise: number };
  top_viewed: { id: string; name: string; views: number }[]; top_bought: { id: string; name: string; units: number }[];
};
type PerfData = { totals: Record<string, number | null>; influencers: Perf[]; window_days: number };
type Influencer = {
  id: string; name: string; code: string; instagram: string | null; phone: string | null; collection_id: string | null; landing: string | null;
  commission_type: "percent" | "fixed"; commission_value: number; is_active: boolean; notes: string | null;
  discount_code: string | null; discount_percent: number | null;
};
type Commission = { id: string; order_ref: string; ordered_at: string | null; order_status: string; payment_method: string; order_total_paise: number; base_paise: number; amount_paise: number; rule: string; status: string; reason: string | null; payout_ref: string | null };
type Collection = { id: string; name: string; slug: string; is_published: boolean; product_ids: string[] };
const codeFrom = (raw: string) => raw.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);

const rs = (p: number | null | undefined) => (p == null ? "—" : `₹${Math.round(p / 100).toLocaleString("en-IN")}`);
const n = (v: number | null | undefined) => (v ?? 0).toLocaleString("en-IN");
const pct = (r: number | null | undefined) => (r == null ? "—" : `${(r * 100).toFixed(r < 0.1 ? 1 : 0)}%`);
const errorText = (e: unknown, fallback: string) => {
  const d = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof d === "string" ? d : fallback;
};

// ── Date ranges, in India time ───────────────────────────────────────────────
type RangeKey = "today" | "yesterday" | "7" | "30" | "month" | "last_month" | "custom";
const RANGE_LABEL: Record<RangeKey, string> = { today: "Today", yesterday: "Yesterday", "7": "Last 7 days", "30": "Last 30 days", month: "This month", last_month: "Last month", custom: "Custom" };
const IST = 330 * 60_000;
const istDay = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10);
const istStart = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - IST);
function rangeFor(k: RangeKey, from: string, to: string): { start: Date; end: Date } {
  const today = istDay(new Date());
  const addDays = (day: string, d: number) => istDay(new Date(istStart(day).getTime() + d * 86_400_000 + IST / 2));
  const tomorrow = istStart(addDays(today, 1));
  switch (k) {
    case "today": return { start: istStart(today), end: tomorrow };
    case "yesterday": return { start: istStart(addDays(today, -1)), end: istStart(today) };
    case "7": return { start: istStart(addDays(today, -6)), end: tomorrow };
    case "30": return { start: istStart(addDays(today, -29)), end: tomorrow };
    case "month": return { start: istStart(`${today.slice(0, 7)}-01`), end: tomorrow };
    case "last_month": {
      const first = `${today.slice(0, 7)}-01`;
      const prev = addDays(first, -1);
      return { start: istStart(`${prev.slice(0, 7)}-01`), end: istStart(first) };
    }
    default: return { start: istStart(from), end: istStart(addDays(to, 1)) };
  }
}

const EMPTY_FORM = { name: "", code: "", instagram: "", phone: "", collection_id: "", commission_type: "percent" as "percent" | "fixed", commission_value: "10", is_active: true, notes: "", discount_code: "", discount_percent: "10" };

export default function InfluencersPage() {
  const qc = useQueryClient();
  const [range, setRange] = useState<RangeKey>("30");
  const today = istDay(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const { start, end } = useMemo(() => rangeFor(range, from, to), [range, from, to]);

  const perf = useQuery<PerfData>({
    queryKey: ["admin", "influencers", "perf", start.toISOString(), end.toISOString()],
    queryFn: async () => (await adminApi.get("/influencers/performance", { params: { start: start.toISOString(), end: end.toISOString() } })).data,
    enabled: range !== "custom" || from <= to,
  });
  const list = useQuery<Influencer[]>({ queryKey: ["admin", "influencers", "list"], queryFn: async () => (await adminApi.get("/influencers")).data });
  const cols = useQuery<Collection[]>({ queryKey: ["admin", "collections"], queryFn: async () => (await adminApi.get("/collections")).data });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "influencers"] });

  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice>({ kind: "pieces", ids: [] });
  const [made, setMade] = useState<{ for: Choice; landing: Landing } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const startEdit = (id: string | "new") => {
    setFormMsg(null);
    if (id === "new") { setForm(EMPTY_FORM); setChoice({ kind: "pieces", ids: [] }); setEditing("new"); return; }
    const i = list.data?.find((x) => x.id === id);
    if (!i) return;
    setChoice(choiceFromPath(i.landing, cols.data?.find((c) => c.id === i.collection_id)?.slug));
    setForm({ name: i.name, code: i.code, instagram: i.instagram ?? "", phone: (i.phone ?? "").replace(/^\+91/, ""), collection_id: i.collection_id ?? "",
      commission_type: i.commission_type, commission_value: String(i.commission_type === "fixed" ? i.commission_value / 100 : i.commission_value),
      is_active: i.is_active, notes: i.notes ?? "", discount_code: i.discount_code ?? "", discount_percent: String(i.discount_percent ?? 10) });
    setEditing(id);
  };
  const save = useMutation({
    mutationFn: async () => {
      const v = Number(form.commission_value) || 0;
      const code = codeFrom(form.code || form.name);
      // "A few pieces" becomes its own collection, made now, live at once -
      // once: a retry after an error (a taken link name) reuses the page
      // already made instead of making another.
      const landing = made && made.for === choice ? made.landing : await resolveLanding(choice, code, form.name, `${form.name.split(" ")[0]}'s edit`);
      setMade({ for: choice, landing });
      const body = {
        name: form.name.trim(), code: form.code.trim() || null, instagram: form.instagram.trim() || null,
        phone: /^[6-9]\d{9}$/.test(form.phone.trim()) ? `+91${form.phone.trim()}` : null,
        collection_id: null, landing: pathFor(landing), commission_type: form.commission_type,
        commission_value: form.commission_type === "fixed" ? Math.round(v * 100) : Math.round(v),
        is_active: form.is_active, notes: form.notes.trim() || null,
        discount_code: form.discount_code.trim() || null, discount_percent: form.discount_code.trim() ? Number(form.discount_percent) || 10 : null,
      };
      return editing === "new" ? adminApi.post("/influencers", body) : adminApi.put(`/influencers/${editing}`, body);
    },
    onSuccess: () => { setEditing(null); refresh(); qc.invalidateQueries({ queryKey: ["admin", "collections"] }); },
    onError: (e) => setFormMsg(errorText(e, e instanceof Error && !("response" in e) ? e.message : "Could not save.")),
  });

  const rows = perf.data?.influencers ?? [];
  const t = perf.data?.totals ?? {};
  const copy = (text: string, key: string) => { navigator.clipboard?.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); };

  function exportCsv() {
    const head = ["Influencer", "Link", "Discount code", "Clicks", "Unique visitors", "Returning visitors", "Sessions", "Product views", "Added to bag", "Checkouts", "Orders", "Orders by code", "Orders by link",
      "Confirmed (prepaid)", "Delivered", "COD not yet delivered", "Cancelled", "Returned", "Collected (Rs)", "Owed COD (Rs)", "Conversion %", "Average order (Rs)",
      "Commission pending (Rs)", "Commission payable (Rs)", "Commission paid (Rs)", "Top viewed", "Top bought"];
    const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = rows.map((r) => [r.name, `https://zisun.in/r/${r.code}`, r.discount_code ?? "", r.clicks, r.visitors, r.returning_visitors, r.sessions, r.product_views, r.add_to_cart, r.checkouts,
      r.orders, r.orders_by_code, r.orders_by_link, r.statuses.confirmed, r.statuses.delivered, r.statuses.cod_pending, r.statuses.cancelled, r.statuses.returned,
      r.collected_paise / 100, r.committed_paise / 100, r.conversion == null ? "" : (r.conversion * 100).toFixed(1), r.aov_paise == null ? "" : r.aov_paise / 100,
      r.commission.pending_paise / 100, r.commission.payable_paise / 100, r.commission.paid_paise / 100,
      r.top_viewed.map((p) => `${p.name} (${p.views})`).join("; "), r.top_bought.map((p) => `${p.name} (${p.units})`).join("; ")].map(esc).join(","));
    const blob = new Blob(["﻿" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `zisun-influencers-${istDay(start)}-to-${istDay(new Date(end.getTime() - 1))}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Page title="Influencers" description="Who sends visitors, who sells, and what each is owed."
      actions={<div className="flex flex-wrap gap-2"><Button onClick={exportCsv} disabled={!rows.length}><Download className="w-4 h-4" /> CSV</Button><Button variant="primary" onClick={() => startEdit("new")}>Add influencer</Button></div>}>

      {editing && (
        <Card className="mb-4">
          <CardHeader title={editing === "new" ? "Add an influencer" : `Edit ${form.name}`} />
          <div className="space-y-3">
            <Field label={<>Name <span className="text-red-500">*</span></>}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Her link" hint={editing === "new" ? "Leave blank to use her name. It cannot be changed later - posts will already carry it." : "Fixed: posts already carry it."}>
              <div className="flex items-center gap-1"><span className="text-sm text-gray-500 shrink-0">zisun.in/r/</span>
                <Input value={form.code} disabled={editing !== "new"} onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} placeholder="riya" /></div>
            </Field>
            <Field label="Her link opens" hint="Pick the pieces in her reel, one piece, a category or the home page. You can make a different link for each reel later, from her card.">
              <LandingPicker value={choice} onChange={setChoice} />
            </Field>
            <div className="flex flex-wrap gap-3">
              <Field label="Commission" className="w-40"><Select value={form.commission_type} onChange={(e) => setForm({ ...form, commission_type: e.target.value as "percent" | "fixed" })}>
                <option value="percent">% of the goods</option><option value="fixed">₹ per order</option></Select></Field>
              <Field label={form.commission_type === "percent" ? "Percent" : "Rupees"} className="w-28"><Input inputMode="numeric" value={form.commission_value} onChange={(e) => setForm({ ...form, commission_value: e.target.value.replace(/[^0-9.]/g, "") })} /></Field>
            </div>
            <div className="flex flex-wrap gap-3">
              <Field label="Her discount code" hint="Optional. Not shown on the site; she announces it." className="flex-1 min-w-[160px]"><Input value={form.discount_code} onChange={(e) => setForm({ ...form, discount_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} placeholder="RIYA10" /></Field>
              <Field label="% off" className="w-24"><Input inputMode="numeric" value={form.discount_percent} onChange={(e) => setForm({ ...form, discount_percent: e.target.value.replace(/\D/g, "") })} /></Field>
            </div>
            <Field label="Instagram"><Input value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} placeholder="https://instagram.com/…" /></Field>
            <Field label="Her phone" hint="Only to recognise her own orders, which earn nothing."><Input inputMode="numeric" maxLength={10} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "") })} /></Field>
            <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="What was agreed, when, for which posts." /></Field>
            <label className="flex items-center justify-between gap-3"><span className="text-sm text-gray-700">Active <span className="text-xs text-gray-500">— off stops new credit; her link still opens the shop</span></span>
              <input type="checkbox" className="h-5 w-5" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /></label>
            <div className="flex gap-2"><Button variant="primary" disabled={!form.name.trim() || !choiceReady(choice) || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</Button><Button onClick={() => setEditing(null)}>Cancel</Button></div>
            {formMsg && <p className="text-xs text-red-700">{formMsg}</p>}
          </div>
        </Card>
      )}

      <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Date range">
        {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={range === k} onClick={() => setRange(k)}
            className={`h-9 px-3 rounded-full text-sm border ${range === k ? "bg-ink text-white border-ink" : "bg-white text-gray-700 border-gray-300"}`}>{RANGE_LABEL[k]}</button>
        ))}
      </div>
      {range === "custom" && (
        <div className="mb-3 flex flex-wrap gap-3">
          <label className="text-xs text-gray-600">From<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="block mt-1 h-10 rounded-lg border border-gray-300 px-2 text-sm" /></label>
          <label className="text-xs text-gray-600">To<input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className="block mt-1 h-10 rounded-lg border border-gray-300 px-2 text-sm" /></label>
        </div>
      )}

      {perf.isError && <Card className="mb-3"><p className="text-sm text-red-700">This did not load. Try another range or refresh.</p></Card>}

      <Card className="mb-4">
        <ul className="flex flex-wrap -mx-2">
          {[
            ["Active influencers", n(t.influencers_active as number)], ["Link taps", n(t.clicks as number)], ["Visitors", n(t.visitors as number)],
            ["Orders", n(t.orders as number)], ["Collected", rs(t.collected_paise as number)], ["Owed (COD)", rs(t.committed_paise as number)],
            ["Visitors who ordered", pct(t.conversion as number | null)], ["Commission to pay", rs(t.commission_payable_paise as number)], ["Commission pending", rs(t.commission_pending_paise as number)],
          ].map(([label, value]) => (
            <li key={label} className="w-1/2 sm:w-1/3 px-2 py-2"><span className="block text-xs text-gray-500">{label}</span><span className="block text-lg font-semibold text-gray-900 tabular-nums">{perf.isLoading ? "…" : value}</span></li>
          ))}
        </ul>
        <p className="mt-1 text-[11px] text-gray-500">Commission totals are all-time; everything else is the range above. An order is hers when it used her code, or when her link was the last one tapped within {perf.data?.window_days ?? 30} days. Commission becomes payable 14 days after delivery.</p>
      </Card>

      {!perf.isLoading && rows.length === 0 && <Card><EmptyState title="No influencers yet" body="Add one, choose the collection her link lands on, and send her the link." /></Card>}

      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id}>
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{r.name}</p>
                  <p className="text-xs text-gray-500">{r.commission_rule}{r.discount_code ? ` · code ${r.discount_code}` : ""}</p>
                </div>
                <Pill tone={r.is_active ? "good" : "neutral"}>{r.is_active ? "Active" : "Paused"}</Pill>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 break-all">zisun.in/r/{r.code}</code>
                <Button size="sm" onClick={() => copy(`https://zisun.in/r/${r.code}`, r.id)}><Copy className="w-3.5 h-3.5" /> {copied === r.id ? "Copied" : "Copy link"}</Button>
                <Button size="sm" onClick={() => startEdit(r.id)}>Edit</Button>
                <Button size="sm" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Hide orders" : "Orders & payouts"}</Button>
              </div>
              <ul className="mt-3 flex flex-wrap -mx-2 text-sm">
                {[
                  ["Link taps", n(r.clicks)], ["Visitors", `${n(r.visitors)}${r.returning_visitors ? ` (${r.returning_visitors} back)` : ""}`], ["Visits", n(r.sessions)],
                  ["Pieces opened", n(r.product_views)], ["Added to bag", n(r.add_to_cart)], ["Reached checkout", n(r.checkouts)],
                  ["Orders", `${n(r.orders)}${r.orders ? ` (${r.orders_by_link} link · ${r.orders_by_code} code)` : ""}`], ["Collected", rs(r.collected_paise)], ["Owed (COD)", rs(r.committed_paise)],
                  ["Visitors who ordered", pct(r.conversion)], ["Average order", rs(r.aov_paise)],
                  ["Commission", `${rs(r.commission.payable_paise)} to pay · ${rs(r.commission.pending_paise)} pending · ${rs(r.commission.paid_paise)} paid`],
                ].map(([label, value]) => (
                  <li key={label} className="w-1/2 sm:w-1/3 px-2 py-1.5"><span className="block text-[11px] text-gray-500">{label}</span><span className="block text-gray-900 tabular-nums break-words">{value}</span></li>
                ))}
              </ul>
              {r.orders + r.statuses.cancelled + r.statuses.returned > 0 && (
                <p className="mt-1 text-xs text-gray-600">
                  {[["confirmed", "paid, on the way"], ["delivered", "delivered"], ["cod_pending", "COD not yet delivered"], ["cancelled", "cancelled"], ["returned", "returned"]]
                    .filter(([k]) => r.statuses[k as keyof Perf["statuses"]] > 0).map(([k, label]) => `${r.statuses[k as keyof Perf["statuses"]]} ${label}`).join(" · ")}
                </p>
              )}
              {(r.top_viewed.length > 0 || r.top_bought.length > 0) && (
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-xs">
                  {r.top_viewed.length > 0 && <div className="min-w-0"><p className="text-gray-500">Most opened</p>{r.top_viewed.slice(0, 3).map((p) => <p key={p.id} className="text-gray-800 truncate">{p.name} · {p.views}</p>)}</div>}
                  {r.top_bought.length > 0 && <div className="min-w-0"><p className="text-gray-500">Most bought</p>{r.top_bought.slice(0, 3).map((p) => <p key={p.id} className="text-gray-800 truncate">{p.name} · {p.units}</p>)}</div>}
                </div>
              )}
              <ReelLinks code={r.code} name={r.name} collections={cols.data ?? []} />
              {open === r.id && <Commissions influencerId={r.id} onChange={refresh} />}
            </Card>
          </li>
        ))}
      </ul>
    </Page>
  );
}

const STATUS_WORDS: Record<string, string> = { pending: "Waiting for delivery + 14 days", earned: "To pay", paid: "Paid", void: "No commission", reversed: "Came back after payment" };

function Commissions({ influencerId, onChange }: { influencerId: string; onChange: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<Commission[]>({ queryKey: ["admin", "influencers", "commissions", influencerId], queryFn: async () => (await adminApi.get(`/influencers/${influencerId}/commissions`)).data });
  const [ref, setRef] = useState("");
  const payable = (data ?? []).filter((c) => c.status === "earned");
  const pay = useMutation({
    mutationFn: () => adminApi.post("/influencers/commissions/pay", { ids: payable.map((c) => c.id), payout_ref: ref.trim() }),
    onSuccess: () => { setRef(""); qc.invalidateQueries({ queryKey: ["admin", "influencers"] }); onChange(); },
  });
  if (isLoading) return <p className="mt-3 text-xs text-gray-500">Loading…</p>;
  if (!data?.length) return <p className="mt-3 text-xs text-gray-500">No orders credited to her yet.</p>;
  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      {payable.length > 0 && (
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <Field label={`Pay ${rs(payable.reduce((s, c) => s + c.amount_paise, 0))} for ${payable.length} ${payable.length === 1 ? "order" : "orders"} - UPI reference`} className="flex-1 min-w-[200px]">
            <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. UPI 4312…" />
          </Field>
          <Button variant="primary" disabled={!ref.trim() || pay.isPending} onClick={() => pay.mutate()}>Mark paid</Button>
        </div>
      )}
      <ul className="divide-y divide-gray-100">
        {data.map((c) => (
          <li key={c.id} className="py-2 flex items-start justify-between gap-3 text-sm">
            <span className="min-w-0">
              <span className="block text-gray-900">#{c.order_ref} · {c.ordered_at ? new Date(c.ordered_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""} · {rs(c.order_total_paise)} {c.payment_method === "COD" ? "COD" : "prepaid"}</span>
              <span className="block text-xs text-gray-500">{c.order_status.toLowerCase().replace("_", " ")} · {c.rule} of {rs(c.base_paise)}{c.reason ? ` · ${c.reason}` : ""}{c.payout_ref ? ` · ref ${c.payout_ref}` : ""}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block tabular-nums text-gray-900">{rs(c.amount_paise)}</span>
              <Pill tone={c.status === "earned" ? "warn" : c.status === "paid" ? "good" : c.status === "pending" ? "neutral" : "bad"}>{STATUS_WORDS[c.status] ?? c.status}</Pill>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A link for each reel. The pieces she shows in one reel become a page of
 * exactly those pieces; every link credits her the same way. Links made
 * here are listed under her card (the collections named after her code).
 */
function ReelLinks({ code, name, collections }: { code: string; name: string; collections: Collection[] }) {
  const qc = useQueryClient();
  const [making, setMaking] = useState(false);
  const [title, setTitle] = useState("");
  const [choice, setChoice] = useState<Choice>({ kind: "pieces", ids: [] });
  const [made, setMade] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const mine = collections.filter((c) => c.slug.startsWith(`${code}-`));
  const make = useMutation({
    mutationFn: async () => linkFor(code, await resolveLanding(choice, code, name, title || `${name.split(" ")[0]}'s reel`)),
    onSuccess: (link) => { setMade(link); setMsg(null); qc.invalidateQueries({ queryKey: ["admin", "collections"] }); },
    onError: () => setMsg("Could not make that link. Try again."),
  });
  const copy = (t: string) => { navigator.clipboard?.writeText(t); setCopied(t); setTimeout(() => setCopied(null), 1500); };
  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      {mine.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {mine.map((c) => {
            const link = linkFor(code, { kind: "collection", slug: c.slug });
            return (
              <li key={c.id} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1"><span className="block text-gray-900 truncate">{c.name} · {c.product_ids.length} {c.product_ids.length === 1 ? "piece" : "pieces"}</span><span className="block text-gray-500 truncate">{link.replace("https://", "")}</span></span>
                <Button size="sm" onClick={() => copy(link)}>{copied === link ? "Copied" : "Copy"}</Button>
              </li>
            );
          })}
        </ul>
      )}
      {!making ? (
        <Button size="sm" onClick={() => { setMaking(true); setMade(null); }}>New link for a reel</Button>
      ) : (
        <div className="space-y-3 rounded-lg bg-gray-50 p-3">
          <Field label="What is the reel?" hint="Optional, for you: e.g. Diwali reel, teal colours."><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <LandingPicker value={choice} onChange={(c) => { setChoice(c); setMade(null); }} />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={!choiceReady(choice) || make.isPending} onClick={() => make.mutate()}>{make.isPending ? "Making…" : "Make the link"}</Button>
            <Button onClick={() => { setMaking(false); setTitle(""); setChoice({ kind: "pieces", ids: [] }); }}>Close</Button>
          </div>
          {made && (
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-xs bg-white border border-gray-200 rounded px-2 py-1 break-all">{made.replace("https://", "")}</code>
              <Button size="sm" onClick={() => copy(made)}>{copied === made ? "Copied" : "Copy link"}</Button>
            </div>
          )}
          {msg && <p className="text-xs text-red-700">{msg}</p>}
        </div>
      )}
    </div>
  );
}
