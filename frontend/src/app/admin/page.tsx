"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Lightbulb, Minus } from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import { Page, Card, Button, Pill, StockBadge, Swatch, Sku, TableScroll, LinkButton, th, td } from "@/components/admin/ui";

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
type Dash = {
  meta: { window_days: number; checkout_enabled: boolean; launch_mode: string; events_recorded: number; errors?: string[]; generated_at?: string };
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
  acquisition?: { by_source: Array<{ source: string; orders: number; collected_paise: number; committed_paise: number; sessions: number; visitors: number; conversion: number | null }>; partial: boolean };
  attention: { sessions: number; sessions_previous?: number; funnel: Funnel[]; size_guide_opens?: number; products_by_views: { id: string; name: string; views: number }[]; never_viewed: { id: string; name: string }[]; products?: ProductRow[]; ranking?: { window_days: number; half_life_days: number; weights: Record<string, number> } };
  inventory: { units: number; variants: number; by_size: { size: string; variants: number; units: number }[]; low_stock: { product: string; size: string; colour?: string; sku: string; stock: number }[]; low_stock_threshold: number };
};
type BriefPayload = { brief: { headline: string; bullets: string[]; critical: string[]; source: string }; facts?: { as_of?: string } };

const rupees = (paise: number) => "₹" + Math.round(paise / 100).toLocaleString("en-IN");
const pct = (r: number | null | undefined) => (r == null ? "—" : `${Math.round(r * 100)}%`);

function Trend({ now, before }: { now: number; before?: number }) {
  if (!before) return null;
  if (before < 20) return <span className="text-xs text-gray-500 whitespace-nowrap">vs {before}</span>;
  const change = Math.round(((now - before) / before) * 100);
  const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
  const tone = change > 0 ? "text-green-700" : change < 0 ? "text-red-700" : "text-gray-500";
  return <span className={`inline-flex items-center gap-0.5 text-xs font-semibold whitespace-nowrap ${tone}`}><Icon className="w-3.5 h-3.5" />{change > 0 ? "+" : ""}{change}%</span>;
}

