import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { SITE_URL } from "@/lib/legal";
import { KIND_LABEL, type ArticleCard } from "@/lib/journal";
import { fetchArticles, REVALIDATE_SECONDS } from "@/lib/server/catalog";
import { jsonLdString, trailJsonLd } from "@/lib/structuredData";
import { LegalFooter } from "@/components/LegalFooter";

export const revalidate = REVALIDATE_SECONDS;

export const metadata: Metadata = {
  title: `The ${BRAND.name} Journal | Cloth, fit and how to wear it`,
  description:
    "What we know about cloth, fit, care and dressing for the day - written by Sushmita, who makes and wears every piece. Practical answers, not marketing.",
  alternates: { canonical: `${SITE_URL}/journal` },
};

/**
 * The Journal index.
 *
 * This is the front door for a stranger: someone who searched "how to wash
 * dabu cotton" has never heard of ZISUN, and the article is what earns the
 * right to show her a piece. The page is deliberately editorial - no prices,
 * no cards with buttons - because it is not a shop window.
 */
export default async function JournalIndex() {
  const articles = (await fetchArticles()) ?? [];
  const [lead, ...rest] = articles;

  return (
    <div className="min-h-screen bg-porcelain pb-16">
      <script type="application/ld+json" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: jsonLdString(trailJsonLd([
        { name: "Home", url: SITE_URL },
        { name: "Journal", url: `${SITE_URL}/journal` },
      ])) }} />

      <header className="px-5 lg:px-8 pt-10 lg:pt-16 max-w-6xl mx-auto">
        <p className="text-[11px] uppercase tracking-[0.24em] text-burgundy">The journal</p>
        <h1 className="mt-2 font-display text-[38px] lg:text-[54px] leading-[1.05] text-ink max-w-2xl text-balance">
          What we know about the cloth.
        </h1>
        <p className="mt-4 text-[15px] lg:text-[17px] leading-relaxed text-muted max-w-xl">
          Fit, fabric, care and what to wear when &mdash; written by Sushmita, who chooses every piece and wears it herself.
        </p>
      </header>

      {articles.length === 0 ? (
        <p className="px-5 lg:px-8 max-w-6xl mx-auto mt-12 text-muted text-[15px]">
          The first pieces are being written. In the meantime, the{" "}
          <Link href="/shop" className="text-burgundy underline underline-offset-4">collection</Link> is here.
        </p>
      ) : (
        <div className="px-5 lg:px-8 max-w-6xl mx-auto mt-10 lg:mt-14">
          <Lead article={lead} />
          {rest.length > 0 && (
            <div className="mt-12 lg:mt-16 border-t border-ink/10 pt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-12">
              {rest.map((a) => <Card key={a.id} article={a} />)}
            </div>
          )}
        </div>
      )}

      <div className="mt-16"><LegalFooter /></div>
    </div>
  );
}

function Lead({ article: a }: { article: ArticleCard }) {
  return (
    <Link href={`/journal/${a.slug}`} className="group block">
      {a.cover_url && (
        <div className="relative w-full aspect-[16/10] lg:aspect-[21/9] rounded-card overflow-hidden bg-rose">
          <Image src={a.cover_url} alt="" fill sizes="(min-width: 1024px) 1100px, 100vw" className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]" priority />
        </div>
      )}
      <p className="mt-5 text-[11px] uppercase tracking-[0.2em] text-burgundy">{KIND_LABEL[a.kind] ?? "Journal"}</p>
      <h2 className="mt-2 font-display text-[30px] lg:text-[42px] leading-tight text-ink max-w-3xl text-balance group-hover:underline underline-offset-[6px] decoration-1 decoration-ink/25">
        {a.title}
      </h2>
      {a.dek && <p className="mt-3 text-[15px] lg:text-[17px] leading-relaxed text-muted max-w-2xl">{a.dek}</p>}
    </Link>
  );
}

function Card({ article: a }: { article: ArticleCard }) {
  return (
    <Link href={`/journal/${a.slug}`} className="group block">
      {a.cover_url && (
        <div className="relative w-full aspect-[4/3] rounded-card overflow-hidden bg-rose mb-4">
          <Image src={a.cover_url} alt="" fill sizes="(min-width: 1024px) 33vw, 50vw" className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]" />
        </div>
      )}
      <p className="text-[10px] uppercase tracking-[0.2em] text-burgundy">{KIND_LABEL[a.kind] ?? "Journal"}</p>
      <h3 className="mt-1.5 font-display text-[22px] leading-snug text-ink group-hover:underline underline-offset-4 decoration-1 decoration-ink/25">{a.title}</h3>
      {a.dek && <p className="mt-1.5 text-[14px] leading-relaxed text-muted line-clamp-3">{a.dek}</p>}
    </Link>
  );
}
