"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * What the shop actually charges, from the shop.
 *
 * `POLICY_TERMS.codShippingRupees` was a constant in lib/legal.ts said to
 * "mirror" COD_SHIPPING_FEE_PAISE on the server. Two numbers, one a copy:
 * change the fee in configuration and every page would go on advertising the
 * old one while the customer was charged the new one. A price shown to a
 * customer comes from the thing that charges it.
 */
export interface CheckoutPolicy {
  cod_fee_paise: number;
  cod_max_order_paise: number;
  prepaid_shipping_paise: number;
  cod_only: boolean;
}

export function useCheckoutPolicy() {
  return useQuery<CheckoutPolicy>({
    queryKey: ["checkout", "policy"],
    queryFn: async () => (await api.get("/checkout/policy")).data,
    // Commercial terms change rarely; never block a page on this.
    staleTime: 30 * 60_000,
    retry: 1,
  });
}
