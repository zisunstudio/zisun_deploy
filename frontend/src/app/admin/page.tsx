"use client";
import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { AlertTriangle, Info, Lightbulb, OctagonAlert } from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import { Page, Card, Button, Pill, StockBadge, Swatch, Sku, TableScroll, LinkButton, th, td } from "@/components/admin/ui";
import { BarList, Funnel, StatTile, TrendChart, compact, fmtInt, fmtRupees } from "@/components/admin/charts";
import { Behaviour, type BehaviourData } from "./Behaviour";
import { SOURCE_NOTES, mergeSources, sourceName } from "@/lib/report/labels";
import { ReportButtons } from "./ReportButtons";

/**
 * The founder's board.
 *
 * Built around ZISUN's own funnel - a product is shown, opened, put in the
 * bag, asked about on WhatsApp, and ordered - not a generic shop's. The
 * order on the page is what happened → what needs attention → what women
 * are looking at → the funnel → stock. The week leads; the founder opening
 * this at four in the morning should read the week, not the hour.
 *
 * Every number has a stated denominator. "Open rate" compares opens that
 * came from tapping a card with card impressions, and only those; an open
 * from a shared link was never "shown", and comparing the two is how a
 * product reported a 273% open rate.
 */
type Funnel = { key: string; label: string; count: number };
type ProductRow = {
  id: string; name: string; shelf_rank: number | null; impressions: number; views: number; views_from_cards: number;
  add_to_cart: number; whatsapp_clicks: number; whatsapp_marked_ordered: number;
  ctr: number | null; cart_rate: number | null; attention: number;
  orders?: number; units_sold?: number; revenue_paise?: number; buy_rate?: number | null;
  buy_now?: number; checkout_initiated?: number; intent?: number;
  /** The whole path for this piece, in order, so the drop-off is visible. */
  journey?: Array<{ key: string; label: string; count: number }>;
  /** Where this piece loses the most people, by people lost. */
  gap?: { from: string; to: string; from_count: number; to_count: number; lost: number; rate: number; step: string } | null;
  stock_left: number; lowest_variant: { size: string; colour: string; stock: number } | null;
};
type SeriesRow = { date: string; sessions: number; opens: number; bag_adds: number; impressions: number; enquiries: number; orders: number; collected_paise: number; committed_paise: number };
type MetricKey = "sessions" | "opens" | "bag_adds" | "enquiries" | "orders" | "collected_paise";
type Dash = {
  series?: { current: SeriesRow[]; previous: SeriesRow[] };
  meta: { window_start?: string; window_days: number; checkout_enabled: boolean; launch_mode: string; events_recorded: number; errors?: string[]; generated_at?: string };
  week: { sessions: number; sessions_previous: number; opens: number; opens_previous: number; bag_adds: number; bag_adds_previous: number; enquiries: number; enquiries_previous: number; orders: number; revenue_paise: number; committed_paise: number; whatsapp_marked_ordered: number; whatsapp_marked_revenue_paise: number };
  whatsapp: { enquiries_window: number; ordered_window: number; revenue_window_paise: number; conversion: number | null; unanswered: number };
  attention_items: Array<{ severity: "critical" | "warn" | "info"; title: string; body: string; href: string | null }>;
  insight: string | null;
  commerce: {
    orders_all_time: number; orders_window: number; revenue_window_paise: number;
    by_payment_method: Record<string, { orders: number; revenue: number }>; by_status: Record<string, number>;
    customers: number; contribution_margin: number | null; contribution_margin_blocked_on: string[];
    /** One definition of money: collected is in, committed is owed. Never added. */
    money: { collected_paise: number; committed_paise: number; lost_paise: number; refunded_paise: number; orders: number; by_kind: Record<string, number> };
    payment: { attempted: number; succeeded: number; failed: number; abandoned: number; in_flight: number; success_rate: number | null; abandon_rate: number | null; mismatched: number };
  };
  behaviour?: BehaviourData;
  acquisition?: { by_source: Array<{ source: string; orders: number; collected_paise: number; committed_paise: number; sessions: number; visitors: number; conversion: number | null }>; partial: boolean };
  attention: { by_period?: ByPeriod; sessions: number; sessions_previous?: number; funnel: Funnel[]; size_guide_opens?: number; products_by_views: { id: string; name: string; views: number }[]; never_viewed: { id: string; name: string }[]; products?: ProductRow[]; ranking?: { window_days: number; half_life_days: number; weights: Record<string, number> } };
  inventory: { units: number; variants: number; by_size: { size: string; variants: number; units: number }[]; low_stock: { product: string; size: string; colour?: string; sku: string; stock: number }[]; low_stock_threshold: number };
};
type BriefPayload = { brief: { headline: string; bullets: string[]; critical: string[]; source: string }; facts?: { as_of?: string } };

