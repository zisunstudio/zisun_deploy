import type { Metadata } from "next";
import ProductView from "./ProductView";
import { fetchArticlesForProduct, fetchProduct, REVALIDATE_SECONDS } from "@/lib/server/catalog";
import { breadcrumbJsonLd, jsonLdString, plainDescription, productImages, productJsonLd, productUrl } from "@/lib/structuredData";
import { BRAND } from "@/lib/brand";

/**
 * The product page, rendered on the server.
 *
 * It used to be a client component that arrived as an empty shell and
 * fetched the piece in the browser. A shopper on 4G waited for that; Google
 * indexed a skeleton; and an AI shopping agent - which increasingly is how
 * people find clothes - read nothing at all. Now the HTML carries the
 * piece's name, words, photographs and a schema.org Product block, and the
 * interactive page underneath is unchanged: it starts from this data and
 * refetches at once for live stock.
 *
 * Rebuilt at most every five minutes. If the API cannot be reached the page
 * falls back to rendering entirely in the browser, as it always did.
 */
export const revalidate = REVALIDATE_SECONDS;

/**
 * Without this the route is rendered on every request and `revalidate` above
 * is silently ignored: in the App Router a dynamic segment with no
 * generateStaticParams is dynamic, full stop. Measured on 2026-09-26 the
 * product page answered `Cache-Control: no-store`, took 1.3 s to its first
 * byte and 8.6 s in total, and one /shop render sat on a queued API call for
 * the full 60 s - while /, /shop and /journal, which have no dynamic
 * segment, were ISR hits all along. An empty list is the documented way to
 * say "build none now, cache each one the first time it is asked for".
 */
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const p = await fetchProduct(params.id);
  if (!p) return { title: BRAND.name };
  const images = productImages(p).slice(0, 4);
  const description = plainDescription(p).slice(0, 180);
  return {
    title: `${p.name} | ${BRAND.name}`,
    description,
    alternates: { canonical: productUrl(p) },
    openGraph: {
      type: "website",
      url: productUrl(p),
      title: p.name,
      description,
      siteName: BRAND.name,
      images: images.map((url) => ({ url })),
    },
    twitter: { card: "summary_large_image", title: p.name, description, images },
  };
}

export default async function ProductPage({ params }: { params: { id: string } }) {
  // Both at once: the database is a continent away and these are independent.
  const [product, articles] = await Promise.all([
    fetchProduct(params.id),
    // Published articles that name this piece - the link back into the journal.
    fetchArticlesForProduct(params.id),
  ]);
  return (
    <>
      {product && (
        <>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(productJsonLd(product)) }} />
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbJsonLd(product)) }} />
        </>
      )}
      <ProductView params={params} initial={product} articles={articles ?? undefined} />
    </>
  );
}
