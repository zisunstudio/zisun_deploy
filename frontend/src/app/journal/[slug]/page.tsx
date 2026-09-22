import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BRAND, FOUNDER } from "@/lib/brand";
import { SITE_URL } from "@/lib/legal";
import { KIND_LABEL } from "@/lib/journal";
import { Markdown, plainText } from "@/lib/markdown";
import { fetchArticle, REVALIDATE_SECONDS } from "@/lib/server/catalog";
import { jsonLdString, productUrl, trailJsonLd } from "@/lib/structuredData";
import { LegalFooter } from "@/components/LegalFooter";
import { ProductCard } from "@/components/ProductCard";

export const revalidate = REVALIDATE_SECONDS;

interface Params { params: { slug: string } }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const a = await fetchArticle(params.slug);
  if (!a) return { title: `The ${BRAND.name} Journal` };
  const description = a.meta_description || a.dek || plainText(a.body_md, 155);
  return {
    title: a.meta_title || `${a.title} | ${BRAND.name}`,
    description,
    alternates: { canonical: `${SITE_URL}/journal/${a.slug}` },
    openGraph: {
      type: "article",
      title: a.title,
      description,
      url: `${SITE_URL}/journal/${a.slug}`,
      ...(a.cover_url ? { images: [{ url: a.cover_url }] } : {}),
    },
  };
}

/**
 * One article.
 *
 * The order is the whole point: the question is answered first, in full, and
 * only then are the pieces shown. An article that leads with the product is
 * an advertisement, and neither a reader nor a search engine treats it as
 * anything else. The pieces are rendered from live product data, so a price
 * or a sold-out size is never a stale sentence inside the prose.
 */
export default async function ArticlePage({ params }: Params) {
  const a = await fetchArticle(params.slug);
  if (!a) notFound();

  const published = a.published_at ?? a.updated_at;
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: a.meta_description || a.dek || plainText(a.body_md, 155),
    datePublished: published,
    dateModified: a.updated_at,
    ...(a.cover_url ? { image: [a.cover_url] } : {}),
    author: { "@type": "Person", name: FOUNDER.name, url: `${SITE_URL}/about` },
    publisher: { "@type": "Organization", name: BRAND.name, url: SITE_URL },
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE_URL}/journal/${a.slug}` },
    ...(a.products.length ? { mentions: a.products.map((p) => ({ "@type": "Product", name: p.name, url: productUrl(p) })) } : {}),
  };

  return (
    <div className="min-h-screen bg-porcelain pb-16">
      <script type="application/ld+json" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: jsonLdString(articleJsonLd) }} />
      <script type="application/ld+json" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: jsonLdString(trailJsonLd([
        { name: "Home", url: SITE_URL },
        { name: "Journal", url: `${SITE_URL}/journal` },
        { name: a.title, url: `${SITE_URL}/journal/${a.slug}` },
      ])) }} />

      <article className="px-5 lg:px-8 max-w-[44rem] mx-auto pt-10 lg:pt-16">
        <Link href="/journal" className="text-[11px] uppercase tracking-[0.2em] text-burgundy hover:underline underline-offset-4">
          {KIND_LABEL[a.kind] ?? "Journal"}
        </Link>
        <h1 className="mt-3 font-display text-[34px] lg:text-[46px] leading-[1.08] text-ink text-balance">{a.title}</h1>
        {a.dek && <p className="mt-4 text-[17px] lg:text-[19px] leading-relaxed text-muted">{a.dek}</p>}
        <p className="mt-5 text-[12px] uppercase tracking-[0.16em] text-muted/80">
          {FOUNDER.name}
          {published && <> · {new Date(published).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</>}
        </p>

        {a.cover_url && (
          <div className="relative w-full aspect-[16/10] rounded-card overflow-hidden bg-rose mt-8">
            <Image src={a.cover_url} alt="" fill sizes="(min-width: 1024px) 700px, 100vw" className="object-cover" priority />
          </div>
        )}

        <div className="mt-8 lg:mt-10">
          <Markdown source={a.body_md} />
        </div>
      </article>

      {/* The pieces, after the answer. The article earned this. */}
      {a.products.length > 0 && (
        <section className="px-5 lg:px-8 max-w-6xl mx-auto mt-16 lg:mt-20 border-t border-ink/10 pt-10">
          <p className="text-[11px] uppercase tracking-[0.2em] text-burgundy">Mentioned above</p>
          <h2 className="mt-2 font-display text-[28px] lg:text-[34px] leading-tight text-ink">
            {a.products.length === 1 ? "The piece in this story" : "The pieces in this story"}
          </h2>
          <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            {a.products.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}

      <div className="px-5 lg:px-8 max-w-[44rem] mx-auto mt-16">
        <Link href="/journal" className="text-[15px] text-ink hover:underline underline-offset-4">← More from the journal</Link>
      </div>

      <div className="mt-16"><LegalFooter /></div>
    </div>
  );
}
