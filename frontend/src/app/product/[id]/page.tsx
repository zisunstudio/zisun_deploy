"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { ChevronLeft, Heart, ShoppingBag, Share2, Ruler } from "lucide-react";
import { useRouter } from "next/navigation";
import { useProduct, formatPrice, productImageUrl } from "@/lib/queries/catalog";
import { useAddToWishlist, useRemoveFromWishlist, useWishlist } from "@/lib/queries/wishlist";
import { VariantSelector } from "@/components/VariantSelector";
import { ProductDetailSkeleton } from "@/components/skeletons/Skeleton";
import { useCartStore } from "@/store/useCartStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/components/ui/ToastProvider";
import { trackEvent } from "@/lib/queries/analytics";
import { BROWSE_ONLY } from "@/lib/launchMode";
import { FIREBASE_ENABLED } from "@/lib/firebase";
import { RepresentativeImage } from "@/components/RepresentativeImage";
import { ProductAssurances } from "@/components/ProductAssurances";
import { BrowseOnlyCTA } from "@/components/BrowseOnlyCTA";
import { SizeGuideModal } from "@/components/SizeGuideModal";
import { ProductDeclarations } from "@/components/ProductDeclarations";
import { FabricSpecs } from "@/components/FabricSpecs";
import { GarmentDetails } from "@/components/GarmentDetails";
import { OfferBadge, OfferCountdown } from "@/components/OfferBadge";
import { CouponTicket } from "@/components/CouponTicket";
import { useActiveCoupons } from "@/lib/queries/coupons";

