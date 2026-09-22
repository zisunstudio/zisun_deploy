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
import type { Product, ProductListResponse } from "@/lib/queries/catalog";

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
