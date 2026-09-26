"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Check, Truck, Printer, RefreshCw } from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import { Button, Field, Input } from "@/components/admin/ui";
import { pickupDay, pickupTime } from "@/lib/pickup";

/**
 * When the courier comes, who it is, and where the parcel is now.
 *
 * Packing an order used to create an order in Shiprocket and stop: no
 * courier, no pickup, nothing written back, every error swallowed. She could
 * pack a parcel and have no way to know that nobody was coming for it. Now
 * marking packed books the courier and asks for the pickup, and this says
 * what happened - or exactly what failed, with a retry and a way to enter a
 * booking she made herself.
 */
export interface ShipmentShape {
  carrier: string;
  courier_name: string | null;
  awb_number: string | null;
  shipment_id: string | null;
  pickup_scheduled_at: string | null;
  pickup_token: string | null;
  label_url: string | null;
  status: string | null;
  last_error: string | null;
}

interface Tracking {
  courier: string | null;
  status: string | null;
  step: string;
  expected_at: string | null;
  delivered_at: string | null;
  checkpoints: Array<{ at: string; status: string | null; location: string | null }>;
  track_url: string | null;
}

const STEP_WORDS: Record<string, string> = {
  packed: "Waiting for pickup",
  picked_up: "Picked up",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  attempted: "Delivery attempted",
  delivered: "Delivered",
  returning: "Coming back (RTO)",
};

