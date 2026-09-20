"use client";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { OfferBadge, OfferCountdown } from "@/components/OfferBadge";
import { CouponTicket } from "@/components/CouponTicket";
import { Reveal } from "@/components/Reveal";
import { useActiveCoupons } from "@/lib/queries/coupons";
import { type Product, formatPrice, productImageUrl } from "@/lib/queries/catalog";

/**
 * Deals: coupons first, then every piece currently marked down, in one band.
 *
 * It exists only while there is something in it. A "Deals" heading over an
 * empty row is the site admitting it has none; when there are none the band is
 * simply not there, and the page reads as a catalogue that happens to be at
 * full price.
 *
 * Two kinds of urgency, both real. A coupon's countdown ends when the API
 * stops listing it; an offer's ends when the API stops marking it active.
 * Neither is a timer that resets when the page is reloaded.
 */
export function DealsRail() {
  const router = useRouter();
  const { data: coupons } = useActiveCoupons();
  const { data } = useQuery<{ items: Product[] }>({
    queryKey: ["catalog", "offers"],
    queryFn: async () => (await api.get("/catalog/products", { params: { limit: 50, sort_by: "shelf" } })).data,
    staleTime: 60_000,
  });
  const offers = (data?.items ?? []).filter((p) => p.offer?.active);
  const tickets = coupons ?? [];
  if (offers.length === 0 && tickets.length === 0) return null;

  return (
    <Reveal>
      <section className="mt-16 lg:mt-24" aria-labelledby="deals-heading">
        <div className="px-5 lg:px-8 flex items-end justify-between mb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-burgundy">Limited</p>
            <h3 id="deals-heading" className="font-display text-[34px] lg:text-[44px] leading-none text-ink mt-1">
              Going, <em className="italic">going.</em>
            </h3>
          </div>
          {offers.length > 0 && (
            <button onClick={() => router.push("/shop?offers=1")} className="text-ink text-sm font-medium inline-flex items-center gap-0.5 hover:underline underline-offset-4">
              All offers <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {tickets.length > 0 && (
          <div className="flex gap-3 overflow-x-auto no-scrollbar px-5 lg:px-8 pb-3 snap-x">
            {tickets.map((c) => (
              <CouponTicket key={c.code} coupon={c} className="snap-start shrink-0 w-[300px]" />
            ))}
          </div>
        )}

        {offers.length > 0 && (
          <div className="flex gap-3 overflow-x-auto no-scrollbar px-5 lg:px-8 pb-2 pt-1 snap-x snap-mandatory">
            {offers.map((p) => {
              const price = p.variants[0] ? p.base_price + p.variants[0].price_delta : p.base_price;
              return (
                <button
                  key={p.id}
                  onClick={() => router.push(`/product/${p.id}`)}
                  className="snap-start shrink-0 w-[156px] sm:w-[190px] text-left group"
                  aria-label={`${p.name}, ${p.offer.discount_pct} percent off`}
                >
                  <div className="relative w-full aspect-[3/4] rounded-card overflow-hidden bg-rose">
                    <Image src={productImageUrl(p)} alt={p.name} fill sizes="190px" className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]" />
                    <OfferBadge offer={p.offer} className="absolute top-2.5 left-2.5 shadow-sm" />
                  </div>
                  <p className="text-ink font-medium text-[13px] mt-2 leading-tight line-clamp-1">{p.name}</p>
                  <p className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-ink font-semibold text-sm">{formatPrice(price)}</span>
                    {p.offer.compare_at_price && <span className="text-muted text-xs line-through">{formatPrice(p.offer.compare_at_price)}</span>}
                  </p>
                  <OfferCountdown offer={p.offer} className="mt-0.5 text-[11px]" />
                </button>
              );
            })}
          </div>
        )}
      </section>
    </Reveal>
  );
}
