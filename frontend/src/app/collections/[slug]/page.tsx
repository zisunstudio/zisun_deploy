import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchCollection } from "@/lib/server/catalog";
import { itemListJsonLd, jsonLdString } from "@/lib/structuredData";
import { SITE_URL } from "@/lib/legal";
import { BRAND } from "@/lib/brand";
import CollectionView from "./CollectionView";

/**
 * A hand-picked set of pieces, for a campaign or an influencer's post.
 *
 * Server-rendered so the first paint already has the photographs and the
 * prices - a visitor from a reel decides in seconds. Rebuilt a minute after
 * the founder changes it. The influencer's credit is not in this URL: her
 * link `zisun.in/r/<code>` lands here with `?inf=`, which the tracker reads
 * and removes (lib/influencer.ts).
 */
export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const c = await fetchCollection(params.slug);
  if (!c) return { title: BRAND.name };
  const url = `${SITE_URL}/collections/${c.slug}`;
  const cover = c.products[0]?.media?.[0];
  return {
    title: `${c.name} | ${BRAND.name}`,
    description: c.description ?? `${c.products.length} pieces chosen by Sushmita, photographed on her at 153 cm.`,
    alternates: { canonical: url },
    openGraph: { url, title: `${c.name} | ${BRAND.name}`, images: cover ? [{ url: cover.cdn_url ?? cover.url }] : undefined },
  };
}

export default async function CollectionPage({ params }: { params: { slug: string } }) {
  const c = await fetchCollection(params.slug);
  if (!c) notFound();
  const url = `${SITE_URL}/collections/${c.slug}`;
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(itemListJsonLd(c.products, c.name, url)) }} />
      <CollectionView collection={c} />
    </>
  );
}
