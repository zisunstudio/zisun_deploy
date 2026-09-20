"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import { Page, Card, Button, Pill, StockBadge, Swatch, Sku, TableScroll, th, td } from "@/components/admin/ui";

/**
 * The analytics board.
 *
 * Read on a phone between other jobs, so it leads with sentences (the
 * brief), then four numbers, then the funnel, then where attention goes
 * product by product, then stock. Every panel says when it has no data and
 * why: most of the commerce numbers are empty because nothing can be sold
 * yet, which is a different fact from "nothing sold".
 */
type Funnel = { key: string; label: string; count: number };
type Dash = {
  meta: { window_days: number; checkout_enabled: boolean; launch_mode: string; events_recorded: number; errors?: string[]; generated_at?: string };
  commerce: {
    orders_all_time: number; orders_window: number; revenue_window_paise: number;
    by_payment_method: Record<string, { orders: number; revenue: number }>;
    by_status: Record<string, number>; customers: number;
    contribution_margin: number | null; contribution_margin_blocked_on: string[];
  };
  attention: {
    sessions: number; sessions_previous?: number; funnel: Funnel[];
    products_by_views: { id: string; name: string; views: number }[];
    never_viewed: { id: string; name: string }[];
    products?: { id: string; name: string; shelf_rank: number | null; impressions: number; views: number; add_to_cart: number; checkout: number; ctr: number | null; cart_rate: number | null; attention: number }[];
    ranking?: { window_days: number; half_life_days: number; weights: Record<string, number> };
  };
  inventory: { units: number; variants: number; by_size: { size: string; variants: number; units: number }[]; low_stock: { product: string; size: string; colour?: string; sku: string; stock: number }[]; low_stock_threshold: number };
};
type BriefPayload = {
  brief: { headline: string; bullets: string[]; critical: string[]; source: string; note?: string };
  facts: { as_of: string; errors?: string[] };
};

const rupees = (paise: number) => "₹" + Math.round(paise / 100).toLocaleString("en-IN");
const pct = (r: number | null | undefined) => (r == null ? "—" : `${Math.round(r * 100)}%`);

