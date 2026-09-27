import type { Metadata } from "next";
import GenZView from "./GenZView";
import { fetchProductList, fetchTruth, REVALIDATE_SECONDS } from "@/lib/server/catalog";
import { EMPTY_TRUTH, shortLine } from "@/lib/truth";
import { itemListJsonLd, jsonLdString } from "@/lib/structuredData";
import { SITE_URL } from "@/lib/legal";
import { BRAND } from "@/lib/brand";

/**
 * The home page, rendered on the server.
 *
 * Since 2026-09-27 this is the storefront first previewed at /genz (DESIGN.md
 * §16): one worn piece full-bleed, a swipe rail, fit as a number, and every
 * cost of checkout in one table before the bag. /genz now redirects here.
 * The earlier home page (categories, occasions, today's pattern, founder
 * note) is retired in FEATURES.md with the commit to restore it from.
 *
 * The HTML carries the drop and an ItemList of the pieces, so Google and AI
 * assistants read what ZISUN sells before any script runs. Rebuilt at most
 * every five minutes.
 */
export const revalidate = REVALIDATE_SECONDS;

// Only what is true of the shop today; the fabric words come from the catalogue.
export async function generateMetadata(): Promise<Metadata> {
  const truth = (await fetchTruth()) ?? EMPTY_TRUTH;
  return {
    title: `${BRAND.name} | Kurtas & co-ord sets for women, Bengaluru`,
    description: `${shortLine(truth)} Photographed on her at 153 cm. Find your size privately; free shipping on prepaid orders.`,
    alternates: { canonical: SITE_URL },
  };
}

export default async function HomePage() {
  const [drop, truth] = await Promise.all([
    fetchProductList({ limit: 12, sort_by: "shelf" }),
    fetchTruth(),
  ]);
  return (
    <>
      {drop?.items?.length ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(itemListJsonLd(drop.items, "The drop", SITE_URL)) }} />
      ) : null}
      <GenZView initial={drop ?? undefined} truth={truth ?? EMPTY_TRUTH} />
    </>
  );
}