export default function ProductDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { showToast } = useToast();
  const { data: product, isLoading } = useProduct(params.id);
  const { data: wishlist } = useWishlist();
  const addToWishlist = useAddToWishlist();
  const removeFromWishlist = useRemoveFromWishlist();
  const addItem = useCartStore((s) => s.addItem);
  const toggleCart = useCartStore((s) => s.toggleCart);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [imageIdx, setImageIdx] = useState(0);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const { data: coupons } = useActiveCoupons();

  // Track product view on mount
  useEffect(() => {
    trackEvent("product_viewed", { product_id: params.id });
  }, [params.id]);

  if (isLoading) return <ProductDetailSkeleton />;
  if (!product) return (
    <div className="flex items-center justify-center h-full">
      <p className="text-muted text-sm">Product not found.</p>
    </div>
  );


  const selectedVariant = product.variants.find((v) => v.id === selectedVariantId) ?? product.variants[0] ?? null;

  // Colours are a first-class choice, sizes are a choice within a colour.
  // The variants table is flat (one row per size x colour), so the colour
  // list is the distinct colours, and the size list is the sizes that exist
  // in the chosen colour — otherwise a size that only comes in Indigo would
  // be offered under Red and fail at the bag.
  const colours = Array.from(new Set(product.variants.filter((v) => v.is_active && v.color).map((v) => v.color as string)));
  const selectedColour = selectedVariant?.color ?? colours[0] ?? null;
  const variantsInColour = selectedColour
    ? product.variants.filter((v) => v.color === selectedColour)
    : product.variants;
  const variantIdsInColour = new Set(variantsInColour.map((v) => v.id));

  // Photographs tagged with a colour show for that colour; untagged ones show
  // for every colour. If nothing is tagged, all photographs show — tagging is
  // optional and an untagged catalogue must look exactly as it did before.
  const colourMedia = product.media.filter((m) => !m.variant_id || variantIdsInColour.has(m.variant_id));
  const gallery = colourMedia.length > 0 ? colourMedia : product.media;
  const images = gallery.length > 0
    ? gallery.map((m) => m.cdn_url ?? m.url)
    : [productImageUrl(product)];

  function selectColour(colour: string) {
    // Prefer the same size in the new colour; fall back to the first in stock.
    const same = product!.variants.find((v) => v.color === colour && v.size === selectedVariant?.size && v.stock > 0);
    const first = product!.variants.find((v) => v.color === colour && v.stock > 0)
      ?? product!.variants.find((v) => v.color === colour);
    if (same ?? first) { setSelectedVariantId((same ?? first)!.id); setImageIdx(0); }
  }
  const price = selectedVariant
    ? product.base_price + selectedVariant.price_delta
    : product.base_price;
  const isOutOfStock = !selectedVariant || selectedVariant.stock === 0;
  const inWishlist = wishlist?.items.some((i) => i.variant?.product?.id === product.id);

  function handleWishlistToggle() {
    if (!isAuthenticated) { router.push("/login"); return; }
    if (!selectedVariant) return;
    if (inWishlist) {
      removeFromWishlist.mutate(selectedVariant.id);
    } else {
      addToWishlist.mutate(selectedVariant.id, {
        onSuccess: () => showToast("Added to wishlist", "success"),
      });
    }
  }

  async function handleShare() {
    const url = window.location.href;
    const title = product?.name ?? "ZISUN";
    // navigator.share is the good path on a phone, which is where sharing a
    // product actually happens. It rejects when the user dismisses the sheet,
    // and that is not an error worth a toast.
    if (navigator.share) {
      try {
        await navigator.share({ title, text: `${title} — ZISUN`, url });
        return;
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied", "success");
    } catch {
      showToast("Could not copy the link", "error");
    }
  }

  function handleAddToCart() {
    if (!product || !selectedVariant) { showToast("Please select a size/variant", "warning"); return; }
    trackEvent("add_to_cart", { product_id: product.id, variant_id: selectedVariant.id, price });
    addItem({
      id: selectedVariant.id,
      name: product.name,
      price: price / 100,
      quantity: 1,
      image: images[0],
      size: selectedVariant.size ?? undefined,
    });
    toggleCart();
    showToast("Added to cart", "success");
  }

  return (
    <div className="w-full bg-background">
      <div className="w-full">
        {/* Image carousel */}
        <div className="relative">
          {/* 3:4 is right on a phone. In a 1152px column it is over 1500px
              tall, so the image gets a landscape ratio on large screens. */}
          <div className="relative w-full aspect-[3/4] lg:aspect-[16/9] bg-rose">
            <Image
              src={images[imageIdx]}
              alt={product.name}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          </div>

          <RepresentativeImage className="absolute bottom-3 left-4 text-[10px] px-2.5 py-1 z-10" />

          {/* Top controls */}
          <div className="absolute top-12 left-0 right-0 flex justify-between px-5">
            <button
              onClick={() => router.back()}
              aria-label="Go back"
              className="w-11 h-11 flex items-center justify-center rounded-full bg-white/90 backdrop-blur-sm shadow"
            >
              <ChevronLeft className="w-4 h-4 text-foreground" />
            </button>
            <div className="flex gap-2">
              {/* Gated on sign-in working, not on browse mode. It used to be
                  the latter, back when there was no login and the heart could
                  only bounce a visitor to a dead end. Firebase changed that:
                  saving a piece needs an account, not an open checkout. */}
              {FIREBASE_ENABLED && (
                <button
                  onClick={handleWishlistToggle}
                  aria-label={inWishlist ? "Remove from wishlist" : "Add to wishlist"}
                  className="w-11 h-11 flex items-center justify-center rounded-full bg-white/90 backdrop-blur-sm shadow"
                >
                  <Heart className={`w-4 h-4 ${inWishlist ? "fill-rani text-rani" : "text-ink"}`} />
                </button>
              )}
              <button
                onClick={handleShare}
                aria-label="Share this product"
                className="w-11 h-11 flex items-center justify-center rounded-full bg-white/90 backdrop-blur-sm shadow"
              >
                <Share2 className="w-4 h-4 text-foreground" />
              </button>
            </div>
          </div>

          {/* Image dots */}
          {images.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setImageIdx(i)}
                  className={`rounded-full transition-all ${i === imageIdx ? "w-4 h-2 bg-white" : "w-2 h-2 bg-white/50"}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Product info */}
        <div className="px-5 pt-5 pb-4 lg:max-w-3xl lg:mx-auto lg:w-full">
          {product.category && (
            <p className="text-rani text-[11px] uppercase tracking-[0.22em] font-semibold mb-1.5">
              {product.category.name}
            </p>
          )}
          <h1 className="font-display text-[30px] lg:text-4xl text-ink leading-[1.05] mb-3 text-balance">
            {product.name}
          </h1>
          <div className="mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-ink text-[22px] font-semibold tabular-nums">{formatPrice(price)}</p>
              {product.offer?.active && product.offer.compare_at_price ? (
                <>
                  <span className="text-muted text-base line-through">{formatPrice(product.offer.compare_at_price)}</span>
                  <OfferBadge offer={product.offer} />
                </>
              ) : null}
            </div>
            <OfferCountdown offer={product.offer} className="mt-1" />
            {/* The first live coupon, as a ticket under the price. It is the one
                thing on the page that is allowed to look like a sticker, and the
                code copies on tap so it is not something to memorise. */}
            {coupons?.[0] && <CouponTicket coupon={coupons[0]} compact className="mt-3 w-full max-w-[340px]" />}
          </div>
          {/* In the page, not in the sticky bar. Three rows of assurances
              inside a bottom-pinned bar made it 200px tall — on a phone that
              covered the price at first paint. Here they read as part of the
              decision, and the bar shrinks to the one thing that must stay
              reachable: the buy action. */}
          <ProductAssurances />
          {/* Colour, when there is more than one. Each swatch is the colour's
              name in a chip — a coloured dot would need a hex code nobody has
              entered, and "Indigo" is what the customer would say anyway. */}
          {colours.length > 1 && (
            <div className="mb-4">
              <p className="text-foreground text-sm font-semibold mb-2">
                Colour <span className="text-muted font-normal">· {selectedColour}</span>
              </p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
                {colours.map((c) => {
                  const any = product.variants.some((v) => v.color === c && v.stock > 0);
                  const on = c === selectedColour;
                  return (
                    <button key={c} type="button" role="radio" aria-checked={on} onClick={() => selectColour(c)}
                      className={`h-10 px-3.5 rounded-full border text-xs font-semibold transition-all
                        ${on ? "border-ink bg-ink text-white" : any ? "border-line text-ink/80 hover:border-ink hover:text-ink" : "border-line text-ink/30 line-through"}`}>
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {/* Variant selector */}
          {variantsInColour.length > 1 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-ink text-sm font-semibold">Select size</p>
                <button
                  onClick={() => {
                    // Which pieces send people to the chart, and which size they
                    // had selected, is early warning that a cut runs small -
                    // before it turns into exchange requests.
                    trackEvent("size_guide_opened", {
                      product_id: product.id,
                      category: product.category?.name ?? null,
                      selected_size: selectedVariant?.size ?? null,
                    });
                    setSizeGuideOpen(true);
                  }}
                  className="flex items-center gap-1 text-xs text-ink font-medium underline underline-offset-4 decoration-rani/60"
                >
                  <Ruler className="w-3.5 h-3.5" />
                  Size guide
                </button>
              </div>
              <VariantSelector
                variants={variantsInColour}
                selected={selectedVariantId ?? selectedVariant?.id ?? null}
                onSelect={setSelectedVariantId}
                groupBy="size"
              />
            </div>
          )}

          {/* Stock status */}
          {selectedVariant && (
            <p className={`text-xs font-medium mb-4 ${selectedVariant.stock > 5 ? "text-moss" : selectedVariant.stock > 0 ? "text-rani" : "text-muted"}`}>
              {selectedVariant.stock === 0 ? "Sold out in this size" : selectedVariant.stock <= 5 ? `Only ${selectedVariant.stock} left in this size` : "In stock"}
            </p>
          )}

          {/* Description */}
          {product.description && (
            <p className="font-display text-[16px] text-ink/80 leading-relaxed">{product.description}</p>
          )}

          {/* Colour variance has to be disclosed before the sale, not argued
              after it: it is the first thing the exchange policy rules out as a
              reason, so the buyer has to have seen it while deciding. */}
          <p className="text-muted text-xs leading-relaxed mt-3">
            Colour will vary slightly from the photographs — lighting, your screen and
            the dye lot all shift it. Small irregularities in handwoven cotton are part
            of the cloth. Neither is a defect, and neither is grounds for an exchange.
          </p>

          {/* Above the statutory declarations, and open rather than behind a
              toggle: this is the argument for buying, and the block below is a
              legal obligation. */}
          {product.fabric_specs && <FabricSpecs specs={product.fabric_specs} />}
          {product.garment_attributes && (
            <GarmentDetails attributes={product.garment_attributes} />
          )}

          {product.legal_metrology && (
            <ProductDeclarations declarations={product.legal_metrology} price={price} />
          )}
        </div>
      </div>

      {/* CTA — price, size and stock above stay visible either way; only the
          buy action changes while the store is in preview. */}
      {/* Sticky rather than a flex sibling: the page scrolls with the document
          now, and the buy action should not scroll away from a shopper reading
          the declarations. */}
      <div className="sticky bottom-0 z-30 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-line bg-background/90 backdrop-blur-md lg:max-w-3xl lg:mx-auto lg:w-full">
        {BROWSE_ONLY ? (
          <BrowseOnlyCTA productName={product.name} />
        ) : (
          <button
            onClick={handleAddToCart}
            disabled={isOutOfStock}
            className="w-full bg-ink text-white py-4 rounded-full font-semibold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-ink/90 transition-all shadow-lift active:scale-[0.99]"
          >
            <ShoppingBag className="w-5 h-5" />
            {isOutOfStock ? "Sold out" : "Add to bag"}
          </button>
        )}
      </div>

      <SizeGuideModal
        isOpen={sizeGuideOpen}
        onClose={() => setSizeGuideOpen(false)}
        categoryName={product.category?.name}
        selectedSize={selectedVariant?.size ?? null}
        chart={product.size_chart}
      />
    </div>
  );
}
