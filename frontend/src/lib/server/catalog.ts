/**
 * The catalogue, read on the server.
 *
 * Used by the pages and routes a machine reads first - product pages, the
 * sitemap, the product feed and llms.txt - so that Google, Claude, ChatGPT
 * and every other agent get the real page rather than an empty shell that
 * fills itself in with JavaScript they may never run.
 *
 * Every call fails soft to null/[]: a slow or down API must degrade the page
 * to its client-rendered self, never take it down.
 */
import { API_V1 } from "@/lib/apiBase";
import type { Category, Product, ProductListResponse } from "@/lib/queries/catalog";
import type { Truth } from "@/lib/truth";
import type { Article, ArticleCard } from "@/lib/journal";

/** How long a server-rendered copy may be served before it is rebuilt. */
export const REVALIDATE_SECONDS = 300;

export async function fetchProduct(id: string): Promise<Product | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const res = await fetch(`${API_V1}/catalog/products/${id}`, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) return null;
    return (await res.json()) as Product;
  } catch {
    return null;
  }
}

/** Every live product, for the sitemap, the feed and llms.txt. */
export async function fetchAllProducts(): Promise<Product[]> {
  const out: Product[] = [];
  try {
    for (let page = 1; page <= 20; page++) {
      const res = await fetch(`${API_V1}/catalog/products?page=${page}&limit=50&sort_by=shelf`, { next: { revalidate: REVALIDATE_SECONDS } });
      if (!res.ok) break;
      const data = (await res.json()) as ProductListResponse;
      out.push(...data.items);
      if (data.items.length < 50) break;
    }
  } catch {
    /* whatever arrived is still worth listing */
  }
  return out.filter((p) => p.is_active);
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_V1}${path}`, { next: { revalidate: REVALIDATE_SECONDS } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Exactly the request a page's browser query makes, so the data can seed it. */
export function fetchProductList(params: Record<string, string | number | undefined>): Promise<ProductListResponse | null> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ page: 1, limit: 20, ...params })) if (v !== undefined) q.set(k, String(v));
  return getJson<ProductListResponse>(`/catalog/products?${q}`);
}

export const fetchCategories = () => getJson<Category[]>("/catalog/categories");

export function fetchCategory(slug: string) {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return Promise.resolve(null);
  return getJson<Category & { products: Product[] }>(`/catalog/categories/${slug}`);
}

export const fetchTruth = () => getJson<Truth>("/catalog/truth");

// ── The Journal ──────────────────────────────────────────────────────────────
// Published articles only; the API serves nothing else on these paths.
export const fetchArticles = (kind?: string) => getJson<ArticleCard[]>(`/journal${kind ? `?kind=${encodeURIComponent(kind)}` : ""}`);
export const fetchArticle = (slug: string) => getJson<Article>(`/journal/${encodeURIComponent(slug)}`);
export const fetchArticlesForProduct = (id: string) => getJson<ArticleCard[]>(`/journal/for-product/${id}`);

export const fetchFeed = (page = 1) => getJson<ProductListResponse>(`/catalog/feed?page=${page}&limit=20`);
