"use client";
import { useQuery } from "@tanstack/react-query";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { adminApi } from "@/lib/adminApi";
import { formatPrice } from "@/lib/queries/catalog";

/**
 * Everything needed to put one parcel in a bag.
 *
 * The orders list could say an order existed - id, date, amount, status -
 * and nothing about what was in it or where it was going. A line in the API
 * carried a product_variant_id, and the address and customer were loaded by
 * the endpoint but never exposed by its schema. Nobody can pack from a UUID.
 *
 * Fetched on demand rather than with the list, because name, phone and
 * address are the most sensitive rows in the database and have no business
 * being pulled fifty at a time to render a summary.
 */
export interface OrderDetailShape {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  address: {
    line1: string; line2: string | null; city: string; state: string; pincode: string;
    latitude?: number | null; longitude?: number | null; location_accuracy_m?: number | null;
  } | null;
  detailed_items: Array<{
    quantity: number; unit_price: number; product_name: string | null;
    sku: string | null; size: string | null; colour: string | null; image_url: string | null;
  }>;
  invoice_number: string | null;
  awb_number: string | null;
  carrier: string | null;
  shipping_amount?: number;
  cod_amount_due?: number | null;
  payment_method?: string | null;
  total_amount?: number;
}

function addressText(d: OrderDetailShape): string {
  const a = d.address;
  return [
    d.customer_name,
    d.customer_phone,
    a?.line1,
    a?.line2 || null,
    a ? `${a.city}, ${a.state} ${a.pincode}` : null,
  ].filter(Boolean).join("\n");
}

export function OrderDetail({ orderId }: { orderId: string }) {
  const [copied, setCopied] = useState(false);
  const { data, isLoading, error } = useQuery<OrderDetailShape>({
    queryKey: ["admin", "order", orderId],
    queryFn: async () => (await adminApi.get(`/orders/${orderId}`)).data,
    staleTime: 60_000,
  });

  if (isLoading) return <div className="mt-3 h-24 rounded-lg bg-gray-100 animate-pulse" />;
  if (error || !data) return <p className="mt-3 text-xs text-red-700">Could not load this order.</p>;

  const a = data.address;

  return (
    <div className="mt-3 border-t border-gray-100 pt-3 space-y-4">
      {/* What goes in the bag. */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Pack</p>
        <ul className="space-y-2">
          {data.detailed_items.map((it, i) => (
            <li key={i} className="flex gap-2.5 items-start">
              {it.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.image_url} alt="" className="w-11 h-14 object-cover rounded border border-gray-200 shrink-0" />
              )}
              <div className="min-w-0 text-sm">
                <p className="text-gray-900 leading-snug">{it.product_name ?? "Piece"}</p>
                <p className="text-xs text-gray-600">
                  {[it.size && `Size ${it.size}`, it.colour, it.quantity > 1 ? `× ${it.quantity}` : null]
                    .filter(Boolean).join(" · ")}
                </p>
                {it.sku && <p className="text-[11px] text-gray-400 tabular-nums">{it.sku}</p>}
              </div>
              <span className="ml-auto text-sm tabular-nums text-gray-700">{formatPrice(it.unit_price * it.quantity)}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Where it goes. One tap to copy the whole block into a courier form. */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Send to</p>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(addressText(data)).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }).catch(() => {});
            }}
            className="inline-flex items-center gap-1 text-[11px] text-ink underline underline-offset-2"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copied" : "Copy address"}
          </button>
        </div>
        {a ? (
          <address className="not-italic text-sm text-gray-900 leading-relaxed">
            {data.customer_name && <>{data.customer_name}<br /></>}
            {a.line1}<br />
            {a.line2 && <>{a.line2}<br /></>}
            {a.city}, {a.state} {a.pincode}
          </address>
        ) : (
          <p className="text-sm text-gray-500">No address on this order.</p>
        )}
        {/* The pin she shared, if she did. A courier drives to the written
            address; this is what saves the delivery when the bell goes
            unanswered. The accuracy is shown so a 900m fix is not mistaken
            for a doorstep. */}
        {a?.latitude != null && a?.longitude != null && (
          <p className="mt-1.5 text-sm">
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${a.latitude},${a.longitude}`}
              target="_blank" rel="noopener noreferrer"
              className="text-burgundy underline underline-offset-2"
            >
              Open her pinned location
            </a>
            {!!a.location_accuracy_m && (
              <span className="ml-2 text-xs text-gray-500">±{a.location_accuracy_m}m</span>
            )}
          </p>
        )}
        {data.customer_phone && (
          <p className="mt-1.5 text-sm">
            <a href={`tel:${data.customer_phone}`} className="text-ink underline underline-offset-2 tabular-nums">{data.customer_phone}</a>
            <a
              href={`https://wa.me/${data.customer_phone.replace(/\D/g, "")}`}
              target="_blank" rel="noopener noreferrer"
              className="ml-3 text-burgundy underline underline-offset-2"
            >
              WhatsApp
            </a>
          </p>
        )}
      </div>

      {/* The few facts that matter after it is packed. */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {data.payment_method === "COD" && !!data.cod_amount_due && (
          <><dt className="text-gray-500">Collect on delivery</dt>
            <dd className="text-gray-900 font-semibold tabular-nums">{formatPrice(data.cod_amount_due)}</dd></>
        )}
        {!!data.shipping_amount && (
          <><dt className="text-gray-500">Shipping charged</dt>
            <dd className="text-gray-900 tabular-nums">{formatPrice(data.shipping_amount)}</dd></>
        )}
        {data.invoice_number && (
          <><dt className="text-gray-500">Invoice</dt>
            <dd className="text-gray-900 tabular-nums">{data.invoice_number}</dd></>
        )}
        {data.awb_number && (
          <><dt className="text-gray-500">Tracking</dt>
            <dd className="text-gray-900 tabular-nums">{data.awb_number}{data.carrier ? ` · ${data.carrier}` : ""}</dd></>
        )}
      </dl>
    </div>
  );
}
