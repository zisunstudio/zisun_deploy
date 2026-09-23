"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Check, Package, Truck, Home, RotateCcw, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { LegalFooter } from "@/components/LegalFooter";
import { formatPrice } from "@/lib/queries/catalog";
import { COMPANY } from "@/lib/legal";

/**
 * Where is my order.
 *
 * The most asked question after buying, and the site could not answer it: the
 * AWB was written when the parcel was handed over and never read back, so
 * every customer had to message the founder to find out - the most expensive
 * way to answer anything, and the slowest for her.
 *
 * Reachable by order id alone. A guest who bought in one tap has no account
 * to sign in to, and making her create one to see her own parcel would be a
 * worse answer than none. The endpoint returns no name, phone or address for
 * the same reason.
 *
 * The journey is always drawn, even before the courier knows anything, so
 * she can see the whole path and where along it her parcel is - rather than
 * a status word that means nothing on its own.
 */
interface Tracking {
  order_id: string;
  placed_at: string | null;
  status: string;
  payment_method: string | null;
  cod_amount_due: number | null;
  items: number;
  step: string;
  awb: string | null;
  courier: string | null;
  courier_status: string | null;
  expected_at: string | null;
  delivered_at: string | null;
  checkpoints: Array<{ at: string | null; status: string | null; location: string | null }>;
  track_url: string | null;
  live_unavailable: boolean;
  /** Null for orders placed before the breakdown existed - "not recorded". */
  invoice: {
    number: string | null;
    issued_at: string | null;
    place_of_supply: string | null;
    taxable_paise: number | null;
    cgst_paise: number | null;
    sgst_paise: number | null;
    igst_paise: number | null;
    total_paise: number | null;
    lines: Array<{ description: string; hsn: string; quantity: number; rate_pct: number; inclusive_paise: number }>;
  } | null;
}

/** The path a parcel takes, in the words a customer would use. */
const JOURNEY = [
  { key: "placed", label: "Order placed", Icon: Check },
  { key: "confirmed", label: "Confirmed", Icon: Check },
  { key: "packed", label: "Packed", Icon: Package },
  { key: "in_transit", label: "On its way", Icon: Truck },
  { key: "out_for_delivery", label: "Out for delivery", Icon: Truck },
  { key: "delivered", label: "Delivered", Icon: Home },
] as const;

const ORDER_OF: Record<string, number> = {
  placed: 0, confirmed: 1, packed: 2, picked_up: 3, in_transit: 3,
  attempted: 4, out_for_delivery: 4, delivered: 5,
};

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold text-ink" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