/** The six figures that lead the board; each is also a tab for the trend chart. */
const TILES: { key: MetricKey; label: string; money?: boolean; note?: string; hint: string }[] = [
  { key: "sessions", label: "Visits", hint: "Visits to the site, day by day, against the same number of days before." },
  { key: "opens", label: "Product opens", hint: "Product pages opened each day." },
  { key: "bag_adds", label: "Added to bag", hint: "Bag adds each day, including Buy now." },
  // A tap on a WhatsApp button. The site cannot see whether a message was
  // ever sent, so it is never called a conversation or an order.
  { key: "enquiries", label: "WhatsApp taps", note: "opened a chat - not a message, not an order", hint: "Taps on a WhatsApp button each day. The site cannot see whether a message followed." },
  { key: "orders", label: "Orders", note: "placed and not cancelled", hint: "Orders placed each day - website and marketplaces, cancelled ones left out." },
  { key: "collected_paise", label: "Collected", money: true, hint: "Money in, by the day the order was placed: prepaid paid, COD delivered, marketplace settled." },
];

const rupees = (paise: number) => "₹" + Math.round(paise / 100).toLocaleString("en-IN");
const pct = (r: number | null | undefined) => (r == null ? "—" : `${Math.round(r * 100)}%`);

function Stat({ label, value, note, trend, empty }: { label: string; value: React.ReactNode; note?: string; trend?: React.ReactNode; empty?: boolean }) {
  return (
    <Card className="flex flex-col gap-1 !p-3.5 sm:!p-4">
      <p className="text-xs text-gray-600">{label}</p>
      <p className={`text-[24px] sm:text-[26px] leading-none font-semibold ${empty ? "text-gray-400" : "text-gray-900"}`}>{value}</p>
      <div className="flex items-center justify-between gap-2 mt-1 min-h-[16px]">{note ? <p className="text-[11px] text-gray-500 leading-snug">{note}</p> : <span />}{trend}</div>
    </Card>
  );
}

type PeriodKey = "day" | "week" | "month" | "year";
type PeriodCounts = { impressions: number; opens: number };
type ByPeriod = { starts: Record<PeriodKey, string>; products: { id: string; name: string; periods: Record<PeriodKey, PeriodCounts> }[] };

const PERIOD_LABEL: Record<PeriodKey | "custom", string> = { day: "Today", week: "This week", month: "This month", year: "This year", custom: "Custom" };

/**
 * Impressions and opens per piece, for the period she picks.
 *
 * Today / week / month / year are calendar periods in India time and arrive
 * with the board, all four at once, so switching is instant and each number
 * is counted from the events' own timestamps. Custom asks the API once, only
 * when chosen. Sorted by opens, so it is still "most opened" for the period.
 */
const NOT_LOADED = "This did not load just now. Your pieces are safe. Tap Try again at the top of this page.";

