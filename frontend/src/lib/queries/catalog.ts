import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ProductMedia {
  id: string;
  url: string;
  cdn_url: string | null;
  type: "IMAGE" | "VIDEO";
  display_order: number;
  variant_id?: string | null;
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

/**
 * Legal Metrology declarations, resolved server-side. Every field except
 * `dimensions` is guaranteed non-empty: the API falls back to the brand-level
 * default when a product carries no override.
 */
export interface LegalMetrology {
  commodity_name: string;
  net_quantity: string;
  dimensions: string | null;
  country_of_origin: string;
  manufacturer_name: string;
  manufacturer_address: string;
  consumer_care_name: string;
  consumer_care_email: string;
  /** Omitted while ZISUN has no business line; never the founder's mobile. */
  consumer_care_phone: string | null;
}

/**
 * Fabric and care. Unlike LegalMetrology there are no brand-level fallbacks:
 * every field is a measurement of one garment, so any of them may be absent and
 * the panel simply omits that row.
 */
export interface FabricSpecs {
  fabric_composition: string | null;
  fabric_gsm: number | null;
  weave: string | null;
  has_pockets: boolean | null;
  colourfastness: string | null;
  wash_care: string | null;
}

/** Resolved by the API; branch on `active` only. */
export interface Offer {
  active: boolean;
  compare_at_price: number | null;
  discount_pct: number | null;
  ends_at: string | null;
}

export type SizeUnit = "cm" | "in";
export interface SizeChartRow {
  size: string;
  chest: number;
  waist: number;
  hip: number;
  top_length: number;
  bottom_length?: number | null;
}
export interface SizeChart {
  unit: SizeUnit;
  /** The body a size fits, or the garment laid out and measured. Unset = inferred. */
  measures?: "body" | "garment" | null;
  rows: SizeChartRow[];
}

/** One way to wear a piece: where to, and how. */
export interface StylingNote { occasion: string; note: string }

export interface GarmentAttributes {
  colour: string | null;
  print_type: string | null;
  pattern: string | null;
  neck_type: string | null;
  sleeve_type: string | null;
  sleeve_attached: boolean | null;
  dupatta_included: boolean | null;
  fit: string | null;
  garment_length: string | null;
  embroidery: string | null;
  bottom_type: string | null;
  occasion: string | null;
  /** Ordered, e.g. ["Kurta", "Palazzo"]. Drives "what you get" and net quantity. */
  set_pieces: string[] | null;
  /** Provenance. Null = not stated; the site claims nothing from a null. */
  craft: string | null;
  origin: string | null;
  lining: string | null;
  transparency: string | null;
  batch_size: number | null;
  will_rerun: boolean | null;
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
  legal_metrology: LegalMetrology;
  fabric_specs: FabricSpecs;
  garment_attributes: GarmentAttributes;
  offer: Offer;
  size_chart: SizeChart | null;
  shelf_rank: number | null;
  styling_notes?: StylingNote[] | null;
  /** Who wears it in the photographs: "M", "5'4\"". */
  model_size?: string | null;
  model_height?: string | null;
  /** Sushmita models her own pieces; true prints "Worn by Sushmita · 153 cm". */
  worn_by_founder?: boolean | null;
  /** One line about the woman the piece is named for. */
  named_for?: string | null;
}

export interface ProductListResponse {
  items: Product[];
  total: number;
  page: number;
  limit: number;
}

// "shelf" is the storefront default: pinned pieces first, then attention.
export type SortBy = "shelf" | "newest" | "price_asc" | "price_desc";

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

/**
 * Server-rendered data for a query. The page paints with it at once (and a
 * crawler reads it); marked stale (updatedAt 0) so the browser still
 * refetches on mount - stock and price are never older than the visit.
 * Only pass it for the exact params the server fetched.
 */
function seed<T>(initial: T | undefined) {
  return initial === undefined ? {} : { initialData: initial, initialDataUpdatedAt: 0 };
}

export function useCategories(initial?: Category[]) {
  return useQuery<Category[]>({
    queryKey: catalogKeys.categories(),
    queryFn: () => api.get("/catalog/categories").then((r) => r.data),
    ...seed(initial),
  });
}

export function useCategory(slug: string, initial?: Category & { products: Product[] }) {
  return useQuery<Category & { products: Product[] }>({
    queryKey: catalogKeys.category(slug),
    queryFn: () => api.get(`/catalog/categories/${slug}`).then((r) => r.data),
    enabled: !!slug,
    ...seed(initial),
  });
}

export function useProducts(params: {
  page?: number;
  limit?: number;
  category_id?: string;
  sort_by?: SortBy;
} = {}, initial?: ProductListResponse) {
  return useQuery<ProductListResponse>({
    queryKey: catalogKeys.products(params),
    queryFn: () =>
      api.get("/catalog/products", { params: { page: 1, limit: 20, ...params } }).then((r) => r.data),
    ...seed(initial),
  });
}

export function useProduct(id: string, initial?: Product) {
  return useQuery<Product>({
    queryKey: catalogKeys.product(id),
    queryFn: () => api.get(`/catalog/products/${id}`).then((r) => r.data),
    enabled: !!id,
    // Server-rendered data paints the page at once; marked as already stale
    // (updatedAt 0) so the client still refetches on mount. Stock and price
    // on screen are never older than the visit.
    initialData: initial,
    initialDataUpdatedAt: initial ? 0 : undefined,
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

export function useFeed(page = 1, initial?: ProductListResponse) {
  return useQuery<ProductListResponse>({
    queryKey: catalogKeys.feed(page),
    queryFn: () => api.get("/catalog/feed", { params: { page, limit: 20 } }).then((r) => r.data),
    ...seed(initial),
  });
}

// ── Cart mutation (local Zustand + optimistic API) ─────────────────────────────

export function useAddToCart() {
  return useMutation({
    mutationFn: (payload: { variant_id: string; quantity: number }) =>
      api.post("/cart/items", payload).then((r) => r.data),
  });
}
