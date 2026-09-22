import type { Metadata } from "next";
import CategoryView from "./CategoryView";
import { fetchCategory, REVALIDATE_SECONDS } from "@/lib/server/catalog";
import { itemListJsonLd, jsonLdString, trailJsonLd } from "@/lib/structuredData";
import { SITE_URL } from "@/lib/legal";
import { BRAND } from "@/lib/brand";

/**
 * A category, rendered on the server. Before this the page Google saw was
 * five words long; now it has the category's name, the founder's line about
 * it, every piece, and an ItemList + breadcrumb.
 */
export const revalidate = REVALIDATE_SECONDS;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const c = await fetchCategory(params.slug);
  if (!c) return { title: BRAND.name };
  const url = `${SITE_URL}/category/${c.slug}`;
  const n = c.products?.length ?? c.product_count ?? 0;
  return {
    title: `${c.name} for women | ${BRAND.name}`,
    description: `${c.description ? `${c.description.trim().replace(/\.?$/, ".")} ` : ""}${n} ${n === 1 ? "piece" : "pieces"}, chosen by Sushmita in Bengaluru. Free shipping on prepaid orders.`,
    alternates: { canonical: url },
    openGraph: { url, title: `${c.name} | ${BRAND.name}`, images: c.image_url ? [{ url: c.image_url }] : undefined },
  };
}

export default async function CategoryPage({ params }: { params: { slug: string } }) {
  const c = await fetchCategory(params.slug);
  const url = `${SITE_URL}/category/${params.slug}`;
  return (
    <>
      {c && (
        <>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(itemListJsonLd(c.products ?? [], c.name, url)) }} />
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(trailJsonLd([{ name: "Home", url: SITE_URL }, { name: "Collection", url: `${SITE_URL}/shop` }, { name: c.name, url }])) }} />
        </>
      )}
      <CategoryView params={params} initial={c} />
    </>
  );
}
