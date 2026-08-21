import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ProductMedia {
  id: string;
  url: string;
  cdn_url: string | null;
  type: "IMAGE" | "VIDEO";
  display_order: number;
}

export interface ProductVariant {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  stock: number;
  price_delta: number;
  is_active: boolean;
  version: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  description: string | null;
  is_active: boolean;
  product_count: number;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  base_price: number;
  category_id: string | null;
  category: Category | null;
  is_active: boolean;
  variants: ProductVariant[];
  media: ProductMedia[];
  created_at: string;
  updated_at: string;
}

export interface ProductListResponse {
  items: Product[];
  total: number;
  page: number;
  limit: number;
}

export type SortBy = "newest" | "price_asc" | "price_desc";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Paise → formatted rupee string: 249900 → "₹2,499" */
export function formatPrice(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

/** First active image URL for a product, or placeholder */
export function productImageUrl(product: Product): string {
  const img = product.media.find((m) => m.type === "IMAGE");
  // LOCAL fallback on purpose: next/image remotePatterns allowlists only our
  // media host, so a remote placeholder would be BLOCKED and render broken.
  return img?.cdn_url ?? img?.url ?? "/placeholder-product.svg";
}

// ── Query keys ─────────────────────────────────────────────────────────────────

export const catalogKeys = {
  categories: () => ["categories"] as const,
  category: (slug: string) => ["categories", slug] as const,
  products: (params: object) => ["products", params] as const,
  product: (id: string) => ["products", id] as const,
  search: (q: string, page: number) => ["search", q, page] as const,
  feed: (page: number) => ["feed", page] as const,
};

// ── Hooks ──────────────────────────────────────────────────────────────────────

export function useCategories() {
  return useQuery<Category[]>({
    queryKey: catalogKeys.categories(),
    queryFn: () => api.get("/catalog/categories").then((r) => r.data),
  });
}

export function useCategory(slug: string) {
  return useQuery<Category & { products: Product[] }>({
    queryKey: catalogKeys.category(slug),
    queryFn: () => api.get(`/catalog/categories/${slug}`).then((r) => r.data),
    enabled: !!slug,
  });
}

export function useProducts(params: {
  page?: number;
  limit?: number;
  category_id?: string;
  sort_by?: SortBy;
} = {}) {
  return useQuery<ProductListResponse>({
    queryKey: catalogKeys.products(params),
    queryFn: () =>
      api.get("/catalog/products", { params: { page: 1, limit: 20, ...params } }).then((r) => r.data),
  });
}

export function useProduct(id: string) {
  return useQuery<Product>({
    queryKey: catalogKeys.product(id),
    queryFn: () => api.get(`/catalog/products/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useSearch(q: string, page = 1) {
  return useQuery<ProductListResponse>({
    queryKey: catalogKeys.search(q, page),
    queryFn: () =>
      api.get("/catalog/search", { params: { q, page, limit: 20 } }).then((r) => r.data),
    enabled: q.trim().length >= 2,
  });
}

export function useFeed(page = 1) {
  return useQuery<ProductListResponse>({
    queryKey: catalogKeys.feed(page),
    queryFn: () => api.get("/feed", { params: { page, limit: 20 } }).then((r) => r.data),
  });
}

// ── Cart mutation (local Zustand + optimistic API) ─────────────────────────────

export function useAddToCart() {
  return useMutation({
    mutationFn: (payload: { variant_id: string; quantity: number }) =>
      api.post("/cart/items", payload).then((r) => r.data),
  });
}
