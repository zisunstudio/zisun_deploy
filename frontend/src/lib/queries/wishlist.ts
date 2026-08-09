import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Product, ProductVariant } from "./catalog";
import { useAuthStore } from "@/store/useAuthStore";

export interface WishlistItem {
  id: string;
  product_variant_id: string;
  variant: ProductVariant & { product: Product };
}

export interface WishlistResponse {
  id: string;
  items: WishlistItem[];
  total_items: number;
}

export const wishlistKeys = {
  wishlist: () => ["wishlist"] as const,
};

export function useWishlist() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  return useQuery<WishlistResponse>({
    queryKey: wishlistKeys.wishlist(),
    queryFn: () => api.get("/wishlist").then((r) => r.data),
    enabled: isAuthenticated,
  });
}

export function useAddToWishlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (variant_id: string) =>
      api.post("/wishlist/items", { variant_id }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: wishlistKeys.wishlist() }),
  });
}

export function useRemoveFromWishlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (variant_id: string) =>
      api.delete(`/wishlist/items/${variant_id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: wishlistKeys.wishlist() }),
  });
}
