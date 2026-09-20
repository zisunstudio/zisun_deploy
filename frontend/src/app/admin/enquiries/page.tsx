"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminApi";
import { Page, Card, Button, Pill, EmptyState, Swatch } from "@/components/admin/ui";

/**
 * The WhatsApp order book.
 *
 * Every tap on "Order on WhatsApp" lands here as an enquiry. Sushmita
 * replies on her phone; here she says what became of it - replied, ordered
 * (and what was paid), or lost - and that is where the board's conversion
 * and revenue come from while checkout is closed.
 */
type Enquiry = {
  id: string; created_at: string; status: "new" | "replied" | "ordered" | "lost"; source: string;
  product_id: string | null; product_name: string | null; size: string | null; colour: string | null;
  quantity: number; total_paise: number; items: Array<{ name: string; size?: string | null; colour?: string | null; quantity: number; price_paise: number }> | null;
  order_amount_paise: number | null; note: string | null;
};
const TABS: Array<[string, string]> = [["new", "New"], ["replied", "Replied"], ["ordered", "Ordered"], ["lost", "Lost"], ["", "All"]];
const SOURCE: Record<string, string> = { bag: "from the bag", product: "from a product page", sheet: "from Shop the look", fab: "from the WhatsApp button", footer: "from the footer", community: "joined ZISUN Tales" };
const rupees = (p: number) => "₹" + Math.round(p / 100).toLocaleString("en-IN");
const when = (iso: string) => {
  const d = new Date(iso); const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${mins} min ago`; if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

export default function AdminEnquiriesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("new");
  const { data, isLoading } = useQuery<Enquiry[]>({
    queryKey: ["admin", "enquiries", tab],
    queryFn: async () => (await adminApi.get("/enquiries", { params: tab ? { status: tab } : {} })).data,
    refetchInterval: 60_000,
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Pick<Enquiry, "status" | "order_amount_paise" | "note">> }) => adminApi.patch(`/enquiries/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "enquiries"] }); qc.invalidateQueries({ queryKey: ["admin", "dashboard"] }); },
  });
  function markOrdered(e: Enquiry) {
    const suggested = Math.round((e.order_amount_paise ?? e.total_paise) / 100);
    const typed = prompt("What was paid, in rupees?", String(suggested || ""));
    if (typed === null) return;
    const rupeesPaid = Number(typed.replace(/[^\d.]/g, ""));
    if (Number.isNaN(rupeesPaid)) return;
    patch.mutate({ id: e.id, body: { status: "ordered", order_amount_paise: Math.round(rupeesPaid * 100) } });
  }
  const rows = data ?? [];
  const tone = (s: Enquiry["status"]) => (s === "ordered" ? "good" : s === "new" ? "warn" : s === "lost" ? "bad" : "neutral") as "good" | "warn" | "bad" | "neutral";

  return (
    <Page title="WhatsApp enquiries" description="Every tap on Order on WhatsApp. Mark what became of each one - that is where the board's orders and revenue come from.">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 mb-4">
        {TABS.map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)} className={`shrink-0 h-9 px-3 rounded-full text-xs font-semibold border transition-colors ${tab === v ? "bg-ink text-white border-ink" : "bg-white text-gray-700 border-gray-300 hover:border-ink"}`}>{label}</button>
        ))}
      </div>
      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-gray-100 animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <Card><EmptyState title={tab === "new" ? "Nothing waiting" : "No enquiries here"} body={tab === "new" ? "New enquiries appear the moment someone taps Order on WhatsApp." : undefined} /></Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((e) => (
            <li key={e.id}>
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Pill tone={tone(e.status)}>{e.status}</Pill>
                      <span className="text-xs text-gray-500">{when(e.created_at)} · {SOURCE[e.source] ?? e.source}</span>
                    </div>
                    <p className="mt-1.5 font-semibold text-gray-900 leading-snug">
                      {e.product_id ? <Link href={`/admin/products/${e.product_id}/edit`} className="hover:underline underline-offset-2">{e.product_name ?? "A piece"}</Link> : (e.product_name ?? (e.source === "community" ? "ZISUN Tales" : "General enquiry"))}
                    </p>
                    {(e.size || e.colour) && <p className="mt-0.5 text-sm text-gray-600 flex items-center gap-1.5">{e.size && <span>Size {e.size}</span>}{e.colour && <Swatch colour={e.colour} />}</p>}
                    {e.items && e.items.length > 1 && (
                      <ul className="mt-1.5 text-xs text-gray-600 space-y-0.5">
                        {e.items.map((it, i) => <li key={i}>• {it.name}{it.size ? ` · ${it.size}` : ""}{it.colour ? ` · ${it.colour}` : ""} × {it.quantity} — {rupees(it.price_paise * it.quantity)}</li>)}
                      </ul>
                    )}
                    {e.note && <p className="mt-1.5 text-xs text-gray-500 italic">{e.note}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    {e.total_paise > 0 && <p className="text-sm font-semibold text-gray-900 tabular-nums">{rupees(e.total_paise)}</p>}
                    {e.status === "ordered" && e.order_amount_paise != null && <p className="text-xs text-green-700 tabular-nums">paid {rupees(e.order_amount_paise)}</p>}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {e.status !== "replied" && e.status !== "ordered" && <Button size="sm" onClick={() => patch.mutate({ id: e.id, body: { status: "replied" } })}>Replied</Button>}
                  {e.status !== "ordered" && <Button size="sm" variant="primary" onClick={() => markOrdered(e)}>Ordered…</Button>}
                  {e.status === "ordered" && <Button size="sm" onClick={() => markOrdered(e)}>Change amount…</Button>}
                  {e.status !== "lost" && e.status !== "ordered" && <Button size="sm" variant="danger" onClick={() => patch.mutate({ id: e.id, body: { status: "lost" } })}>Lost</Button>}
                  <Button size="sm" variant="ghost" onClick={() => { const n = prompt("Note", e.note ?? ""); if (n !== null) patch.mutate({ id: e.id, body: { note: n } }); }}>Note</Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
