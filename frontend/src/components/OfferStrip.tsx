"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ChevronRight, Tag } from "lucide-react";
import { api } from "@/lib/api";
import { OfferBadge, OfferCountdown } from "@/components/OfferBadge";
import { type Product, formatPrice, productImageUrl } from "@/lib/queries/catalog";

/**
 * The offer shelf: every product currently marked down, in one row.
 *
 * It exists only while at least one offer is active. An "Offers" heading over
 * an empty row would be the site admitting it has none; when there are none
 * the section is simply not there, and the page reads as a catalogue that
 * happens to be at full price.
 *
 * Countdown shown per card when the offer has an end. The urgency is real —
 * the API stops marking the offer active at that moment — so the timer is
 * information, not theatre.
 */
export function OfferStrip() {
  const router = useRouter();
  const { data } = useQuery<{ items: Product[] }>({
    queryKey: ["catalog", "offers"],
    queryFn: async () => (await api.get("/catalog/products", { params: { limit: 50, sort_by: "shelf" } })).data,
    staleTime: 60_000,
  });
  const offers = (data?.items ?? []).filter((p) => p.offer?.active);
  if (offers.length === 0) return null;

  return (
    <section className="mt-7" aria-labelledby="offers-heading">
      <div className="px-5 lg:px-8 flex items-center justify-between mb-3">
        <h3 id="offers-heading" className="font-serif text-xl font-bold text-foreground inline-flex items-center gap-2">
          <Tag className="w-4 h-4 text-[#B4232C]" aria-hidden="true" />
          On offer
        </h3>
        <button onClick={() => router.push("/shop?offers=1")} className="text-primary text-sm font-medium flex items-center gap-0.5 hover:underline">
          See all <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto no-scrollbar px-5 lg:px-8 pb-2 snap-x snap-mandatory">
        {offers.map((p) => {
          const price = p.variants[0] ? p.base_price + p.variants[0].price_delta : p.base_price;
          return (
            <button
              key={p.id}
              onClick={() => router.push(`/product/${p.id}`)}
              className="snap-start shrink-0 w-[150px] sm:w-[180px] text-left group"
              aria-label={`${p.name}, ${p.offer.discount_pct} percent off`}
            >
              <div className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden bg-gray-100">
                <Image src={productImageUrl(p)} alt={p.name} fill sizes="180px" className="object-cover group-hover:scale-105 transition-transform duration-300" />
                <OfferBadge offer={p.offer} className="absolute top-2 left-2 shadow-sm" />
              </div>
              <p className="text-foreground font-semibold text-sm mt-2 leading-tight line-clamp-1">{p.name}</p>
              <p className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-primary font-bold text-sm">{formatPrice(price)}</span>
                {p.offer.compare_at_price && <span className="text-muted text-xs line-through">{formatPrice(p.offer.compare_at_price)}</span>}
              </p>
              <OfferCountdown offer={p.offer} className="mt-0.5 text-[11px]" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