function AttentionByPeriod({ data, failed }: { data?: ByPeriod; failed?: boolean }) {
  const [period, setPeriod] = useState<PeriodKey | "custom">("week");
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const custom = useQuery<{ products: { id: string; name: string; impressions: number; opens: number }[] }>({
    queryKey: ["admin", "product-attention", from, to],
    enabled: period === "custom" && !!from && !!to && from <= to,
    queryFn: async () => (await adminApi.get("/dashboard/product-attention", { params: { start: from, end: to } })).data,
  });

  const rows = useMemo(() => {
    const list = period === "custom"
      ? (custom.data?.products ?? []).map((p) => ({ id: p.id, name: p.name, impressions: p.impressions, opens: p.opens }))
      : (data?.products ?? []).map((p) => ({ id: p.id, name: p.name, ...p.periods[period] }));
    return [...list].sort((a, b) => b.opens - a.opens || b.impressions - a.impressions);
  }, [period, data, custom.data]);
  const max = Math.max(1, ...rows.map((r) => r.impressions));

  if (!data) return null;
  return (
    <Section title="Impressions by period" hint="Shown = the piece's card appeared on screen. Opened = someone tapped into it. Periods follow India time; weeks start Monday.">
      <Card>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Period">
          {(["day", "week", "month", "year", "custom"] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={period === k} onClick={() => setPeriod(k)}
              className={`h-9 px-3 rounded-full text-sm border ${period === k ? "bg-ink text-white border-ink" : "bg-white text-gray-700 border-gray-300 hover:border-gray-500"}`}>
              {PERIOD_LABEL[k]}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs text-gray-600">From<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="block mt-1 h-10 rounded-lg border border-gray-300 px-2 text-sm" /></label>
            <label className="text-xs text-gray-600">To<input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className="block mt-1 h-10 rounded-lg border border-gray-300 px-2 text-sm" /></label>
            {custom.isFetching && <span className="text-xs text-gray-500">Counting…</span>}
            {custom.isError && <span className="text-xs text-red-700">Could not load that range.</span>}
          </div>
        )}
        <ul className="mt-4 divide-y divide-gray-100">
          {rows.map((r, i) => (
            <li key={r.id} className="py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-gray-900 min-w-0 truncate"><span className="text-gray-400 tabular-nums mr-1.5">{i + 1}.</span>{r.name}</span>
                <span className="shrink-0 text-sm tabular-nums text-gray-900">{r.impressions.toLocaleString("en-IN")} <span className="text-xs text-gray-500">shown</span> · {r.opens.toLocaleString("en-IN")} <span className="text-xs text-gray-500">opened</span></span>
              </div>
              <div className="mt-1.5"><Bar value={r.impressions} max={max} /></div>
            </li>
          ))}
          {rows.length === 0 && <li className="py-3 text-sm text-gray-500">{period === "custom" && custom.isFetching ? "Counting…" : failed && period !== "custom" ? NOT_LOADED : "No live pieces."}</li>}
        </ul>
      </Card>
    </Section>
  );
}

/**
 * The board is long; chapters say which question each stretch answers.
 * In the order a visit happens: she arrives, she does things, she looks at
 * pieces, she buys - and then the shop's own state.
 */
function Chapter({ n, title, about }: { n: number; title: string; about: string }) {
  return (
    <div className="mt-12 pt-6 border-t border-gray-200">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Part {n}</p>
      <h2 className="mt-1 font-display text-[22px] sm:text-2xl leading-tight text-ink">{title}</h2>
      <p className="mt-1 text-xs text-gray-500 max-w-prose">{about}</p>
    </div>
  );
}

