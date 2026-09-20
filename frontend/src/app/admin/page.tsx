"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  AlertTriangle,
  Eye,
  IndianRupee,
  Package,
  ShoppingBag,
  Users,
} from "lucide-react";
import { adminApi } from "@/lib/adminApi";

/**
 * The overview. /admin used to redirect straight to Orders, so there was no
 * place that answered "how is the shop doing" in one look.
 *
 * The governing rule here is that a panel with no data says so, in those words.
 * Most of them have none yet — no order can be created while the store is in
 * browse mode — and a confident ₹0 reads as "we sold nothing" when the truth is
 * "nothing could be sold". Those are different facts and only one of them is
 * true.
 */

type Funnel = { key: string; label: string; count: number };
type Dash = {
  meta: {
    window_days: number;
    checkout_enabled: boolean;
    launch_mode: string;
    events_recorded: number;
    errors?: string[];
  };
  commerce: {
    orders_all_time: number;
    orders_window: number;
    revenue_window_paise: number;
    by_payment_method: Record<string, { orders: number; revenue: number }>;
    by_status: Record<string, number>;
    customers: number;
    contribution_margin: number | null;
    contribution_margin_blocked_on: string[];
  };
  attention: {
    sessions: number;
    funnel: Funnel[];
    products_by_views: { id: string; name: string; views: number }[];
    never_viewed: { id: string; name: string }[];
    products?: {
      id: string; name: string; shelf_rank: number | null;
      impressions: number; views: number; add_to_cart: number; checkout: number;
      ctr: number | null; cart_rate: number | null; attention: number;
    }[];
    ranking?: { window_days: number; half_life_days: number; weights: Record<string, number> };
  };
  inventory: {
    units: number;
    variants: number;
    by_size: { size: string; variants: number; units: number }[];
    low_stock: { product: string; size: string; sku: string; stock: number }[];
    low_stock_threshold: number;
  };
};

const rupees = (paise: number) =>
  "₹" + Math.round(paise / 100).toLocaleString("en-IN");

