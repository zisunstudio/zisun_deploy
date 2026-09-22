import type { Metadata } from "next";
import ShopView from "./ShopView";
import { fetchCategories, fetchProductList, REVALIDATE_SECONDS } from "@/lib/server/catalog";
import { itemListJsonLd, jsonLdString, trailJsonLd } from "@/lib/structuredData";
import { SITE_URL } from "@/lib/legal";
import { BRAND } from "@/lib/brand";

/** The collection, rendered on the server - see app/page.tsx for why. */
export const revalidate = REVALIDATE_SECONDS;
const URL = `${SITE_URL}/shop`;

export async function generateMetadata(): Promise<Metadata> {
  const [list, categories] = await Promise.all([fetchProductList({ sort_by: "newest" }), fetchCategories()]);
  const names = (categories ?? []).filter((c) => c.product_count > 0).map((c) => c.name.toLowerCase());
  const count = list?.total ?? list?.items?.length ?? 0;
  return {
    title: `Collection — kurtas & co-ord sets for women | ${BRAND.name}`,
    description: `${count ? `${count} ${count === 1 ? "piece" : "pieces"}` : "Pieces"}${names.length ? ` across ${names.join(", ")}` : ""}, chosen by Sushmita in Bengaluru. Free shipping on prepaid orders.`,
    alternates: { canonical: URL },
  };
}

export default async function ShopPage() {
  // The same request the page's default view makes, so it can seed it.
  const [products, categories] = await Promise.all([fetchProductList({ sort_by: "newest" }), fetchCategories()]);
  return (
    <>
      {products?.items?.length ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(itemListJsonLd(products.items, "Collection", URL)) }} />
      ) : null}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(trailJsonLd([{ name: "Home", url: SITE_URL }, { name: "Collection", url: URL }])) }} />
      <ShopView initial={{ products: products ?? undefined, categories: categories ?? undefined }} />
    </>
  );
}