export function OrderTracking({ orderId }: { orderId: string }) {
  const { data, isLoading, error } = useQuery<Tracking>({
    queryKey: ["order", "tracking", orderId],
    queryFn: async () => (await api.get(`/orders/${orderId}/tracking`)).data,
    // A parcel does not move every second; do not hammer the courier.
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-porcelain">
      <header className="px-5 lg:px-8 pt-10 max-w-2xl mx-auto">
        <p className="text-[11px] uppercase tracking-[0.24em] text-burgundy">Your order</p>
      </header>
      <main className="px-5 lg:px-8 max-w-2xl mx-auto pb-16">{children}</main>
      <LegalFooter />
    </div>
  );

  if (isLoading) {
    return <Shell><div className="mt-6 h-64 rounded-card bg-rose/50 animate-pulse" /></Shell>;
  }
  if (error || !data) {
    return (
      <Shell>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">We could not find that order.</h1>
        <p className="mt-3 text-[15px] text-muted">Check the link from your confirmation, or message us and we will look it up.</p>
        <Link href="/shop" className="mt-6 inline-block text-burgundy underline underline-offset-4">Back to the collection</Link>
      </Shell>
    );
  }

  const cancelled = data.step === "cancelled";
  const returning = data.step === "returning";
  const reached = ORDER_OF[data.step] ?? 0;

  return (
    <Shell>
      <h1 className="mt-2 font-display text-[32px] lg:text-[38px] leading-tight text-ink">
        {data.step === "delivered" ? "Delivered." : cancelled ? "This order was cancelled." : returning ? "On its way back to us." : "On its way."}
      </h1>
      <p className="mt-2 text-[14px] text-muted">
        {data.items} {data.items === 1 ? "piece" : "pieces"}
        {data.placed_at && <> · ordered {when(data.placed_at)}</>}
      </p>

      {/* The whole path, always. A single status word tells her nothing about
          how far along it is. */}
      {!cancelled && (
        <ol className="mt-8 border-l border-ink/12 pl-6 space-y-6">
          {JOURNEY.map((s, i) => {
            const done = i <= reached;
            const now = i === reached;
            return (
              <li key={s.key} className="relative">
                <span
                  className={`absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-porcelain ${done ? "bg-burgundy text-white" : "bg-ink/10 text-ink/40"}`}
                  aria-hidden
                >
                  <s.Icon className="h-3 w-3" />
                </span>
                <p className={`text-[15px] leading-none ${now ? "font-semibold text-ink" : done ? "text-ink/70" : "text-ink/35"}`}>{s.label}</p>
                {now && data.courier_status && (
                  <p className="mt-1.5 text-[13px] text-muted">{data.courier_status}</p>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {returning && (
        <p className="mt-6 rounded-card bg-rose/60 px-4 py-3 text-[14px] text-ink">
          The courier is bringing this parcel back to us. We will message you as soon as it reaches, and sort out the refund or a fresh delivery.
        </p>
      )}

      {/* The courier's own details, so she can chase it herself if she likes. */}
      {data.awb && (
        <div className="mt-8 rounded-card border border-ink/10 bg-white px-4 py-3.5">
          <p className="text-[13px] text-muted">
            {data.courier ? <>Carried by <span className="text-ink">{data.courier}</span> · </> : null}
            tracking number <span className="text-ink tabular-nums">{data.awb}</span>
          </p>
          {data.expected_at && <p className="mt-1 text-[13px] text-muted">Expected {when(data.expected_at) ?? data.expected_at}</p>}
          {data.track_url && (
            <a href={data.track_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[13px] text-burgundy underline underline-offset-4">
              Follow it on the courier&rsquo;s site
            </a>
          )}
          {data.live_unavailable && (
            <p className="mt-2 text-[12px] text-muted">
              The courier&rsquo;s tracking is not answering just now. The parcel is with them &mdash; this page will catch up.
            </p>
          )}
        </div>
      )}

      {data.payment_method === "COD" && data.cod_amount_due && data.step !== "delivered" && (
        <p className="mt-4 text-[14px] text-ink">
          Keep <span className="font-semibold">{formatPrice(data.cod_amount_due)}</span> ready for the courier.
        </p>
      )}

      {/* Every checkpoint, for anyone who wants the detail. */}
      {data.checkpoints.length > 0 && (
        <details className="mt-8 group">
          <summary className="cursor-pointer list-none text-[14px] text-burgundy underline underline-offset-4 [&::-webkit-details-marker]:hidden">
            Every update
          </summary>
          <ul className="mt-4 space-y-3">
            {data.checkpoints.map((c, i) => (
              <li key={i} className="text-[13px] leading-snug">
                <span className="text-ink">{c.status}</span>
                <span className="text-muted">
                  {c.location ? ` · ${c.location}` : ""}
                  {c.at ? ` · ${when(c.at) ?? c.at}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* The tax invoice. ZISUN is GST-registered, so this is not a nicety:
          the customer is entitled to see what tax she paid, and it is inside
          the price rather than added to it. Folded away because most people
          never open it, and present because some must. */}
      {data.invoice && data.invoice.taxable_paise != null && (
        <details className="mt-8 rounded-card border border-ink/10 bg-white px-4 py-3.5">
          <summary className="cursor-pointer list-none text-[14px] text-ink [&::-webkit-details-marker]:hidden">
            Tax invoice
            {data.invoice.number && <span className="ml-2 text-[12px] text-muted tabular-nums">{data.invoice.number}</span>}
          </summary>

          <table className="mt-4 w-full text-[12px]">
            <thead>
              <tr className="text-left text-muted">
                <th className="font-normal pb-1">Item</th>
                <th className="font-normal pb-1">HSN</th>
                <th className="font-normal pb-1 text-right">GST</th>
                <th className="font-normal pb-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="align-top">
              {data.invoice.lines.map((l, i) => (
                <tr key={i} className="border-t border-ink/[0.06]">
                  <td className="py-1.5 pr-2 text-ink">{l.description}{l.quantity > 1 ? ` × ${l.quantity}` : ""}</td>
                  <td className="py-1.5 pr-2 text-muted tabular-nums">{l.hsn}</td>
                  <td className="py-1.5 text-right text-muted tabular-nums">{l.rate_pct}%</td>
                  <td className="py-1.5 text-right text-ink tabular-nums">{formatPrice(l.inclusive_paise)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="mt-3 space-y-1 border-t border-ink/[0.06] pt-3 text-[12px]">
            <Row label="Taxable value" value={formatPrice(data.invoice.taxable_paise)} />
            {!!data.invoice.cgst_paise && <Row label="CGST" value={formatPrice(data.invoice.cgst_paise)} />}
            {!!data.invoice.sgst_paise && <Row label="SGST" value={formatPrice(data.invoice.sgst_paise)} />}
            {!!data.invoice.igst_paise && <Row label="IGST" value={formatPrice(data.invoice.igst_paise)} />}
            <Row label="Total paid" value={formatPrice(data.invoice.total_paise ?? 0)} strong />
          </dl>

          <p className="mt-3 text-[11px] text-muted leading-relaxed">
            Prices include GST; it is inside the amount you paid, not added to it.
            {data.invoice.place_of_supply && <> Place of supply: {data.invoice.place_of_supply}.</>}
            {" "}GSTIN {COMPANY.gstin}.
          </p>
        </details>
      )}

      <Link href="/shop" className="mt-10 inline-block text-[15px] text-ink hover:underline underline-offset-4">
        ← The collection
      </Link>
    </Shell>
  );
}