function Panel({
  title,
  Icon,
  value,
  note,
  state = "live",
  children,
}: {
  title: string;
  Icon?: typeof Eye;
  value?: React.ReactNode;
  note?: string;
  state?: "live" | "thin" | "none";
  children?: React.ReactNode;
}) {
  const chip = {
    live: "bg-green-50 text-green-700",
    thin: "bg-amber-50 text-amber-700",
    none: "bg-gray-100 text-gray-500",
  }[state];
  const label = { live: "Live", thin: "Thin data", none: "No data yet" }[state];

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-start gap-2 min-w-0">
          {Icon && <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />}
          {/* Wraps rather than truncates. Truncating clipped the titles that
              carry the most meaning — "Contribution margin" became
              "CONTRIBUTIO…", which names nothing. */}
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600 leading-snug">
            {title}
          </h2>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${chip}`}>
          {label}
        </span>
      </div>
      {value !== undefined && (
        <p className={`text-2xl font-semibold tabular-nums ${state === "none" ? "text-gray-300" : "text-gray-900"}`}>
          {value}
        </p>
      )}
      {children}
      {note && <p className="text-[11px] text-gray-500 leading-relaxed mt-2">{note}</p>}
    </div>
  );
}

type BriefPayload = {
  brief: { headline: string; bullets: string[]; critical: string[]; source: string; note?: string };
  facts: { as_of: string; today: { orders: number; revenue_paise: number }; week: { orders: number; revenue_paise: number; sessions: number } };
};

/**
 * Today, this week, and anything critical — in sentences.
 *
 * The one panel the founder reads before the numbers. Written by Claude
 * when a key is set, from rules when it is not, and it says which.
 */
function Brief() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<BriefPayload>({
    queryKey: ["admin", "dashboard", "brief"],
    queryFn: async () => (await adminApi.get("/dashboard/brief")).data,
    staleTime: 15 * 60_000,
    retry: 1,
  });
  if (isLoading) return <div className="mb-5 h-24 rounded-xl bg-rose/60 animate-pulse" />;
  if (error || !data) {
    const e: any = error;
    return <p className="mb-5 text-xs text-gray-500">No brief right now ({e?.response?.status ?? "no response"}).</p>;
  }
  const { brief, facts } = data;
  const when = new Date(facts.as_of).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
  return (
    <section className="mb-6 rounded-xl border border-ink/10 bg-gradient-to-br from-rose via-white to-white p-4 sm:p-5" aria-labelledby="brief-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rani">Today&apos;s brief</p>
          <h2 id="brief-heading" className="font-display text-xl sm:text-2xl text-ink leading-tight mt-1">{brief.headline}</h2>
        </div>
        <button onClick={() => adminApi.get("/dashboard/brief", { params: { refresh: 1 } }).then(() => refetch())} disabled={isFetching}
          className="text-[11px] text-gray-500 hover:text-ink underline underline-offset-2 whitespace-nowrap disabled:opacity-50">
          {isFetching ? "Updating…" : "Refresh"}
        </button>
      </div>
      {brief.critical.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {brief.critical.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-red-800 font-medium">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" /> {c}
            </li>
          ))}
        </ul>
      )}
      <ul className="mt-3 space-y-1.5">
        {brief.bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-800">
            <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-rani shrink-0" /> {b}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-gray-500">
        As of {when} · {brief.source === "rules" ? "written from rules" : `written by ${brief.source}`}{brief.note ? ` · ${brief.note}` : ""}
      </p>
    </section>
  );
}

export default function AdminDashboard() {
  const { data, isLoading, error, refetch } = useQuery<Dash>({
    queryKey: ["admin", "dashboard"],
    queryFn: async () => (await adminApi.get("/dashboard")).data,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-gray-500">Loading the overview…</div>;
  }
  if (error || !data) {
    const e: any = error;
    const detail = e?.response?.data?.detail ?? e?.message ?? "no response";
    const status = e?.response?.status;
    return (
      <div className="p-6 space-y-3">
        <Brief />
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-800 font-semibold">The overview could not load.</p>
          <p className="text-xs text-red-700 mt-1">
            {status ? `The API answered ${status}: ` : "The API did not answer: "}{String(detail)}
          </p>
          <button onClick={() => refetch()} className="mt-2 text-xs font-semibold text-red-800 underline underline-offset-2">Try again</button>
        </div>
      </div>
    );
  }

  const { meta, commerce, attention, inventory } = data;
  const browse = !meta.checkout_enabled;
  const maxViews = Math.max(1, ...attention.products_by_views.map((p) => p.views));
  const maxUnits = Math.max(1, ...inventory.by_size.map((s) => s.units));
  const maxFunnel = Math.max(1, ...attention.funnel.map((f) => f.count));

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8 max-w-6xl">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h1 className="text-[22px] sm:text-2xl font-semibold text-gray-900">Overview</h1>
        <p className="text-xs text-gray-500">Last {meta.window_days} days</p>
      </div>

      <Brief />
      {meta.errors?.length ? (
        <p className="mb-3 text-xs text-amber-700">Some panels are missing: {meta.errors.join("; ")}.</p>
      ) : null}
      {browse && (
        <div className="mb-5 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900 leading-relaxed">
            The store is in <strong>browse mode</strong>, so no order can be created.
            The commerce panels below are empty because nothing could be sold — not
            because nothing sold.
          </p>
        </div>
      )}

      {/* ── Commerce ─────────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Panel
          title="Revenue"
          Icon={IndianRupee}
          value={rupees(commerce.revenue_window_paise)}
          state={commerce.orders_window > 0 ? "live" : "none"}
          note={commerce.orders_window > 0
            ? `${commerce.orders_window} orders in ${meta.window_days} days`
            : browse ? "Opens when checkout does." : "No orders in this window."}
        />
        <Panel
          title="Orders"
          Icon={ShoppingBag}
          value={commerce.orders_all_time}
          state={commerce.orders_all_time > 0 ? "live" : "none"}
          note={"All time. " + Object.entries(commerce.by_status)
            .map(([s, n]) => `${n} ${s.toLowerCase()}`)
            .join(" · ") || "Nothing yet."}
        />
        <Panel
          title="Customers"
          Icon={Users}
          value={commerce.customers}
          state={commerce.customers > 0 ? "live" : "none"}
          note={commerce.customers > 0 ? "Signed-up shoppers." : "Sign-in works; nobody has yet."}
        />
        <Panel
          title="Contribution margin"
          value="—"
          state="none"
          note={"Needs " + commerce.contribution_margin_blocked_on.join(", ") + ". None of these are recorded anywhere yet."}
        />
      </div>

      {/* ── COD vs prepaid ───────────────────────────────────────────────── */}
      {Object.keys(commerce.by_payment_method).length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 mb-6">
          {Object.entries(commerce.by_payment_method).map(([method, v]) => (
            <Panel key={method} title={method} value={rupees(v.revenue)} state="live"
                   note={`${v.orders} orders`} />
          ))}
        </div>
      )}

      {/* ── Attention ────────────────────────────────────────────────────── */}
      <h2 className="text-sm font-semibold text-gray-900 mb-2 mt-8">Where attention goes</h2>
      <div className="grid gap-3 lg:grid-cols-2 mb-6">
        <Panel
          title="Funnel"
          Icon={Eye}
          state={attention.funnel.some((f) => f.count > 0) ? "thin" : "none"}
          note={`${attention.sessions} sessions · ${meta.events_recorded} events recorded all time`}
        >
          <div className="flex flex-col gap-1.5 mt-1">
            {attention.funnel.map((f) => (
              <div key={f.key}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-gray-600">{f.label}</span>
                  <span className="tabular-nums font-medium text-gray-900">{f.count}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded mt-0.5 overflow-hidden">
                  <div className="h-full bg-ink rounded"
                       style={{ width: `${(f.count / maxFunnel) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Product attention"
          state={attention.products_by_views.some((p) => p.views > 0) ? "thin" : "none"}
          note={attention.never_viewed.length > 0
            ? `${attention.never_viewed.length} of ${attention.products_by_views.length} products have never been opened.`
            : "Every product has been opened at least once."}
        >
          <div className="flex flex-col gap-1.5 mt-1 max-h-56 overflow-y-auto">
            {attention.products_by_views.map((p) => (
              <div key={p.id}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-gray-600 truncate">{p.name}</span>
                  <span className="tabular-nums font-medium text-gray-900">{p.views}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded mt-0.5 overflow-hidden">
                  <div className={`h-full rounded ${p.views ? "bg-ink" : "bg-gray-200"}`}
                       style={{ width: p.views ? `${(p.views / maxViews) * 100}%` : "3px" }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Per product: where a tap is earned and where a sale is lost.
          ctr says whether the card earns the open; cart rate says whether the
          page earns the bag. Read together they tell her which of the two to
          fix — a high ctr with a low cart rate is a photograph better than its
          page, and the reverse is a page better than its photograph. */}
      {attention.products && attention.products.length > 0 && (
        <Panel
          title="Product funnel"
          state={attention.products.some((p) => p.impressions > 0) ? "thin" : "none"}
          note={attention.ranking
            ? `Score = recent activity, halving every ${attention.ranking.half_life_days} days. It is what orders the shelf when nothing is pinned.`
            : undefined}
        >
          <div className="overflow-x-auto -mx-2 px-2 mt-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-1.5 pr-2 font-medium">Product</th>
                  <th className="py-1.5 pr-2 font-medium text-right">Shown</th>
                  <th className="py-1.5 pr-2 font-medium text-right">Opened</th>
                  <th className="py-1.5 pr-2 font-medium text-right" title="Opened ÷ shown">CTR</th>
                  <th className="py-1.5 pr-2 font-medium text-right">Bagged</th>
                  <th className="py-1.5 pr-2 font-medium text-right" title="Bagged ÷ opened">Cart rate</th>
                  <th className="py-1.5 pr-2 font-medium text-right">Score</th>
                  <th className="py-1.5 font-medium text-right">Shelf</th>
                </tr>
              </thead>
              <tbody>
                {attention.products.map((p) => {
                  const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
                  const weak = p.impressions >= 20 && (p.ctr ?? 0) < 0.05;
                  const leak = p.views >= 10 && (p.cart_rate ?? 0) < 0.05;
                  return (
                    <tr key={p.id} className="border-t border-gray-100">
                      <td className="py-1.5 pr-2 text-gray-900 truncate max-w-[14rem]">
                        {p.name}
                        {weak && <span className="ml-1.5 text-[10px] text-amber-700 bg-amber-50 rounded px-1" title="Shown often, rarely opened — the photograph or price on the card is not earning the tap.">weak card</span>}
                        {leak && <span className="ml-1.5 text-[10px] text-red-700 bg-red-50 rounded px-1" title="Opened often, rarely bagged — the page is losing them. Check sizes in stock, price, photographs.">page leak</span>}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{p.impressions}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{p.views}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{pct(p.ctr)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{p.add_to_cart}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{pct(p.cart_rate)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums font-medium">{p.attention}</td>
                      <td className="py-1.5 text-right text-gray-500">{p.shelf_rank != null ? `pinned #${p.shelf_rank + 1}` : "auto"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <a href="/admin/shelf" className="inline-block mt-2 text-xs text-ink font-semibold underline underline-offset-2">Arrange the shelf →</a>
          </div>
        </Panel>
      )}

      {/* ── Inventory ────────────────────────────────────────────────────── */}
      <h2 className="text-sm font-semibold text-gray-900 mb-2 mt-8">Stock</h2>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel
          title="Stock by size"
          Icon={Package}
          value={`${inventory.units} units`}
          state="live"
          note={`${inventory.variants} variants across the active catalogue`}
        >
          <div className="flex flex-col gap-1.5 mt-2">
            {inventory.by_size.map((s) => (
              <div key={s.size}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-gray-600">{s.size} — {s.variants} variants</span>
                  <span className="tabular-nums font-medium text-gray-900">{s.units}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded mt-0.5 overflow-hidden">
                  <div className="h-full bg-ink rounded"
                       style={{ width: `${(s.units / maxUnits) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title={`Running low (${inventory.low_stock_threshold} or fewer)`}
          Icon={AlertTriangle}
          state={inventory.low_stock.length > 0 ? "thin" : "live"}
          note={inventory.low_stock.length === 0 ? "Nothing is running low." : undefined}
        >
          {inventory.low_stock.length > 0 && (
            <ul className="flex flex-col gap-1 mt-1">
              {inventory.low_stock.map((v) => (
                <li key={v.sku} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-gray-600 truncate">{v.product} · {v.size}</span>
                  <span className={`tabular-nums font-semibold ${v.stock <= 2 ? "text-red-600" : "text-amber-700"}`}>
                    {v.stock}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/admin/inventory" className="text-[11px] text-ink underline mt-2 inline-block">
            Manage inventory
          </Link>
        </Panel>
      </div>
    </div>
  );
}
