"use client";
import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminApi";
import { formatPrice } from "@/lib/queries/catalog";
import { Page, Card, Button, TableScroll, EmptyState, Input, Select, th, td } from "@/components/admin/ui";
import { OrderDetail } from "./OrderDetail";

type OrderDetail = {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  address: { line1: string; line2: string | null; city: string; state: string; pincode: string } | null;
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
};

type Order = {
  id: string; status: string; total_amount: number; created_at: string; items: any[];
  payment_method?: "COD" | "RAZORPAY" | null;
  cod_confirmation?: "PENDING" | "CONFIRMED" | "DECLINED" | "UNREACHABLE" | null;
  cod_amount_due?: number | null;
};

const STATUS_COLORS: Record<string, string> = {
  CREATED: "bg-gray-100 text-gray-600",
  PAYMENT_PENDING: "bg-yellow-100 text-yellow-700",
  PAID: "bg-blue-100 text-blue-700",
  PACKED: "bg-purple-100 text-purple-700",
  SHIPPED: "bg-indigo-100 text-indigo-700",
  DELIVERED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-600",
  FAILED_PAYMENT: "bg-red-100 text-red-600",
};

export default function AdminOrdersPage() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data: orders, isLoading, refetch } = useQuery({
    queryKey: ["admin", "orders", page, statusFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("search", search);
      const res = await adminApi.get<Order[]>(`/orders/?${params}`);
      return res.data;
    },
  });

  const [busy, setBusy] = useState<string | null>(null);
  // Which order is open. Details are fetched only when one is, because name,
  // phone and address should not be pulled fifty at a time to draw a list.
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(orderId: string, fn: () => Promise<unknown>) {
    setBusy(orderId); setError(null);
    try { await fn(); await refetch(); }
    catch (e: any) {
      const d = e?.response?.data?.detail;
      setError(typeof d === "string" ? d : "That did not go through.");
    }
    finally { setBusy(null); }
  }

  const updateStatus = (orderId: string, newStatus: string) =>
    run(orderId, () => adminApi.post(`/orders/${orderId}/status`, { status: newStatus }));

  // She rings the customer; this records the answer. A COD order cannot be
  // packed until it is confirmed, and the confirmation WhatsApp cannot be
  // sent while WHATSAPP_ACCESS_TOKEN is unset - so without this every COD
  // order was stuck at PAYMENT_PENDING with no action available at all.
  const confirmCod = (orderId: string, confirmed: boolean) =>
    run(orderId, () => adminApi.post(`/orders/${orderId}/cod-confirmation`, { confirmed }));

  const STATUSES = ["", "PAYMENT_PENDING", "PAID", "PACKED", "SHIPPED", "DELIVERED", "CANCELLED"];

  const rows = orders ?? [];
  const StatusPill = ({ s }: { s: string }) => (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${STATUS_COLORS[s] ?? "bg-gray-100 text-gray-600"}`}>{s.replace(/_/g, " ")}</span>
  );
  const Actions = ({ order }: { order: Order }) => {
    const cod = order.payment_method === "COD";
    const awaiting = cod && (!order.cod_confirmation || order.cod_confirmation === "PENDING" || order.cod_confirmation === "UNREACHABLE");
    const confirmed = cod && order.cod_confirmation === "CONFIRMED";
    const working = busy === order.id;
    return (
    <>
      {/* A cash order rests in PAYMENT_PENDING by design. Until it is
          confirmed it may not be packed, so the only useful actions here are
          the two answers to the phone call. */}
      {awaiting && order.status === "PAYMENT_PENDING" && (
        <>
          <Button size="sm" variant="primary" disabled={working} onClick={() => confirmCod(order.id, true)}>Customer confirmed</Button>
          <Button size="sm" variant="danger" disabled={working} onClick={() => { if (confirm("Customer said no? This cancels the order and returns the stock.")) confirmCod(order.id, false); }}>Said no</Button>
        </>
      )}
      {confirmed && order.status === "PAYMENT_PENDING" && (
        <Button size="sm" variant="primary" disabled={working} onClick={() => updateStatus(order.id, "PAID")}>Accept &amp; prepare</Button>
      )}
      {order.status === "PAID" && <Button size="sm" variant="primary" disabled={working} onClick={() => updateStatus(order.id, "PACKED")}>Mark packed</Button>}
      {order.status === "PACKED" && <Button size="sm" variant="primary" onClick={() => updateStatus(order.id, "SHIPPED")}>Mark shipped</Button>}
      {order.status === "SHIPPED" && <Button size="sm" variant="primary" onClick={() => updateStatus(order.id, "DELIVERED")}>Delivered</Button>}
      {["PAID", "PACKED"].includes(order.status) && <Button size="sm" variant="danger" disabled={working} onClick={() => { if (confirm("Cancel this order?")) updateStatus(order.id, "CANCELLED"); }}>Cancel</Button>}
    </>
    );
  };

  const CodPill = ({ order }: { order: Order }) => {
    if (order.payment_method !== "COD") return <span className="text-[11px] text-gray-500">Prepaid</span>;
    const state = order.cod_confirmation ?? "PENDING";
    const tone = state === "CONFIRMED" ? "bg-green-100 text-green-700" : state === "DECLINED" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-800";
    const words: Record<string, string> = { PENDING: "COD · not confirmed", CONFIRMED: "COD · confirmed", DECLINED: "COD · declined", UNREACHABLE: "COD · no answer" };
    return <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${tone}`}>{words[state] ?? "COD"}</span>;
  };
  const when = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return (
    <Page title="Orders" description="Newest first. Move each one along as it is packed, shipped and delivered.">
      {error && <div className="mb-3 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-800">{error}</div>}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <Input placeholder="Search by order ID or phone…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <Select className="sm:w-52" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
          {STATUSES.map((s) => <option key={s} value={s}>{s ? s.replace(/_/g, " ") : "All statuses"}</option>)}
        </Select>
      </div>
      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <Card><EmptyState title="No orders yet" body={statusFilter || search ? "Nothing matches this filter." : "Orders appear here the moment one is placed."} /></Card>
      ) : (
        <>
          <ul className="sm:hidden space-y-3">
            {rows.map((order) => (
              <li key={order.id}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs text-gray-500">{order.id.slice(0, 8).toUpperCase()}</p>
                      <p className="mt-0.5 text-sm text-gray-700">{when(order.created_at)} · {order.items.length} {order.items.length === 1 ? "item" : "items"}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900 tabular-nums">{formatPrice(order.total_amount)}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5"><StatusPill s={order.status} /><CodPill order={order} /></div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 items-center">
                    <Actions order={order} />
                    <button
                      type="button"
                      onClick={() => setOpenId(openId === order.id ? null : order.id)}
                      className="ml-auto text-xs text-ink underline underline-offset-2"
                    >
                      {openId === order.id ? "Hide details" : "What to pack"}
                    </button>
                  </div>
                  {openId === order.id && <OrderDetail orderId={order.id} />}
                </Card>
              </li>
            ))}
          </ul>
          <Card padded={false} className="hidden sm:block">
            <TableScroll minWidth={680}>
              <table className="w-full">
                <thead className="border-b border-gray-100"><tr>{["Order", "Date", "Items", "Amount", "Status", ""].map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((order) => (
                    <Fragment key={order.id}>
                    <tr className="hover:bg-gray-50">
                      <td className={`${td} font-mono text-xs text-gray-700`}>
                        <button type="button" onClick={() => setOpenId(openId === order.id ? null : order.id)} className="underline underline-offset-2">
                          {order.id.slice(0, 8).toUpperCase()}
                        </button>
                      </td>
                      <td className={`${td} text-gray-600`}>{when(order.created_at)}</td>
                      <td className={`${td} text-gray-600`}>{order.items.length}</td>
                      <td className={`${td} font-semibold tabular-nums`}>{formatPrice(order.total_amount)}</td>
                      <td className={td}><div className="flex flex-wrap items-center gap-1.5"><StatusPill s={order.status} /><CodPill order={order} /></div></td>
                      <td className={`${td} text-right whitespace-nowrap`}><div className="inline-flex gap-1.5"><Actions order={order} /></div></td>
                    </tr>
                    {openId === order.id && (
                      <tr><td colSpan={6} className="px-4 pb-4 bg-gray-50/60"><OrderDetail orderId={order.id} /></td></tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </Card>
          <div className="flex justify-between items-center py-3">
            <Button size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>← Previous</Button>
            <span className="text-sm text-gray-600">Page {page}</span>
            <Button size="sm" onClick={() => setPage((p) => p + 1)} disabled={rows.length < 50}>Next →</Button>
          </div>
        </>
      )}
    </Page>
  );
}
