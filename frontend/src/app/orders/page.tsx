"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, Package } from "lucide-react";
import { useOrders } from "@/lib/queries/orders";
import { formatPrice } from "@/lib/queries/catalog";

const STATUS_COLORS: Record<string, string> = {
  CREATED: "bg-gray-100 text-gray-600",
  PAYMENT_PENDING: "bg-yellow-100 text-yellow-700",
  PAID: "bg-blue-100 text-blue-700",
  FAILED_PAYMENT: "bg-red-100 text-red-600",
  PACKED: "bg-purple-100 text-purple-700",
  SHIPPED: "bg-indigo-100 text-indigo-700",
  DELIVERED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-600",
  RETURNED: "bg-orange-100 text-orange-600",
};

export default function OrdersPage() {
  const router = useRouter();
  const { data: orders, isLoading } = useOrders();

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center px-5 pt-12 pb-4 border-b border-gray-100">
        <button onClick={() => router.back()} className="mr-3">
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
        <h1 className="font-serif text-lg font-bold text-foreground">
          My Orders
        </h1>
      </div>

      <div className="px-5 py-4">
        {/* Loading skeletons */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 bg-gray-100 rounded-xl animate-pulse"
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && (!orders || orders.length === 0) && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Package className="w-16 h-16 text-muted" />
            <p className="text-muted">No orders yet</p>
            <button
              onClick={() => router.push("/shop")}
              className="bg-primary text-white px-6 py-3 rounded-full font-semibold text-sm"
            >
              Start Shopping
            </button>
          </div>
        )}

        {/* Orders list */}
        <div className="space-y-3">
          {orders?.map((order) => (
            <div
              key={order.id}
              onClick={() => router.push(`/orders/${order.id}`)}
              className="bg-white rounded-xl p-4 shadow-sm cursor-pointer active:scale-[0.98] transition-transform"
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-semibold text-foreground text-sm">
                    Order #{order.id.slice(0, 8).toUpperCase()}
                  </p>
                  <p className="text-xs text-muted">
                    {new Date(order.created_at).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full font-semibold ${
                    STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-600"
                  }`}
                >
                  {order.status.replace("_", " ")}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <p className="text-xs text-muted">
                  {order.items.length} item
                  {order.items.length !== 1 ? "s" : ""}
                </p>
                <p className="font-bold text-primary">
                  {formatPrice(order.total_amount)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