function Stat({ label, value, note, trend, empty }: { label: string; value: React.ReactNode; note?: string; trend?: React.ReactNode; empty?: boolean }) {
  return (
    <Card className="flex flex-col gap-1 !p-3.5 sm:!p-4">
      <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-[24px] sm:text-[26px] leading-none font-semibold tabular-nums ${empty ? "text-gray-300" : "text-gray-900"}`}>{value}</p>
      <div className="flex items-center justify-between gap-2 mt-1 min-h-[16px]">{note ? <p className="text-[11px] text-gray-500 leading-snug">{note}</p> : <span />}{trend}</div>
    </Card>
  );
}

function Section({ title, hint, children, action }: { title: string; hint?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div><h2 className="text-sm font-semibold text-gray-900">{title}</h2>{hint && <p className="text-xs text-gray-500 mt-0.5 max-w-prose">{hint}</p>}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Bar({ value, max, tone = "bg-ink" }: { value: number; max: number; tone?: string }) {
  const w = max > 0 ? Math.max(value > 0 ? 2 : 0, Math.round((value / max) * 100)) : 0;
  return <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden"><div className={`h-full rounded-full ${tone}`} style={{ width: `${w}%` }} /></div>;
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
  const { data, isLoading, error, refetch } = useQuery<Dash>({
    queryKey: ["admin", "dashboard"], queryFn: async () => (await adminApi.get("/dashboard")).data, refetchOnWindowFocus: true, retry: 1,
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

  const { meta, week, whatsapp, attention_items, insight, commerce, attention, inventory, acquisition } = data;
  const browse = !meta.checkout_enabled;
  const products = attention.products ?? [];
  const top = [...products].sort((a, b) => b.views - a.views || b.add_to_cart - a.add_to_cart).slice(0, 3);
  const maxFunnel = Math.max(1, ...attention.funnel.map((f) => f.count));
  const maxUnits = Math.max(1, ...inventory.by_size.map((s) => s.units));
  const maxAttention = Math.max(1, ...products.map((p) => p.attention));
  const shown = attention.funnel.find((f) => f.key === "impressions")?.count ?? 0;
  const opens = attention.funnel.find((f) => f.key === "views")?.count ?? 0;
  const generated = meta.generated_at ? new Date(meta.generated_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : null;
  const sev = (s: string) => (s === "critical" ? "bad" : s === "warn" ? "warn" : "neutral") as "bad" | "warn" | "neutral";

  return (
    <Page title="Analytics" description={`This week leads; the rest is the last ${meta.window_days} days.${generated ? ` Updated ${generated}.` : ""}`}>
      <Brief />
      {meta.errors?.length ? <p className="mb-3 text-xs text-amber-700">Some panels are missing: {meta.errors.join("; ")}.</p> : null}

      {/* This week, in six numbers. The last three are the sale, in ZISUN's terms. */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Stat label="Visits" value={week.sessions.toLocaleString("en-IN")} note="this week" trend={<Trend now={week.sessions} before={week.sessions_previous} />} empty={week.sessions === 0} />
        <Stat label="Product opens" value={week.opens.toLocaleString("en-IN")} note="this week" trend={<Trend now={week.opens} before={week.opens_previous} />} empty={week.opens === 0} />
        <Stat label="Added to bag" value={week.bag_adds.toLocaleString("en-IN")} note="this week" trend={<Trend now={week.bag_adds} before={week.bag_adds_previous} />} empty={week.bag_adds === 0} />
        {/* A click on a WhatsApp button. The site cannot see whether a
            message was ever sent, so it must never be called a conversation. */}
        <Stat label="WhatsApp taps" value={week.enquiries.toLocaleString("en-IN")} note={whatsapp.unanswered ? `${whatsapp.unanswered} waiting for a reply` : "opened a chat this week"} trend={<Trend now={week.enquiries} before={week.enquiries_previous} />} empty={week.enquiries === 0} />
        {/* Orders and revenue are this week only. They used to add a 7-day
            figure to a 30-day one - the same orders counted twice - and add
            hand-marked WhatsApp enquiries to real orders on top. */}
        <Stat label="Orders" value={week.orders.toLocaleString("en-IN")} note="this week" empty={week.orders === 0} />
        <Stat label="Collected" value={rupees(week.revenue_paise)} note="money in, this week" empty={week.revenue_paise === 0} />
      </div>

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
                      <div className="flex items-center gap-2"><Pill tone={sev(it.severity)}>{it.severity === "critical" ? "Now" : it.severity === "warn" ? "Soon" : "Note"}</Pill><p className="text-sm font-semibold text-gray-900 leading-snug">{it.title}</p></div>
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

      {/* Where they came from. Nothing recorded this before 2026-09-23, so
          the panel says what it cannot yet see rather than implying a split. */}
      {acquisition && acquisition.by_source.length > 0 && (
        <Section title="Where they came from" hint={`${meta.window_days} days, credited to the first visit.`}>
          <Card padded={false}>
            <ul className="divide-y divide-gray-100">
              {acquisition.by_source.slice(0, 8).map((s) => (
                <li key={s.source} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 capitalize">{s.source}</p>
                    <p className="text-[11px] text-gray-500 tabular-nums">
                      {s.sessions.toLocaleString("en-IN")} {s.sessions === 1 ? "visit" : "visits"}
                      {s.visitors > 0 && <> · {s.visitors.toLocaleString("en-IN")} {s.visitors === 1 ? "person" : "people"}</>}
                      {s.conversion != null && <> · {pct(s.conversion)} ordered</>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold tabular-nums text-gray-900">{s.orders}</p>
                    <p className="text-[11px] text-gray-500 tabular-nums">{rupees(s.collected_paise + s.committed_paise)}</p>
                  </div>
                </li>
              ))}
            </ul>
            {acquisition.partial && (
              <p className="px-4 py-2.5 text-[11px] text-gray-500 border-t border-gray-100">
                Orders placed before the site started recording a source show as &ldquo;not recorded&rdquo;. They are not direct visits &mdash; they are simply unknown.
              </p>
            )}
          </Card>
        </Section>
      )}

      {/* What women are looking at */}
      <Section title="What women are looking at" hint={`The ${meta.window_days}-day leaders by opens.`}>
        {top.length === 0 ? <Card><p className="text-sm text-gray-500">No products yet.</p></Card> : (
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
          <ol className="space-y-3.5">
            {attention.funnel.map((f, i) => {
              const base = i === 0 ? null : i === 1 ? shown : opens;
              const share = base != null && base > 0 ? pct(f.count / base) : null;
              return (
                <li key={f.key}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-gray-800">{f.label}{share && <span className="ml-2 text-xs text-gray-500">{share} of {i === 1 ? "shown" : "opened"}</span>}</span>
                    <span className="text-sm tabular-nums text-gray-900 font-semibold">{f.count.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="mt-1.5"><Bar value={f.count} max={maxFunnel} tone={f.key === "enquiry" || f.key === "orders" ? "bg-burgundy" : "bg-ink"} /></div>
                </li>
              );
            })}
          </ol>
          {attention.size_guide_opens != null && attention.size_guide_opens > 0 && <p className="mt-3 text-xs text-gray-500">The size guide was opened {attention.size_guide_opens} times.</p>}
        </Card>
      </Section>

      {/* Product by product */}
      <Section title="Where attention goes" hint={attention.ranking ? `Score = recent activity, halving every ${attention.ranking.half_life_days} days; it orders the shelf when nothing is pinned. Open rate = opens from a card ÷ times the card was shown. Bag rate = bag adds ÷ opens.` : undefined}>
        {products.length === 0 ? <Card><p className="text-sm text-gray-500">No products yet.</p></Card> : (
          <>
            <ul className="sm:hidden space-y-3">
              {products.map((p, i) => (
                <li key={p.id}>
                  <Card>
                    <p className="text-sm font-semibold text-gray-900 leading-snug"><span className="text-gray-400 tabular-nums mr-1.5">{i + 1}</span><Link href={`/admin/products/${p.id}/edit`} className="hover:underline underline-offset-2">{p.name}</Link></p>
                    <Journey p={p} />
                    <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
                      <div><p className="text-[10px] uppercase tracking-wide text-gray-500">Open rate</p><p className="text-sm font-semibold tabular-nums">{pct(p.ctr)}</p></div>
                      <div><p className="text-[10px] uppercase tracking-wide text-gray-500">Bag rate</p><p className="text-sm font-semibold tabular-nums">{pct(p.cart_rate)}</p></div>
                      <div><p className="text-[10px] uppercase tracking-wide text-gray-500">Score</p><p className="text-sm font-semibold tabular-nums">{p.attention}</p></div>
                    </div>
                    <div className="mt-2"><Bar value={p.attention} max={maxAttention} tone="bg-burgundy" /></div>
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

      {/* Stock */}
      <Section title="Stock" hint={`${inventory.units} units across ${inventory.variants} sizes and colours.`} action={<LinkButton href="/admin/inventory" size="sm" variant="ghost">Inventory</LinkButton>}>
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-3">Units by size</p>
            {inventory.by_size.length === 0 ? <p className="text-sm text-gray-500">No stock entered yet.</p> : (
              <ul className="space-y-2.5">{inventory.by_size.map((s) => (
                <li key={s.size}><div className="flex items-baseline justify-between text-sm"><span className="text-gray-800">{s.size}</span><span className="tabular-nums text-gray-900 font-semibold">{s.units} <span className="text-xs font-normal text-gray-500">in {s.variants}</span></span></div><div className="mt-1"><Bar value={s.units} max={maxUnits} /></div></li>
              ))}</ul>
            )}
          </Card>
          <Card padded={false}>
            <p className="px-4 sm:px-5 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Running low ({inventory.low_stock_threshold} or fewer)</p>
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
    </Page>
  );
}
