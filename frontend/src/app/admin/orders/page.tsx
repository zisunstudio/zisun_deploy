"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminApi";
import { formatPrice } from "@/lib/queries/catalog";
import { Page, Card, Button, TableScroll, EmptyState, Input, Select, th, td } from "@/components/admin/ui";

type Order = { id: string; status: string; total_amount: number; created_at: string; items: any[] };

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

  async function updateStatus(orderId: string, newStatus: string) {
    await adminApi.post(`/orders/${orderId}/status`, { status: newStatus });
    refetch();
  }

  const STATUSES = ["", "PAYMENT_PENDING", "PAID", "PACKED", "SHIPPED", "DELIVERED", "CANCELLED"];

  const rows = orders ?? [];
  const StatusPill = ({ s }: { s: string }) => (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${STATUS_COLORS[s] ?? "bg-gray-100 text-gray-600"}`}>{s.replace(/_/g, " ")}</span>
  );
  const Actions = ({ order }: { order: Order }) => (
    <>
      {order.status === "PAID" && <Button size="sm" variant="primary" onClick={() => updateStatus(order.id, "PACKED")}>Mark packed</Button>}
      {order.status === "PACKED" && <Button size="sm" variant="primary" onClick={() => updateStatus(order.id, "SHIPPED")}>Mark shipped</Button>}
      {order.status === "SHIPPED" && <Button size="sm" variant="primary" onClick={() => updateStatus(order.id, "DELIVERED")}>Delivered</Button>}
      {["PAID", "PACKED"].includes(order.status) && <Button size="sm" variant="danger" onClick={() => { if (confirm("Cancel this order?")) updateStatus(order.id, "CANCELLED"); }}>Cancel</Button>}
    </>
  );
  const when = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return (
    <Page title="Orders" description="Newest first. Move each one along as it is packed, shipped and delivered.">
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
                      <div className="mt-1"><StatusPill s={order.status} /></div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2"><Actions order={order} /></div>
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
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className={`${td} font-mono text-xs text-gray-700`}>{order.id.slice(0, 8).toUpperCase()}</td>
                      <td className={`${td} text-gray-600`}>{when(order.created_at)}</td>
                      <td className={`${td} text-gray-600`}>{order.items.length}</td>
                      <td className={`${td} font-semibold tabular-nums`}>{formatPrice(order.total_amount)}</td>
                      <td className={td}><StatusPill s={order.status} /></td>
                      <td className={`${td} text-right whitespace-nowrap`}><div className="inline-flex gap-1.5"><Actions order={order} /></div></td>
                    </tr>
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
