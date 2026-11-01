"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProductCard } from "@/components/ProductCard";
import { Wordmark } from "@/components/Wordmark";
import type { CollectionPage } from "@/lib/server/catalog";

/**
 * One piece below the other, full width, with the sizes she can buy under
 * the price - the same feed as the home page's drop, because the visitor
 * arrives from the same reel with the same thumb. Cards carry no buttons:
 * the whole card opens the piece (DESIGN.md).
 */
export default function CollectionView({ collection }: { collection: CollectionPage }) {
  const n = collection.products.length;
  return (
    <div className="bg-porcelain text-ink min-h-screen">
      <header className="px-5 lg:px-12 pt-5 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-1.5 min-h-[44px] text-sm text-ink/80" aria-label="ZISUN home">
          <ArrowLeft className="w-4 h-4" aria-hidden /> <Wordmark className="h-5" />
        </Link>
        <Link href="/shop" data-track="collection_all" className="inline-flex items-center min-h-[44px] text-sm underline underline-offset-4 decoration-burgundy/50">All pieces</Link>
      </header>
      <section className="px-5 lg:px-12 pt-8 pb-6">
        <p className="text-[11px] tracking-[0.22em] uppercase text-burgundy mb-3">{n === 1 ? "One piece" : `${n} pieces`}</p>
        <h1 className="font-display text-[40px] sm:text-[52px] leading-[1.02]">{collection.name}</h1>
        {collection.description && <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-muted">{collection.description}</p>}
      </section>
      {n > 0 ? (
        <ul className="px-5 lg:px-12 pb-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10" aria-label={collection.name}>
          {collection.products.map((p) => (
            <li key={p.id}>
              <ProductCard product={p} markNew={false} showSizes sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 lg:px-12 pb-16 text-sm text-muted">These pieces have sold out. <Link href="/shop" className="underline">See everything else</Link>.</p>
      )}
    </div>
  );
}
