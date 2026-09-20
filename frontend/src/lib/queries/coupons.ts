import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface PublicCoupon {
  code: string;
  type: "FLAT" | "PERCENT";
  value: number;
  min_order_value: number;
  max_discount: number | null;
  expires_at: string | null;
}

/** "20% off" or "₹200 off", the way the ticket says it. */
export function couponHeadline(c: PublicCoupon): string {
  return c.type === "PERCENT" ? `${c.value}% off` : `₹${Math.round(c.value / 100)} off`;
}

/** The small print: threshold and cap, only when they exist. */
export function couponTerms(c: PublicCoupon): string | null {
  const parts: string[] = [];
  if (c.min_order_value > 0) parts.push(`on orders over ₹${Math.round(c.min_order_value / 100)}`);
  if (c.type === "PERCENT" && c.max_discount) parts.push(`up to ₹${Math.round(c.max_discount / 100)}`);
  return parts.length ? parts.join(", ") : null;
}

/**
 * The coupons the shop is advertising right now. Public; the API filters out
 * expired, inactive and referral codes so the page never shows a dead one.
 */
export function useActiveCoupons() {
  return useQuery<PublicCoupon[]>({
    queryKey: ["coupons", "active"],
    queryFn: async () => (await api.get("/coupons/active")).data,
    staleTime: 5 * 60_000,
  });
}