function Section({ title, hint, children, action }: { title: string; hint?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div><h3 className="text-sm font-semibold text-gray-900">{title}</h3>{hint && <p className="text-xs text-gray-500 mt-0.5 max-w-prose">{hint}</p>}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  const w = max > 0 ? Math.max(value > 0 ? 1.5 : 0, (value / max) * 100) : 0;
  return <div className="h-2.5 w-full"><div className="h-full rounded-r-[4px] bg-viz-accent" style={{ width: `${w}%` }} /></div>;
}

/** The week in sentences. Infrastructure notes live on the System page, not here. */
function Brief() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<BriefPayload>({
    queryKey: ["admin", "dashboard", "brief"], queryFn: async () => (await adminApi.get("/dashboard/brief")).data, staleTime: 15 * 60_000, retry: 1,
  });
  if (isLoading) return <div className="mb-5 h-28 rounded-xl bg-rose/60 animate-pulse" />;
  if (error || !data?.brief) return null;
  const { brief, facts } = data;
  // A panel that comes back short must not take the board down with it - the
  // whole dashboard is one endpoint, and `meta.errors` is how a failing panel
  // is meant to report itself. An absent as_of once threw here and the error
  // boundary replaced the entire Analytics page with "Something went wrong".
  const asOf = facts?.as_of ? new Date(facts.as_of) : null;
  const when = asOf && !Number.isNaN(asOf.getTime())
    ? asOf.toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })
    : "just now";
  return (
    <section className="mb-5 rounded-xl border border-ink/10 bg-gradient-to-br from-rose via-white to-white p-4 sm:p-5" aria-labelledby="brief-heading">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-burgundy">ZISUN this week</p>
          <h2 id="brief-heading" className="font-display text-[22px] sm:text-2xl text-ink leading-tight mt-1">{brief.headline}</h2>
        </div>
        <button onClick={() => adminApi.get("/dashboard/brief", { params: { refresh: 1 } }).then(() => refetch())} disabled={isFetching} className="text-[11px] text-gray-500 hover:text-ink underline underline-offset-2 whitespace-nowrap disabled:opacity-50">{isFetching ? "Updating…" : "Refresh"}</button>
      </div>
      {brief.critical.length > 0 && (
        <ul className="mt-3 space-y-1.5">{brief.critical.map((c, i) => <li key={i} className="flex items-start gap-2 text-sm text-red-800 font-medium"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" /> {c}</li>)}</ul>
      )}
      <ul className="mt-3 space-y-1.5">{brief.bullets.map((b, i) => <li key={i} className="flex items-start gap-2 text-sm text-gray-800"><span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-burgundy shrink-0" /> {b}</li>)}</ul>
      <p className="mt-3 text-[11px] text-gray-500">As of {when}{brief.source === "rules" ? "" : ` · written by ${brief.source}`}</p>
    </section>
  );
}

/**
 * One piece's whole path, as a sentence and a bar per step.
 *
 * The board used to stop at "bagged", so it could say a piece was popular
 * but never where it stopped being popular. Buy now skips the bag entirely,
 * so intent counts both. The last line names the one step that loses the
 * most people - by people, not by rate, because "one shopper did not check
 * out" is not bigger news than "twenty-eight never opened it".
 */
function Journey({ p }: { p: ProductRow }) {
  const steps = p.journey ?? [];
  if (steps.length === 0) {
    return <p className="mt-1 text-xs text-gray-500 tabular-nums">{p.impressions} shown · {p.views} opened · {p.add_to_cart} bagged · {p.whatsapp_clicks} WhatsApp taps</p>;
  }
  const top = steps[0]?.count ?? 0;
  const anyone = steps.some((s) => s.count > 0);
  return (
    <div className="mt-2">
      {steps.map((s) => (
        <div key={s.key} className="flex items-center gap-2 py-[3px]">
          <span className="w-[104px] shrink-0 text-[11px] text-gray-500">{s.label}</span>
          <span className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <span className={`block h-full rounded-full ${p.gap?.step === s.key ? "bg-amber-400" : "bg-burgundy"}`} style={{ width: `${top > 0 ? Math.round((s.count / top) * 100) : 0}%` }} />
          </span>
          <span className="w-7 shrink-0 text-right text-[11px] tabular-nums text-gray-700">{s.count}</span>
        </div>
      ))}
      <p className="mt-1.5 text-[11px] text-gray-600">
        {p.gap
          ? <>Biggest drop: <span className="font-medium text-gray-900">{p.gap.from.toLowerCase()} → {p.gap.to.toLowerCase()}</span>, {p.gap.lost} of {p.gap.from_count} lost.</>
          : anyone ? "No drop-off yet." : "Nobody has seen this piece yet."}
      </p>
    </div>
  );
}

export default function AdminAnalytics() {
  const [days, setDays] = useState<7 | 30 | 90>(7);
  const [metric, setMetric] = useState<MetricKey>("sessions");
  const { data, isLoading, error, refetch, isPlaceholderData, isFetching } = useQuery<Dash>({
    queryKey: ["admin", "dashboard", days],
    queryFn: async () => (await adminApi.get("/dashboard", { params: { days } })).data,
    // Changing the range keeps the last board on screen, dimmed, until the
    // new one arrives - no skeleton flash, no layout jump.
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true, retry: 1,
  });
  if (isLoading) {
    return (
      <Page title="Analytics">
        <Brief />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">{[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-24 rounded-xl bg-gray-100 animate-pulse" />)}</div>
        <div className="mt-8 h-40 rounded-xl bg-gray-100 animate-pulse" />
      </Page>
    );
  }
  if (error || !data) {
    const e: any = error;
    return (
      <Page title="Analytics">
        <Brief />
        <Card className="border-red-200 bg-red-50">
          <p className="text-sm text-red-800 font-semibold">The board could not load.</p>
          <p className="text-xs text-red-700 mt-1">{e?.response?.status ? `The API answered ${e.response.status}: ` : "The API did not answer: "}{String(e?.response?.data?.detail ?? e?.message ?? "no response")}</p>
          <Button size="sm" className="mt-3" onClick={() => refetch()}>Try again</Button>
        </Card>
      </Page>
    );
  }

  const { meta, attention_items, insight, commerce, attention, inventory, acquisition } = data;
  const browse = !meta.checkout_enabled;
  const products = attention.products ?? [];
  // A panel whose query failed arrives empty. Empty must not read as "you
  // have no products": on 2026-10-04 it did, with eight pieces live.
  const failed = (name: string) => (meta.errors ?? []).some((e) => e.startsWith(`${name}:`));
  const noProducts = failed("products") ? NOT_LOADED : "No products yet.";
  const top = [...products].sort((a, b) => b.views - a.views || b.add_to_cart - a.add_to_cart).slice(0, 3);
  const maxAttention = Math.max(1, ...products.map((p) => p.attention));
  const shown = attention.funnel.find((f) => f.key === "impressions")?.count ?? 0;
  const opens = attention.funnel.find((f) => f.key === "views")?.count ?? 0;
  const generated = meta.generated_at ? new Date(meta.generated_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : null;
  const sev = (s: string) => (s === "critical" ? "bad" : s === "warn" ? "warn" : "neutral") as "bad" | "warn" | "neutral";
  const cur = data.series?.current ?? [];
  const prev = data.series?.previous ?? [];
  const sum = (rows: SeriesRow[], k: MetricKey | "committed_paise") => rows.reduce((a, r) => a + (r[k] ?? 0), 0);
  const owed = sum(cur, "committed_paise");
  const chosen = TILES.find((t) => t.key === metric) ?? TILES[0];
  const rangeLabel = meta.window_start
    ? `${new Date(`${meta.window_start}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} to today, India time`
    : `The last ${meta.window_days} days`;

  return (
    <Page title="Analytics" description={`${rangeLabel}${generated ? ` · updated ${generated}` : ""}`}
      actions={<ReportButtons data={isPlaceholderData ? undefined : data} />}>
      <Brief />
      {meta.errors?.length ? (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2" role="status">
          <p className="text-sm text-amber-900 min-w-0">
            {meta.errors.length === 1 ? "One part" : `${meta.errors.length} parts`} of this page did not load. Nothing is lost; the numbers below may be incomplete.
          </p>
          <Button size="sm" disabled={isFetching}
            onClick={() => adminApi.get("/dashboard", { params: { days, refresh: 1 } }).catch(() => null).then(() => refetch())}>
            {isFetching ? "Trying…" : "Try again"}
          </Button>
        </div>
      ) : null}

      {/* One filter row, above everything it scopes. Every tile, the trend,
          the funnel, sources and products below count the same days. */}
      <div className="mb-3 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Date range">
        {([7, 30, 90] as const).map((d) => (
          <button key={d} type="button" role="radio" aria-checked={days === d} onClick={() => setDays(d)}
            className={`h-9 px-3.5 rounded-full text-sm border transition-colors ${days === d ? "bg-ink text-white border-ink" : "bg-white text-gray-700 border-gray-300 hover:border-gray-500"}`}>
            Last {d} days
          </button>
        ))}
        {isFetching && <span className="text-xs text-gray-500">Updating…</span>}
      </div>

      <div className={`transition-opacity ${isPlaceholderData ? "opacity-50" : ""}`}>
      {/* The tiles are also the trend chart's tabs: tap one to plot it. */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {TILES.map((t) => (
          <StatTile key={t.key} label={t.label}
            value={t.money ? fmtRupees(sum(cur, t.key)) : compact(sum(cur, t.key))}
            current={sum(cur, t.key)} previous={sum(prev, t.key)}
            series={cur.map((r) => r[t.key])}
            note={t.key === "collected_paise" && owed > 0 ? `${fmtRupees(owed)} more owed (COD and marketplaces), not counted here` : t.note}
            selected={metric === t.key} onSelect={() => setMetric(t.key)} />
        ))}
      </div>

      <Section title={`${chosen.label} by day`} hint={chosen.hint}>
        <Card>
          <TrendChart
            label={chosen.label}
            points={cur.map((r) => ({ date: r.date, value: r[metric] }))}
            previous={prev.length === cur.length ? prev.map((r) => ({ date: r.date, value: r[metric] })) : undefined}
            format={chosen.money ? fmtRupees : fmtInt}
            currentName={`Last ${days} days`} previousName={`${days} days before`}
          />
        </Card>
      </Section>

      {/* One sentence she can act on */}
      {insight && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-burgundy/20 bg-burgundy-soft px-4 py-3">
          <Lightbulb className="w-4 h-4 mt-0.5 shrink-0 text-burgundy" />
          <p className="text-sm text-ink leading-snug">{insight}</p>
        </div>
      )}

      {/* Needs attention */}
      <Section title="Needs attention" hint={attention_items.length === 0 ? "Nothing right now." : undefined}>
        {attention_items.length > 0 && (
          <ul className="space-y-2">
            {attention_items.map((it, i) => (
              <li key={i}>
                <Card className="!p-3.5 sm:!p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2"><Pill tone={sev(it.severity)}><span className="inline-flex items-center gap-1">{it.severity === "critical" ? <OctagonAlert className="w-3 h-3" aria-hidden /> : it.severity === "warn" ? <AlertTriangle className="w-3 h-3" aria-hidden /> : <Info className="w-3 h-3" aria-hidden />}{it.severity === "critical" ? "Now" : it.severity === "warn" ? "Soon" : "Note"}</span></Pill><p className="text-sm font-semibold text-gray-900 leading-snug">{it.title}</p></div>
                      <p className="mt-1 text-xs text-gray-600 leading-snug">{it.body}</p>
                    </div>
                    {it.href && <LinkButton href={it.href} size="sm" className="shrink-0">Open</LinkButton>}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Chapter n={1} title="Who came" about="How many visits, where they came from, and which page they landed on." />

      <Behaviour b={data.behaviour} part="arrivals" Section={Section} Stat={Stat} />

      {/* Where they came from. Nothing recorded this before 2026-09-23, so
          the panel says what it cannot yet see rather than implying a split. */}
      {acquisition && acquisition.by_source.length > 0 && (
        <Section title="Where they came from" hint="Each visit counted once, under where the visitor first came from. Tap a row for details. Paid ads show under Facebook or Instagram.">
          <Card padded={false}>
            <div className="px-4 sm:px-5 pt-4 pb-4">
              <BarList caption="Visits by where they came from" valueName="Visits"
                rows={mergeSources(acquisition.by_source).slice(0, 7).map((s) => ({
                  key: s.source, label: sourceName(s.source), value: s.sessions,
                  detail: `${SOURCE_NOTES[s.source] ? SOURCE_NOTES[s.source] + " " : ""}${fmtInt(s.visitors)} ${s.visitors === 1 ? "person" : "people"} · ${s.orders} ${s.orders === 1 ? "order" : "orders"} · ${fmtRupees(s.collected_paise)} collected${s.committed_paise ? `, ${fmtRupees(s.committed_paise)} owed` : ""}${s.conversion != null ? ` · ${pct(s.conversion)} ordered` : ""}`,
                }))} />
            </div>
            {acquisition.partial && (
              <p className="px-4 py-2.5 text-[11px] text-gray-500 border-t border-gray-100">
                &ldquo;Before tracking started&rdquo; is visits and orders from before 23 Sept, when the site began noting where each visitor came from. They are not direct visits &mdash; they are simply unknown, and this row shrinks as the date range moves past it.
              </p>
            )}
          </Card>
        </Section>
      )}

      <Chapter n={2} title="What they did on the site" about="How far they read, which parts of the home page they reached, and what they tapped." />

      <Behaviour b={data.behaviour} part="onsite" Section={Section} Stat={Stat} />

      <Chapter n={3} title="What they looked at" about="Which pieces were shown, opened, bagged and bought." />

      {/* What women are looking at */}
      <Section title="What women are looking at" hint={`The ${meta.window_days}-day leaders by opens.`}>
        {top.length === 0 ? <Card><p className="text-sm text-gray-500">{noProducts}</p></Card> : (
          <div className="grid gap-3 lg:grid-cols-3">
            {top.map((p, i) => (
              <Card key={p.id} className="flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-gray-900 leading-snug"><span className="text-gray-400 tabular-nums mr-1.5">#{i + 1}</span>{p.name}</p>
                  {p.shelf_rank != null && <Pill tone="neutral">Pinned</Pill>}
                </div>
                <p className="mt-2 text-sm text-gray-700 tabular-nums">{p.views} opens · {p.add_to_cart} bags · {p.whatsapp_clicks} WhatsApp {p.whatsapp_clicks === 1 ? "tap" : "taps"}{p.orders ? ` · ${p.orders} ordered` : ""}</p>
                {p.lowest_variant && (
                  <p className={`mt-1 text-xs ${p.lowest_variant.stock <= 2 ? "text-red-700 font-medium" : "text-gray-500"}`}>
                    {p.stock_left} left{p.lowest_variant.stock <= 2 ? ` — ${p.lowest_variant.stock} in ${[p.lowest_variant.size, p.lowest_variant.colour].filter(Boolean).join(" / ") || "one size"}` : ""}
                  </p>
                )}
                <div className="mt-3 flex gap-2"><LinkButton href={`/admin/products/${p.id}/edit`} size="sm">View product</LinkButton><LinkButton href={`/admin/inventory?product=${p.id}`} size="sm" variant="ghost">Stock</LinkButton></div>
              </Card>
            ))}
          </div>
        )}
      </Section>

      {/* The funnel, in ZISUN's terms */}
      <Section title="From seen to sold" hint="Products shown is a card seen on a page. Opened is a product page. Each later step is a share of the people who opened a product.">
        <Card>
          <Funnel caption="From seen to sold" stages={attention.funnel.map((f, i) => ({
            key: f.key, label: f.label, count: f.count,
            base: i === 0 ? undefined : i === 1 ? shown : opens,
            baseLabel: i === 1 ? "shown" : "opened",
          }))} />
          {attention.size_guide_opens != null && attention.size_guide_opens > 0 && <p className="mt-3 text-xs text-gray-500">The size guide was opened {attention.size_guide_opens} times.</p>}
        </Card>
      </Section>

      <AttentionByPeriod data={attention.by_period} failed={failed("product_periods")} />

      {/* Product by product */}
      <Section title="Where attention goes" hint={attention.ranking ? `Score = recent activity, halving every ${attention.ranking.half_life_days} days; it orders the shelf when nothing is pinned. Open rate = opens from a card ÷ times the card was shown. Bag rate = bag adds ÷ opens.` : undefined}>
        {products.length === 0 ? <Card><p className="text-sm text-gray-500">{noProducts}</p></Card> : (
          <>
            <ul className="sm:hidden space-y-3">
              {products.map((p, i) => (
                <li key={p.id}>
                  <Card>
                    <p className="text-sm font-semibold text-gray-900 leading-snug"><span className="text-gray-400 tabular-nums mr-1.5">{i + 1}</span><Link href={`/admin/products/${p.id}/edit`} className="hover:underline underline-offset-2">{p.name}</Link></p>
                    <Journey p={p} />
                    <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
                      <div><p className="text-[11px] text-gray-500">Open rate</p><p className="text-sm font-semibold tabular-nums">{pct(p.ctr)}</p></div>
                      <div><p className="text-[11px] text-gray-500">Bag rate</p><p className="text-sm font-semibold tabular-nums">{pct(p.cart_rate)}</p></div>
                      <div><p className="text-[11px] text-gray-500">Score</p><p className="text-sm font-semibold tabular-nums">{p.attention}</p></div>
                    </div>
                    <div className="mt-2"><Bar value={p.attention} max={maxAttention} /></div>
                  </Card>
                </li>
              ))}
            </ul>
            <Card padded={false} className="hidden sm:block">
              <TableScroll minWidth={760}>
                <table className="w-full">
                  <thead className="border-b border-gray-100"><tr>{["#", "Product", "Shown", "Opened", "Bag / buy", "WhatsApp", "Ordered", "Sold", "Biggest drop"].map((h, i) => <th key={i} className={`${th} ${i >= 2 && i < 8 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {products.map((p, i) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className={`${td} text-gray-400 tabular-nums`}>{i + 1}</td>
                        <td className={`${td} font-medium text-gray-900`}><Link href={`/admin/products/${p.id}/edit`} className="hover:underline underline-offset-2">{p.name}</Link>{p.shelf_rank != null && <span className="ml-2 text-[10px] text-gray-500">pinned</span>}</td>
                        <td className={`${td} text-right tabular-nums`}>{p.impressions}</td>
                        <td className={`${td} text-right tabular-nums`}>{p.views}</td>
                        <td className={`${td} text-right tabular-nums`}>{p.intent ?? p.add_to_cart}</td>
                        <td className={`${td} text-right tabular-nums`}>{rupees(p.revenue_paise ?? 0)}</td>
                        <td className={`${td} text-right tabular-nums`}>{p.whatsapp_clicks}</td>
                        <td className={`${td} text-right tabular-nums`}>{p.orders ?? 0}</td>
                        <td className={`${td} text-xs text-gray-600`}>
                          {p.gap
                            ? <>{p.gap.lost} lost at <span className="font-medium text-gray-900">{p.gap.to.toLowerCase()}</span> <span className="text-gray-400 tabular-nums">({p.gap.from_count}→{p.gap.to_count})</span></>
                            : <span className="text-gray-400">no traffic yet</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </Card>
          </>
        )}
      </Section>

      <Chapter n={4} title="What they bought" about="Orders and money. Collected is money that has arrived; owed is cash on delivery not yet handed over." />

      {/* Payment: the one place a shop's own fault is separable from a
          customer's decision. Hidden entirely until someone has tried to pay,
          because an empty payment panel is noise on a phone. */}
      {commerce.payment.attempted > 0 && (
        <Section title="Prepaid payments" hint={`${meta.window_days} days. COD never touches a gateway, so it cannot fail at one.`}>
          <Card>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Paid" value={commerce.payment.succeeded} note={commerce.payment.success_rate != null ? `${commerce.payment.success_rate}% of settled` : undefined} />
              <Stat label="Failed" value={commerce.payment.failed} note="the gateway said no" empty={commerce.payment.failed === 0} />
              <Stat label="Walked away" value={commerce.payment.abandoned} note="sheet opened, not paid" empty={commerce.payment.abandoned === 0} />
              <Stat label="Still trying" value={commerce.payment.in_flight} note="opened just now" empty={commerce.payment.in_flight === 0} />
            </div>
            {commerce.payment.mismatched > 0 && (
              <div className="mt-3 rounded-lg bg-red-50 border border-red-100 px-3 py-2.5">
                <p className="text-xs font-semibold text-red-800">
                  {commerce.payment.mismatched} {commerce.payment.mismatched === 1 ? "order has" : "orders have"} money at the gateway but are not marked paid.
                </p>
                <p className="text-[11px] text-red-700 mt-0.5">The webhook is the only thing that marks an order paid. If it never landed, the customer paid and nothing will be packed.</p>
              </div>
            )}
            <p className="mt-3 text-[11px] text-gray-500">
              &ldquo;Failed&rdquo; is the bank or the gateway refusing. &ldquo;Walked away&rdquo; is the sheet opened and closed. They are different problems and only the first is ours to fix.
            </p>
          </Card>
        </Section>
      )}

      {!browse && (
        <Section title="Checkout orders" hint="All time, by status and payment method.">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Collected" value={rupees(commerce.money.collected_paise)} note="prepaid paid, COD delivered" empty={commerce.money.collected_paise === 0} />
            <Stat label="Owed" value={rupees(commerce.money.committed_paise)} note="COD placed, not yet delivered" empty={commerce.money.committed_paise === 0} />
            <Stat label="Lost at payment" value={rupees(commerce.money.lost_paise)} note="abandoned or failed" empty={commerce.money.lost_paise === 0} />
            {Object.entries(commerce.by_status).map(([s, n]) => <Stat key={s} label={s.replace(/_/g, " ")} value={n} />)}
          </div>
        </Section>
      )}

      <Chapter n={5} title="The shop" about="What is on the shelf and what is running low." />

      {/* Stock */}
      <Section title="Stock" hint={`${inventory.units} units across ${inventory.variants} sizes and colours.`} action={<LinkButton href="/admin/inventory" size="sm" variant="ghost">Inventory</LinkButton>}>
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <p className="text-xs font-medium text-gray-600 mb-3">Units by size</p>
            <BarList caption="Units in stock by size" valueName="Units" empty="No stock entered yet."
              rows={inventory.by_size.map((s) => ({ key: s.size, label: s.size, value: s.units, detail: `across ${s.variants} ${s.variants === 1 ? "colour" : "colours"}` }))} />
          </Card>
          <Card padded={false}>
            <p className="px-4 sm:px-5 pt-4 pb-2 text-xs font-medium text-gray-600">Running low ({inventory.low_stock_threshold} or fewer)</p>
            {inventory.low_stock.length === 0 ? <p className="px-4 sm:px-5 pb-4 text-sm text-gray-500">Nothing is running low.</p> : (
              <ul className="divide-y divide-gray-100">{inventory.low_stock.map((v) => (
                <li key={v.sku} className="px-4 sm:px-5 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0"><p className="text-sm text-gray-900 truncate">{v.product}</p><p className="text-xs text-gray-500 flex items-center gap-1.5">{v.size || "One size"}{v.colour && <><span>·</span><Swatch colour={v.colour} /></>}<span>·</span><Sku>{v.sku}</Sku></p></div>
                  <StockBadge n={v.stock} />
                </li>
              ))}</ul>
            )}
          </Card>
        </div>
      </Section>
      </div>
    </Page>
  );
}
