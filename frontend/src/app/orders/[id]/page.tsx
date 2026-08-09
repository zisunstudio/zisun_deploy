"use client";

import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Truck,
  CheckCircle,
  Clock,
  XCircle,
} from "lucide-react";
import { useOrder } from "@/lib/queries/orders";
import { formatPrice } from "@/lib/queries/catalog";

const PROGRESS_STEPS = [
  "CREATED",
  "PAYMENT_PENDING",
  "PAID",
  "PACKED",
  "SHIPPED",
  "DELIVERED",
] as const;

const STEP_LABELS: Record<string, string> = {
  CREATED: "Order Placed",
  PAYMENT_PENDING: "Awaiting Payment",
  PAID: "Payment Confirmed",
  PACKED: "Packed",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
};

export default function OrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { data: order, isLoading } = useOrder(params.id);

  if (isLoading) {
    return (
      <div className="h-full flex flex-col bg-background">
        <div className="flex items-center px-5 pt-12 pb-4 border-b border-gray-100">
          <button onClick={() => router.back()} className="mr-3">
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
          <div className="h-5 bg-gray-200 rounded w-40 animate-pulse" />
        </div>
        <div className="px-5 space-y-3 pt-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 bg-gray-100 rounded-xl animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted">Order not found.</p>
      </div>
    );
  }

  const currentStepIdx = PROGRESS_STEPS.indexOf(order.status as any);
  const isCancelled =
    order.status === "CANCELLED" || order.status === "FAILED_PAYMENT";

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center px-5 pt-12 pb-4 border-b border-gray-100">
        <button onClick={() => router.back()} className="mr-3">
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
        <div>
          <h1 className="font-serif text-lg font-bold text-foreground">
            Order #{order.id.slice(0, 8).toUpperCase()}
          </h1>
          <p className="text-xs text-muted">
            {new Date(order.created_at).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-5 pb-6">
        {/* Status stepper */}
        <div className="py-5">
          {isCancelled ? (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-3">
              <XCircle className="w-5 h-5 flex-shrink-0" />
              <span className="font-semibold text-sm">
                {order.status === "CANCELLED"
                  ? "Order Cancelled"
                  : "Payment Failed"}
              </span>
            </div>
          ) : (
            <div className="space-y-0">
              {PROGRESS_STEPS.map((s, i) => {
                const done = i <= currentStepIdx;
                const active = i === currentStepIdx;
                return (
                  <div key={s} className="flex items-start gap-3">
                    {/* Icon + connector column */}
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                          done ? "bg-primary" : "bg-gray-200"
                        }`}
                      >
                        {done ? (
                          <CheckCircle className="w-4 h-4 text-white" />
                        ) : (
                          <Clock className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                      {i < PROGRESS_STEPS.length - 1 && (
                        <div
                          className={`w-0.5 h-5 mt-0.5 ${
                            done ? "bg-primary" : "bg-gray-200"
                          }`}
                        />
                      )}
                    </div>
                    {/* Label */}
                    <div className="pt-1.5 pb-4">
                      <span
                        className={`text-sm ${
                          active
                            ? "font-bold text-foreground"
                            : done
                            ? "text-foreground"
                            : "text-muted"
                        }`}
                      >
                        {STEP_LABELS[s]}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Fulfillment / tracking */}
        {order.fulfillment?.awb_number && (
          <div className="bg-blue-50 rounded-xl p-4 mb-4 flex items-center gap-3">
            <Truck className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-blue-700">
                Tracking: {order.fulfillment.awb_number}
              </p>
              <p className="text-xs text-blue-600">
                {order.fulfillment.carrier}
              </p>
            </div>
          </div>
        )}

        {/* Items */}
        <div className="mb-4">
          <h3 className="font-semibold text-foreground mb-2">Items</h3>
          <div className="space-y-2">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-xl p-3 shadow-sm flex justify-between items-center"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Variant {item.product_variant_id.slice(0, 8)}
                  </p>
                  <p className="text-xs text-muted">Qty: {item.quantity}</p>
                </div>
                <p className="font-bold text-primary text-sm">
                  {formatPrice(item.unit_price * item.quantity)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Total */}
        <div className="bg-white rounded-xl p-4 shadow-sm flex justify-between font-bold text-foreground">
          <span>Total Paid</span>
          <span className="text-primary">{formatPrice(order.total_amount)}</span>
        </div>

        {/* Payment info */}
        {order.payment && (
          <div className="mt-3 bg-gray-50 rounded-xl p-3 text-xs text-muted">
            Payment: {order.payment.gateway} &mdash; {order.payment.status}
            {order.payment.processed_at && (
              <span>
                {" "}
                &middot;{" "}
                {new Date(order.payment.processed_at).toLocaleDateString(
                  "en-IN"
                )}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