export function Shipment({ orderId, orderStatus, shipment }: {
  orderId: string; orderStatus: string; shipment: ShipmentShape | null;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ awb: "", courier: "", pickup_date: "", via_shiprocket: true });

  const s = shipment;
  const trackable = !!s?.awb_number && s.carrier === "shiprocket" && ["PACKED", "SHIPPED"].includes(orderStatus);

  // Asking the courier also moves the order on: PACKED -> SHIPPED once it is
  // picked up, SHIPPED -> DELIVERED once delivered. Only forwards.
  const track = useQuery<{ tracking: Tracking | null; moved: string[]; live_unavailable?: boolean }>({
    queryKey: ["admin", "order", orderId, "track"],
    queryFn: async () => (await adminApi.post(`/orders/${orderId}/shipment/refresh`)).data,
    enabled: trackable,
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    if (track.data?.moved?.length) {
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      qc.invalidateQueries({ queryKey: ["admin", "order", orderId], exact: true });
    }
  }, [track.data, qc, orderId]);

  async function send(fn: () => Promise<{ data: unknown }>) {
    setBusy(true); setErr(null);
    try {
      const { data } = await fn();
      qc.setQueryData(["admin", "order", orderId], data);
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      setManual(false);
    } catch (e: any) {
      const d = e?.response?.data?.detail;
      setErr(typeof d === "string" ? d : "That did not go through.");
    } finally { setBusy(false); }
  }

  const retry = () => send(() => adminApi.post(`/orders/${orderId}/shipment/book`));
  const saveManual = () => send(() => adminApi.post(`/orders/${orderId}/shipment/manual`, {
    awb: form.awb.trim(),
    courier: form.courier.trim(),
    pickup_date: form.pickup_date || null,
    via_shiprocket: form.via_shiprocket,
  }));

  if (["PAYMENT_PENDING", "PAID", "CREATED"].includes(orderStatus) && !s) {
    return (
      <Section>
        <p className="text-sm text-gray-600">A courier is booked the moment you mark it packed.</p>
      </Section>
    );
  }
  if (["CANCELLED", "FAILED_PAYMENT"].includes(orderStatus) && !s) return null;

  const booked = !!s?.awb_number && !!s?.pickup_scheduled_at;
  const problem = !booked && orderStatus === "PACKED";
  const live = track.data?.tracking;
  const time = s?.pickup_scheduled_at ? pickupTime(s.pickup_scheduled_at) : null;
  const leftHands = live && live.step !== "packed";

  return (
    <Section>
      {/* The one line she opened this for. */}
      {s?.pickup_scheduled_at && !leftHands && orderStatus === "PACKED" && (
        <p className="text-sm text-gray-900">
          <Truck className="inline w-4 h-4 mr-1 -mt-0.5 text-gray-500" />
          Pickup <strong>{pickupDay(s.pickup_scheduled_at)}</strong>{time ? `, from ${time}` : ""}
          {s.courier_name ? ` · ${s.courier_name}` : ""}
        </p>
      )}
      {s?.pickup_scheduled_at && (leftHands || orderStatus !== "PACKED") && (
        <p className="text-xs text-gray-500">Pickup was booked for {pickupDay(s.pickup_scheduled_at)}{s.courier_name ? ` · ${s.courier_name}` : ""}</p>
      )}

      {s?.awb_number && (
        <p className="mt-1 text-xs text-gray-700 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>AWB <span className="font-mono tabular-nums">{s.awb_number}</span></span>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(s.awb_number!).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {})}
            className="inline-flex items-center gap-1 text-ink underline underline-offset-2"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}{copied ? "Copied" : "Copy"}
          </button>
          {s.label_url && (
            <a href={s.label_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-burgundy underline underline-offset-2">
              <Printer className="w-3 h-3" />Print label
            </a>
          )}
        </p>
      )}
      {s?.pickup_token && orderStatus === "PACKED" && <p className="mt-0.5 text-[11px] text-gray-500 break-words">{s.pickup_token}</p>}

      {/* Where it is now, from the courier. */}
      {trackable && (
        <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2">
          {track.isLoading ? (
            <p className="text-xs text-gray-500">Asking the courier…</p>
          ) : live ? (
            <>
              <p className="text-sm text-gray-900 font-semibold">{STEP_WORDS[live.step] ?? live.status}</p>
              {live.checkpoints[0] && (
                <p className="text-xs text-gray-600">
                  {live.checkpoints[0].status}{live.checkpoints[0].location ? ` · ${live.checkpoints[0].location}` : ""} · {live.checkpoints[0].at}
                </p>
              )}
              {live.expected_at && live.step !== "delivered" && <p className="text-xs text-gray-600">Expected by {live.expected_at}</p>}
              {!!track.data?.moved?.length && <p className="text-xs text-green-700">Order moved to {track.data.moved.join(" → ").toLowerCase()}.</p>}
            </>
          ) : (
            <p className="text-xs text-gray-500">The courier could not be reached just now.</p>
          )}
          <button type="button" onClick={() => track.refetch()} disabled={track.isFetching}
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-ink underline underline-offset-2">
            <RefreshCw className={`w-3 h-3 ${track.isFetching ? "animate-spin" : ""}`} />Ask again
          </button>
        </div>
      )}

      {/* Nobody is coming: say why, and offer both ways out. */}
      {problem && (
        <div className="mt-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
          <p className="text-sm font-semibold text-amber-900">
            {s?.awb_number ? "Courier assigned, but no pickup booked" : "No courier booked yet"}
          </p>
          {s?.last_error && <p className="mt-0.5 text-xs text-amber-900 break-words">{s.last_error}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {(!s || s.carrier === "shiprocket") && (
              <Button size="sm" variant="primary" disabled={busy} onClick={retry}>Try booking again</Button>
            )}
            <Button size="sm" disabled={busy} onClick={() => setManual((m) => !m)}>{manual ? "Close" : "I booked it myself"}</Button>
          </div>
        </div>
      )}
      {!problem && ["PACKED", "SHIPPED"].includes(orderStatus) && !manual && (
        <button type="button" onClick={() => {
          setForm({ awb: s?.awb_number ?? "", courier: s?.courier_name ?? "", pickup_date: "", via_shiprocket: (s?.carrier ?? "shiprocket") === "shiprocket" });
          setManual(true);
        }} className="mt-2 text-[11px] text-gray-500 underline underline-offset-2">Change courier details</button>
      )}

      {manual && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <Field label="AWB / tracking number" className="flex-1">
              <Input value={form.awb} onChange={(e) => setForm({ ...form, awb: e.target.value })} inputMode="text" autoCapitalize="characters" />
            </Field>
            <Field label="Courier" className="flex-1">
              <Input value={form.courier} placeholder="Delhivery, India Post…" onChange={(e) => setForm({ ...form, courier: e.target.value })} />
            </Field>
          </div>
          <Field label="Pickup day" hint="Leave empty if you are dropping it off.">
            <Input type="date" value={form.pickup_date} onChange={(e) => setForm({ ...form, pickup_date: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.via_shiprocket} onChange={(e) => setForm({ ...form, via_shiprocket: e.target.checked })} />
            Booked in Shiprocket (so tracking can be read here)
          </label>
          <Button size="sm" variant="primary" disabled={busy || form.awb.trim().length < 3 || form.courier.trim().length < 2} onClick={saveManual}>
            Save courier
          </Button>
        </div>
      )}
      {err && <p className="mt-2 text-xs text-red-700">{err}</p>}
    </Section>
  );
}

function Section({ children }: { children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Courier</p>
      {children}
    </div>
  );
}