function Trend({ now, before }: { now: number; before?: number }) {
  if (!before) return null;
  const change = Math.round(((now - before) / before) * 100);
  const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
  const tone = change > 0 ? "text-green-700" : change < 0 ? "text-red-700" : "text-gray-500";
  return <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${tone}`}><Icon className="w-3.5 h-3.5" />{change > 0 ? "+" : ""}{change}%</span>;
}

/** A figure with a label under it. State says whether the number means anything yet. */
function Stat({ label, value, note, state = "live", trend }: { label: string; value: React.ReactNode; note?: string; state?: "live" | "thin" | "none"; trend?: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
        {state !== "live" && <Pill tone={state === "thin" ? "warn" : "neutral"}>{state === "thin" ? "Thin data" : "No data yet"}</Pill>}
      </div>
      <p className={`text-[26px] leading-none font-semibold tabular-nums ${state === "none" ? "text-gray-300" : "text-gray-900"}`}>{value}</p>
      <div className="flex items-center justify-between gap-2 mt-1">
        {note ? <p className="text-[11px] text-gray-500 leading-snug">{note}</p> : <span />}
        {trend}
      </div>
    </Card>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {hint && <p className="text-xs text-gray-500 mt-0.5 max-w-prose">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Bar({ value, max, tone = "bg-ink" }: { value: number; max: number; tone?: string }) {
  const w = max > 0 ? Math.max(value > 0 ? 2 : 0, Math.round((value / max) * 100)) : 0;
  return <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden"><div className={`h-full rounded-full ${tone}`} style={{ width: `${w}%` }} /></div>;
}

/** Today, this week, and anything critical — in sentences. */
function Brief() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<BriefPayload>({
    queryKey: ["admin", "dashboard", "brief"],
    queryFn: async () => (await adminApi.get("/dashboard/brief")).data,
    staleTime: 15 * 60_000, retry: 1,
  });
  if (isLoading) return <div className="mb-5 h-28 rounded-xl bg-rose/60 animate-pulse" />;
  if (error || !data) {
    const e: any = error;
    return <p className="mb-5 text-xs text-gray-500">No brief right now ({e?.response?.status ?? "no response"}).</p>;
  }
  const { brief, facts } = data;
  const when = new Date(facts.as_of).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
  return (
    <section className="mb-6 rounded-xl border border-ink/10 bg-gradient-to-br from-rose via-white to-white p-4 sm:p-5" aria-labelledby="brief-heading">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-burgundy">Today&apos;s brief</p>
          <h2 id="brief-heading" className="font-display text-[22px] sm:text-2xl text-ink leading-tight mt-1">{brief.headline}</h2>
        </div>
        <button onClick={() => adminApi.get("/dashboard/brief", { params: { refresh: 1 } }).then(() => refetch())} disabled={isFetching}
          className="text-[11px] text-gray-500 hover:text-ink underline underline-offset-2 whitespace-nowrap disabled:opacity-50">
          {isFetching ? "Updating…" : "Refresh"}
        </button>
      </div>
      {brief.critical.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {brief.critical.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-red-800 font-medium"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" /> {c}</li>
          ))}
        </ul>
      )}
      <ul className="mt-3 space-y-1.5">
        {brief.bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-800"><span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-burgundy shrink-0" /> {b}</li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-gray-500">
        As of {when} · {brief.source === "rules" ? "written from rules" : `written by ${brief.source}`}{brief.note ? ` · ${brief.note}` : ""}
      </p>
    </section>
  );
}

export default function AdminAnalytics() {
  const { data, isLoading, error, refetch } = useQuery<Dash>({
    queryKey: ["admin", "dashboard"],
    queryFn: async () => (await adminApi.get("/dashboard")).data,
    refetchOnWindowFocus: true, retry: 1,
  });

  if (isLoading) {
    return (
      <Page title="Analytics" description="Last 30 days unless it says otherwise.">
        <Brief />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-24 rounded-xl bg-gray-100 animate-pulse" />)}</div>
        <div className="mt-8 h-48 rounded-xl bg-gray-100 animate-pulse" />
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

  const { meta, commerce, attention, inventory } = data;
  const browse = !meta.checkout_enabled;
  const opens = attention.funnel.find((f) => f.key === "views")?.count ?? 0;
  const bagged = attention.funnel.find((f) => f.key === "add_to_cart")?.count ?? 0;
  const maxFunnel = Math.max(1, ...attention.funnel.map((f) => f.count));
  const maxUnits = Math.max(1, ...inventory.by_size.map((s) => s.units));
  const products = attention.products ?? [];
  const maxAttention = Math.max(1, ...products.map((p) => p.attention));
  const generated = meta.generated_at ? new Date(meta.generated_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <Page title="Analytics" description={`Last ${meta.window_days} days unless it says otherwise.${generated ? ` Updated ${generated}.` : ""}`}>
      <Brief />
      {meta.errors?.length ? <p className="mb-3 text-xs text-amber-700">Some panels are missing: {meta.errors.join("; ")}.</p> : null}
      {browse && (
        <div className="mb-4 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900 leading-relaxed">The store is in <strong>browse mode</strong>: orders come in over WhatsApp, so the order and revenue panels stay empty until checkout opens.</p>
        </div>
      )}

      {/* The four numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Visits" value={attention.sessions.toLocaleString("en-IN")} note="Sessions with any activity" state={attention.sessions > 0 ? "live" : "none"} trend={<Trend now={attention.sessions} before={attention.sessions_previous} />} />
        <Stat label="Product opens" value={opens.toLocaleString("en-IN")} note={`${attention.never_viewed.length} of ${attention.products_by_views.length} never opened`} state={opens > 0 ? "live" : "none"} />
        <Stat label="Added to bag" value={bagged.toLocaleString("en-IN")} note={opens > 0 ? `${pct(bagged / opens)} of opens` : "Needs opens first"} state={bagged > 0 ? "live" : opens > 0 ? "thin" : "none"} />
        <Stat label={browse ? "Orders" : "Revenue"} value={browse ? commerce.orders_all_time : rupees(commerce.revenue_window_paise)} note={browse ? "Opens with checkout" : `${commerce.orders_window} orders · ${commerce.customers} customers`} state={commerce.orders_window > 0 ? "live" : "none"} />
      </div>

      {/* The funnel */}
      <Section title="From seen to sold" hint={`${meta.events_recorded.toLocaleString("en-IN")} events recorded all time. Each step shows how many made it, and what share of the step before.`}>
        <Card>
          <ol className="space-y-3">
            {attention.funnel.map((f, i) => {
              const prev = i > 0 ? attention.funnel[i - 1].count : null;
              return (
                <li key={f.key}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-gray-800">{f.label}</span>
                    <span className="tabular-nums text-gray-900 font-semibold">{f.count.toLocaleString("en-IN")}{prev != null && prev > 0 && <span className="ml-2 text-xs font-normal text-gray-500">{pct(f.count / prev)}</span>}</span>
                  </div>
                  <div className="mt-1.5"><Bar value={f.count} max={maxFunnel} /></div>
                </li>
              );
            })}
          </ol>
        </Card>
      </Section>

      {/* Product by product */}
      <Section title="Where attention goes" hint={attention.ranking ? `Score = recent activity, halving every ${attention.ranking.half_life_days} days. It is what orders the shelf when nothing is pinned. A high open rate with a low bag rate is a photograph better than its page; the reverse is a page better than its photograph.` : undefined}>
        {products.length === 0 ? (
          <Card><p className="text-sm text-gray-500">No products yet.</p></Card>
        ) : (
          <>
            <ul className="sm:hidden space-y-3">
              {products.map((p, i) => {
                const weakCard = p.impressions >= 20 && (p.ctr ?? 0) < 0.05;
                const pageLeak = p.views >= 10 && (p.cart_rate ?? 0) < 0.05;
                return (
                  <li key={p.id}>
                    <Card>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 leading-snug"><span className="text-gray-400 tabular-nums mr-1.5">{i + 1}</span><Link href={`/admin/products/${p.id}/edit`} className="hover:underline underline-offset-2">{p.name}</Link></p>
                          <p className="mt-1 text-xs text-gray-500 tabular-nums">{p.impressions} shown · {p.views} opened · {p.add_to_cart} bagged</p>
                        </div>
                        {p.shelf_rank != null && <Pill tone="neutral">Pinned #{p.shelf_rank + 1}</Pill>}
                      </div>
                      <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
                        <div><p className="text-[10px] uppercase tracking-wide text-gray-500">Open rate</p><p className="text-sm font-semibold tabular-nums">{pct(p.ctr)}</p></div>
                        <div><p className="text-[10px] uppercase tracking-wide text-gray-500">Bag rate</p><p className="text-sm font-semibold tabular-nums">{pct(p.cart_rate)}</p></div>
                        <div><p className="text-[10px] uppercase tracking-wide text-gray-500">Score</p><p className="text-sm font-semibold tabular-nums">{p.attention}</p></div>
                      </div>
                      <div className="mt-2"><Bar value={p.attention} max={maxAttention} tone="bg-burgundy" /></div>
                      {(weakCard || pageLeak || p.views === 0) && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {p.views === 0 && <Pill tone="neutral">Never opened</Pill>}
                          {weakCard && <Pill tone="warn">Weak card</Pill>}
                          {pageLeak && <Pill tone="warn">Page leak</Pill>}
                        </div>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
            <Card padded={false} className="hidden sm:block">
              <TableScroll minWidth={720}>
                <table className="w-full">
                  <thead className="border-b border-gray-100"><tr>{["#", "Product", "Shown", "Opened", "Bagged", "Open rate", "Bag rate", "Score", ""].map((h, i) => <th key={i} className={`${th} ${i >= 2 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {products.map((p, i) => {
                      const weakCard = p.impressions >= 20 && (p.ctr ?? 0) < 0.05;
                      const pageLeak = p.views >= 10 && (p.cart_rate ?? 0) < 0.05;
                      return (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className={`${td} text-gray-400 tabular-nums`}>{i + 1}</td>
                          <td className={`${td} font-medium text-gray-900`}><Link href={`/admin/products/${p.id}/edit`} className="hover:underline underline-offset-2">{p.name}</Link>{p.shelf_rank != null && <span className="ml-2 text-[10px] text-gray-500">pinned</span>}</td>
                          <td className={`${td} text-right tabular-nums`}>{p.impressions}</td>
                          <td className={`${td} text-right tabular-nums`}>{p.views}</td>
                          <td className={`${td} text-right tabular-nums`}>{p.add_to_cart}</td>
                          <td className={`${td} text-right tabular-nums`}>{pct(p.ctr)}</td>
                          <td className={`${td} text-right tabular-nums`}>{pct(p.cart_rate)}</td>
                          <td className={`${td} text-right tabular-nums font-semibold`}>{p.attention}</td>
                          <td className={`${td} text-right whitespace-nowrap`}>{p.views === 0 ? <Pill tone="neutral">Never opened</Pill> : weakCard ? <Pill tone="warn">Weak card</Pill> : pageLeak ? <Pill tone="warn">Page leak</Pill> : null}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableScroll>
            </Card>
          </>
        )}
      </Section>

      {/* Stock */}
      <Section title="Stock" hint={`${inventory.units} units across ${inventory.variants} sizes and colours.`}>
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-3">Units by size</p>
            {inventory.by_size.length === 0 ? <p className="text-sm text-gray-500">No stock entered yet.</p> : (
              <ul className="space-y-2.5">
                {inventory.by_size.map((s) => (
                  <li key={s.size}>
                    <div className="flex items-baseline justify-between text-sm"><span className="text-gray-800">{s.size}</span><span className="tabular-nums text-gray-900 font-semibold">{s.units} <span className="text-xs font-normal text-gray-500">in {s.variants}</span></span></div>
                    <div className="mt-1"><Bar value={s.units} max={maxUnits} /></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card padded={false}>
            <div className="px-4 sm:px-5 pt-4 pb-2 flex items-center justify-between"><p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Running low ({inventory.low_stock_threshold} or fewer)</p><Link href="/admin/inventory" className="text-xs text-ink underline underline-offset-2">Inventory</Link></div>
            {inventory.low_stock.length === 0 ? <p className="px-4 sm:px-5 pb-4 text-sm text-gray-500">Nothing is running low.</p> : (
              <ul className="divide-y divide-gray-100">
                {inventory.low_stock.map((v) => (
                  <li key={v.sku} className="px-4 sm:px-5 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900 truncate">{v.product}</p>
                      <p className="text-xs text-gray-500 flex items-center gap-1.5">{v.size || "One size"}{v.colour && <><span>·</span><Swatch colour={v.colour} /></>}<span>·</span><Sku>{v.sku}</Sku></p>
                    </div>
                    <StockBadge n={v.stock} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </Section>

      {/* Commerce, when it exists */}
      {!browse && (
        <Section title="Orders" hint="All time, by status and payment method.">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(commerce.by_status).map(([s, n]) => <Stat key={s} label={s.replace(/_/g, " ")} value={n} />)}
            {Object.entries(commerce.by_payment_method).map(([m, v]) => <Stat key={m} label={m} value={rupees(v.revenue)} note={`${v.orders} orders`} />)}
          </div>
          {commerce.contribution_margin == null && (
            <p className="mt-3 text-xs text-gray-500">Contribution margin is not shown until these are entered: {commerce.contribution_margin_blocked_on.join(", ")}.</p>
          )}
        </Section>
      )}
    </Page>
  );
}
