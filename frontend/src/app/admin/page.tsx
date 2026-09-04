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

export default function AdminDashboard() {
  const { data, isLoading, error } = useQuery<Dash>({
    queryKey: ["admin", "dashboard"],
    queryFn: async () => (await adminApi.get("/dashboard")).data,
    refetchOnWindowFocus: true,
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-gray-500">Loading the overview…</div>;
  }
  if (error || !data) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-700">
          Could not load the overview. It needs the admin API — try reloading.
        </p>
      </div>
    );
  }

  const { meta, commerce, attention, inventory } = data;
  const browse = !meta.checkout_enabled;
  const maxViews = Math.max(1, ...attention.products_by_views.map((p) => p.views));
  const maxUnits = Math.max(1, ...inventory.by_size.map((s) => s.units));
  const maxFunnel = Math.max(1, ...attention.funnel.map((f) => f.count));

  return (
    <div className="p-4 lg:p-6 max-w-6xl">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
        <p className="text-xs text-gray-500">Last {meta.window_days} days</p>
      </div>

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
                  <div className="h-full bg-[#5C3317] rounded"
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
                  <div className={`h-full rounded ${p.views ? "bg-[#5C3317]" : "bg-gray-200"}`}
                       style={{ width: p.views ? `${(p.views / maxViews) * 100}%` : "3px" }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

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
                  <div className="h-full bg-[#5C3317] rounded"
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
          <Link href="/admin/inventory" className="text-[11px] text-[#5C3317] underline mt-2 inline-block">
            Manage inventory
          </Link>
        </Panel>
      </div>
    </div>
  );
}
