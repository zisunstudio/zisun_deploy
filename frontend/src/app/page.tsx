import type { Metadata } from "next";
import HomeView from "./HomeView";
import { fetchCategories, fetchFeed, fetchProductList, REVALIDATE_SECONDS } from "@/lib/server/catalog";
import { itemListJsonLd, jsonLdString } from "@/lib/structuredData";
import { SITE_URL } from "@/lib/legal";
import { BRAND } from "@/lib/brand";

/**
 * The home page, rendered on the server.
 *
 * It used to arrive as an empty shell that filled itself in the browser, so
 * Google indexed a title and a skeleton and an AI assistant read nothing
 * about what ZISUN sells. The HTML now carries the drop, the categories and
 * an ItemList of the pieces; the interactive page is unchanged and starts
 * from this data. Rebuilt at most every five minutes; if the API is down it
 * renders in the browser as it always did.
 */
export const revalidate = REVALIDATE_SECONDS;

// Only what is true of the shop today. Fabric and "handloom" claims wait for
// the founder's confirmation (see CLAUDE.md).
export const metadata: Metadata = {
  title: `${BRAND.name} | Kurtas & co-ord sets for women, Bengaluru`,
  description:
    "Kurtas and co-ord sets for women, chosen by founder Sushmita in Bengaluru and photographed on herself at 153 cm. Find your size privately; free shipping on prepaid orders.",
  alternates: { canonical: SITE_URL },
};

export default async function HomePage() {
  const [drop, feed, categories] = await Promise.all([
    fetchProductList({ limit: 6, sort_by: "shelf" }),
    fetchFeed(1),
    fetchCategories(),
  ]);
  return (
    <>
      {drop?.items?.length ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(itemListJsonLd(drop.items, "The drop", SITE_URL)) }} />
      ) : null}
      <HomeView initial={{ drop: drop ?? undefined, feed: feed ?? undefined, categories: categories ?? undefined }} />
    </>
  );
}
