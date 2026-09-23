"use client";

import { navigate } from "@/lib/viewTransition";
import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { Product, formatPrice, productImageUrl, productImageFocus } from "@/lib/queries/catalog";
import { useAddToWishlist, useRemoveFromWishlist, useWishlist } from "@/lib/queries/wishlist";
import { useAuthStore } from "@/store/useAuthStore";
import { BROWSE_ONLY } from "@/lib/launchMode";
import { RepresentativeImage } from "@/components/RepresentativeImage";
import { OfferBadge } from "@/components/OfferBadge";
import { useImpression } from "@/lib/useImpression";
import { swatchStyle } from "@/lib/colours";
import { Photo } from "@/components/Photo";
import { markOpenSource } from "@/lib/enquiry";

interface Props {
  product: Product;
  className?: string;
  /** Off when every piece on the page is new - then the badge distinguishes nothing. */
  markNew?: boolean;
}

export function ProductCard({ product, className = "", markNew = true }: Props) {
  const router = useRouter();
  // Counts this card as shown once it has been half-visible for a
  // moment, giving the view count a denominator.
  const impressionRef = useImpression(product.id, "card");
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const { data: wishlist } = useWishlist();
  const addToWishlist = useAddToWishlist();
  const removeFromWishlist = useRemoveFromWishlist();

  const firstVariant = product.variants[0];
  const inWishlist = wishlist?.items.some((i) => i.variant?.product?.id === product.id);
  // Stock only speaks once the shop can sell. In browse mode the counts are
  // still being entered, and "Sold out" across a catalogue that has never
  // sold anything is the worst possible first impression.
  const isOutOfStock = !BROWSE_ONLY && product.variants.every((v) => v.stock === 0);
  const colours = Array.from(new Set(product.variants.filter((v) => v.is_active && v.color).map((v) => v.color as string)));
  const imageUrl = productImageUrl(product);
  const price = firstVariant
    ? product.base_price + firstVariant.price_delta
    : product.base_price;

  function handleWishlistToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!isAuthenticated) { router.push("/login"); return; }
    if (!firstVariant) return;
    if (inWishlist) {
      removeFromWishlist.mutate(firstVariant.id);
    } else {
      addToWishlist.mutate(firstVariant.id);
    }
  }

  return (
    <div
      ref={impressionRef as React.RefObject<HTMLDivElement>}
      className={`flex flex-col cursor-pointer group ${className}`}
      onClick={(e) => { markOpenSource("card"); navigate(router, `/product/${product.id}`, { from: (e.currentTarget as HTMLElement).querySelector<HTMLElement>("[data-vt-photo]") }); }}
      onPointerEnter={() => router.prefetch(`/product/${product.id}`)}
      onTouchStart={() => router.prefetch(`/product/${product.id}`)}
    >
      <Photo
        src={imageUrl}
        alt={product.name}
        sizes="(max-width: 768px) 50vw, 33vw"
        focus={productImageFocus(product)}
        hover
      >
        <RepresentativeImage className="absolute bottom-1.5 left-1.5 text-[8px] px-1.5 py-[2px] z-10" />
        <OfferBadge offer={product.offer} className="absolute top-2.5 left-2.5 z-10 shadow-sm" />
        {/* "New" for two weeks after listing, only when there is no offer badge
            in that corner — two pills stacked in one corner read as clutter. */}
        {markNew && !product.offer?.active && Date.now() - new Date(product.created_at).getTime() < 14 * 86400000 && (
          <span className="absolute top-2.5 left-2.5 z-10 rounded-sm bg-white/92 text-ink text-[10px] font-semibold px-1.5 py-0.5 tracking-[0.14em]">NEW</span>
        )}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-ink/40 flex items-center justify-center">
            <span className="text-white text-xs font-semibold bg-ink/70 px-3 py-1 rounded-full">
              Sold out
            </span>
          </div>
        )}
      </Photo>
      <p className="text-ink text-[13px] mt-3 leading-snug line-clamp-2">{product.name}</p>
      {/* The colours it comes in, as dots. Says "there is a choice" without
          a word, which is what makes a thumb stop on a card. */}
      {colours.length > 1 && (
        <span className="mt-1 flex items-center gap-1" aria-label={`Available in ${colours.join(", ")}`}>
          {colours.slice(0, 6).map((c) => (
            <span key={c} className="inline-block h-2.5 w-2.5 rounded-full border border-black/10" style={swatchStyle(c)} />
          ))}
          {colours.length > 6 && <span className="text-[10px] text-muted">+{colours.length - 6}</span>}
        </span>
      )}
      {(() => {
        // Scarcity only when it is true and small. "Only 2 left" on a piece
        // with 2 left is information; on every card it is a dark pattern.
        const left = product.variants.filter((v) => v.is_active).reduce((s, v) => s + v.stock, 0);
        return !BROWSE_ONLY && left > 0 && left <= 3
          ? <p className="text-[11px] text-rani font-semibold mt-1">Only {left} left</p>
          : null;
      })()}
      <p className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-ink text-[13px] font-medium tabular-nums">{formatPrice(price)}</span>
        {product.offer?.active && product.offer.compare_at_price ? (
          <span className="text-muted text-xs line-through">{formatPrice(product.offer.compare_at_price)}</span>
        ) : null}
      </p>
    </div>
  );
}
