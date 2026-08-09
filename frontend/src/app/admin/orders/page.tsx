"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminApi";
import { formatPrice } from "@/lib/queries/catalog";

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

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Orders</h1>
      <div className="flex gap-3 mb-4">
        <input
          className="border rounded-lg px-3 py-2 text-sm flex-1"
          placeholder="Search by order ID or phone…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select
          className="border rounded-lg px-3 py-2 text-sm bg-white"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          {STATUSES.map((s) => <option key={s} value={s}>{s || "All statuses"}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map((i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Order ID", "Date", "Items", "Amount", "Status", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(orders ?? []).map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{order.id.slice(0, 8).toUpperCase()}</td>
                  <td className="px-4 py-3 text-gray-600">{new Date(order.created_at).toLocaleDateString("en-IN")}</td>
                  <td className="px-4 py-3 text-gray-600">{order.items.length}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{formatPrice(order.total_amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {order.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {order.status === "PAID" && (
                        <button onClick={() => updateStatus(order.id, "PACKED")} className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded font-semibold hover:bg-purple-200">
                          Mark Packed
                        </button>
                      )}
                      {order.status === "PACKED" && (
                        <button onClick={() => updateStatus(order.id, "SHIPPED")} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-semibold hover:bg-indigo-200">
                          Mark Shipped
                        </button>
                      )}
                      {order.status === "SHIPPED" && (
                        <button onClick={() => updateStatus(order.id, "DELIVERED")} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-semibold hover:bg-green-200">
                          Delivered
                        </button>
                      )}
                      {["PAID", "PACKED"].includes(order.status) && (
                        <button onClick={() => { if (confirm("Cancel this order?")) updateStatus(order.id, "CANCELLED"); }} className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded font-semibold hover:bg-red-200">
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {(!orders || orders.length === 0) && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No orders found</td></tr>
              )}
            </tbody>
          </table>
          <div className="flex justify-between items-center px-4 py-3 border-t border-gray-100">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="text-sm text-gray-600 disabled:opacity-40">← Previous</button>
            <span className="text-sm text-gray-600">Page {page}</span>
            <button onClick={() => setPage((p) => p + 1)} disabled={(orders?.length ?? 0) < 50} className="text-sm text-gray-600 disabled:opacity-40">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
