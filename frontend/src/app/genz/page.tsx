import type { Metadata } from "next";
import GenZView from "./GenZView";
import { fetchProductList, fetchTruth, REVALIDATE_SECONDS } from "@/lib/server/catalog";
import { EMPTY_TRUTH, shortLine } from "@/lib/truth";
import { itemListJsonLd, jsonLdString } from "@/lib/structuredData";
import { SITE_URL } from "@/lib/legal";
import { BRAND } from "@/lib/brand";

/**
 * The next storefront, previewed at /genz.
 *
 * Built for women who are 13 to 30 today and will be ZISUN's main buyers
 * through 2035, most of whom arrive from Instagram's in-app browser on a
 * mid-range Android. The reasoning is in DESIGN.md §16 and the research notes
 * behind it; the short version is that this audience trusts its own research
 * over any ad, punishes anything that feels fake, and returns clothes mostly
 * because of fit - so the page leads with honesty and fit, not with noise.
 *
 * Rendered on the server like the home page (ISR, five minutes) so the first
 * paint has the drop in it and a crawler or an AI assistant can read it.
 * Not indexed while it is a preview: it carries the same pieces as the home
 * page, and two URLs competing for one catalogue helps neither. When it
 * replaces the home page, this page moves to `/` and the flag goes.
 */
export const revalidate = REVALIDATE_SECONDS;
const URL = `${SITE_URL}/genz`;

export async function generateMetadata(): Promise<Metadata> {
  const truth = (await fetchTruth()) ?? EMPTY_TRUTH;
  return {
    title: `${BRAND.name} — the drop`,
    description: `${shortLine(truth)} Photographed on the founder at 153 cm. Prices include GST; free shipping on prepaid orders.`,
    alternates: { canonical: URL },
    robots: { index: false, follow: true },
    openGraph: { type: "website", url: URL, title: `${BRAND.name} — the drop`, siteName: BRAND.name },
  };
}

export default async function GenZPage() {
  const [drop, truth] = await Promise.all([
    fetchProductList({ limit: 12, sort_by: "shelf" }),
    fetchTruth(),
  ]);
  return (
    <>
      {drop?.items?.length ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(itemListJsonLd(drop.items, "The drop", URL)) }} />
      ) : null}
      <GenZView initial={drop ?? undefined} truth={truth ?? EMPTY_TRUTH} />
    </>
  );
}
