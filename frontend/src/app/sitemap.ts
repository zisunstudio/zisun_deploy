import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/legal";
import { fetchAllProducts, fetchCategories, REVALIDATE_SECONDS } from "@/lib/server/catalog";

/**
 * The pages a search engine or an AI crawler should find: the shop, every
 * live piece, and the policy pages.
 *
 * Products are read from the API each time the sitemap is rebuilt (every
 * five minutes at most), so it never lists a piece that has been taken
 * down - the reason it used to be static. If the API is unreachable the
 * static pages are still listed.
 */
export const revalidate = REVALIDATE_SECONDS;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [products, categories] = await Promise.all([fetchAllProducts(), fetchCategories()]);
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/shop`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    // Categories with something in them - an empty one is a page not worth ranking.
    ...(categories ?? []).filter((c) => c.is_active && c.product_count > 0).map((c) => ({
      url: `${SITE_URL}/category/${c.slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.85,
    })),
    ...products.map((p) => ({
      url: `${SITE_URL}/product/${p.id}`,
      lastModified: new Date(p.updated_at || now),
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/refund`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/shipping`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
  ];
}
