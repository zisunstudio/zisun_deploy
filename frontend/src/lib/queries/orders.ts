"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";

export type OrderStatus =
  | "CREATED"
  | "PAYMENT_PENDING"
  | "PAID"
  | "FAILED_PAYMENT"
  | "PACKED"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "RETURNED";

export interface OrderItem {
  id: string;
  product_variant_id: string;
  quantity: number;
  unit_price: number; // paise
}

export interface Order {
  id: string;
  status: OrderStatus;
  total_amount: number; // paise
  created_at: string;
  items: OrderItem[];
  payment?: {
    gateway: string;
    status: string;
    amount: number;
    processed_at?: string;
  };
  fulfillment?: {
    carrier: string;
    awb_number?: string;
    status: string;
  };
}

export const orderKeys = {
  orders: () => ["orders"] as const,
  order: (id: string) => ["orders", id] as const,
};

export function useOrders() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  return useQuery({
    queryKey: orderKeys.orders(),
    queryFn: async () => {
      const res = await api.get<Order[]>("/orders/");
      return res.data;
    },
    enabled: isAuthenticated,
  });
}

export function useOrder(id: string) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const TERMINAL = ["DELIVERED", "CANCELLED", "RETURNED"];
  return useQuery({
    queryKey: orderKeys.order(id),
    queryFn: async () => {
      const res = await api.get<Order>(`/orders/${id}`);
      return res.data;
    },
    enabled: isAuthenticated && !!id,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || TERMINAL.includes(data.status)) return false;
      return 30_000; // poll every 30s for non-terminal statuses
    },
  });
}
