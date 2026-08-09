"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";

export interface CartItem {
  id: string;
  product_variant_id: string;
  quantity: number;
  unit_price: number; // paise
  product_name?: string;
  image_url?: string;
  size?: string;
  color?: string;
  sku?: string;
}

export interface CartResponse {
  id: string;
  items: CartItem[];
  cart_total: number; // paise
}

export const cartKeys = {
  cart: () => ["cart"] as const,
};

export function useCart() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  return useQuery({
    queryKey: cartKeys.cart(),
    queryFn: async () => {
      const res = await api.get<CartResponse>("/cart/");
      return res.data;
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
}

export function useAddToCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      variant_id,
      quantity,
    }: {
      variant_id: string;
      quantity?: number;
    }) => api.post("/cart/items", { variant_id, quantity: quantity ?? 1 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: cartKeys.cart() }),
  });
}

export function useRemoveFromCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (variant_id: string) =>
      api.delete(`/cart/items/${variant_id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: cartKeys.cart() }),
  });
}

export function useUpdateCartQuantity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      item_id,
      quantity,
    }: {
      item_id: string;
      quantity: number;
    }) => api.put(`/cart/items/${item_id}`, { quantity }),
    onSuccess: () => qc.invalidateQueries({ queryKey: cartKeys.cart() }),
  });
}

export interface CheckoutPayload {
  address_id: string;
  payment_method?: "RAZORPAY" | "COD";
  coupon_code?: string;
}

export interface CheckoutResponse {
  order_id: string;
  razorpay_order_id?: string | null;
  amount: number;
  discount_amount: number;
  currency: string;
  payment_method: string;
  is_cod: boolean;
}

export function useInitiateCheckout() {
  return useMutation({
    mutationFn: (payload: CheckoutPayload) =>
      api.post<CheckoutResponse>(
        "/cart/checkout/initiate",
        payload,
        { headers: { "X-Idempotency-Key": crypto.randomUUID() } }
      ),
  });
}

export function useApplyCoupon() {
  return useMutation({
    mutationFn: ({ code, order_total }: { code: string; order_total: number }) =>
      api.post<{ code: string; discount_amount: number; final_total: number; message: string }>(
        "/coupons/apply",
        { code, order_total }
      ),
  });
}

export function useVerifyPayment() {
  return useMutation({
    mutationFn: (payload: {
      razorpay_payment_id: string;
      razorpay_order_id: string;
      razorpay_signature: string;
    }) =>
      api.post<{ success: boolean; order_id: string }>(
        "/checkout/verify-payment",
        payload
      ),
  });
}
