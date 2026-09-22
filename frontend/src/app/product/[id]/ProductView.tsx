"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { ChevronLeft, Heart, ShoppingBag, Share2, Ruler, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useProduct, formatPrice, productImageUrl, type Product } from "@/lib/queries/catalog";
import { useAddToWishlist, useRemoveFromWishlist, useWishlist } from "@/lib/queries/wishlist";
import { VariantSelector } from "@/components/VariantSelector";
import { ProductDetailSkeleton } from "@/components/skeletons/Skeleton";
import { useCartStore } from "@/store/useCartStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/components/ui/ToastProvider";
import { trackEvent } from "@/lib/queries/analytics";
import { BROWSE_ONLY, whatsappOrderUrl } from "@/lib/launchMode";
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
import { swatchStyle } from "@/lib/colours";
import { recordEnquiry, takeOpenSource } from "@/lib/enquiry";
import { useActiveCoupons } from "@/lib/queries/coupons";
import { PieceWeave } from "@/components/PieceWeave";
import { WaysToWear } from "@/components/WaysToWear";
import { AVAILABILITY, FOUNDER, INCLUDED } from "@/lib/brand";
import { setExpressItem } from "@/lib/buyNow";

/**
 * The interactive product page. Rendered inside the server shell in
 * page.tsx, which has already fetched the product: `initial` seeds the query
 * so the first paint has the real page (and a crawler reads it), and the
 * client refetches straight away so stock and price are never older than
 * the visit.
 */
export default function ProductView({ params, initial }: { params: { id: string }; initial?: Product | null }) {
  const router = useRouter();
  const { showToast } = useToast();
  const { data: product, isLoading } = useProduct(params.id, initial ?? undefined);
  const { data: wishlist } = useWishlist();
  const addToWishlist = useAddToWishlist();
  const removeFromWishlist = useRemoveFromWishlist();
  const addItem = useCartStore((s) => s.addItem);
  const toggleCart = useCartStore((s) => s.toggleCart);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  // Whether she has actually chosen a size. The page shows the first variant
  // by default so a price and colour can render, and that default used to be
  // what went in the bag: tap "Add to bag" without touching a size and an XL
  // arrived. With Buy now that would be a paid order for a size nobody
  // picked, so a size is now a choice she makes, never one made for her.
  const [sizePicked, setSizePicked] = useState(false);
  const [sizeNudge, setSizeNudge] = useState(0);
  const [buying, setBuying] = useState(false);
  const sizeRef = useRef<HTMLDivElement>(null);
  const [imageIdx, setImageIdx] = useState(0);
  const galleryRef = useRef<HTMLDivElement>(null);
  function scrollGalleryTo(i: number) {
    const el = galleryRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setImageIdx(i);
  }
  function onGalleryScroll() {
    const el = galleryRef.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== imageIdx) setImageIdx(i);
  }
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const { data: coupons } = useActiveCoupons();

  // Track product view on mount
  useEffect(() => {
    trackEvent("product_viewed", { product_id: params.id, source: takeOpenSource() });
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
  // What is in the set, cleaned once and used in two places: the line under
  // the price and the garment panel.
  const setPieces = (product.garment_attributes?.set_pieces ?? []).filter((p) => p && p.trim());
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
    if (same ?? first) { setSelectedVariantId((same ?? first)!.id); setImageIdx(0); galleryRef.current?.scrollTo({ left: 0 }); }
    // Her size carried across the colour change; otherwise she chooses again.
    if (!same) setSizePicked(false);
  }
  const price = selectedVariant
    ? product.base_price + selectedVariant.price_delta
    : product.base_price;
  const isOutOfStock = !BROWSE_ONLY && (!selectedVariant || selectedVariant.stock === 0);
  // One size is not a choice. More than one is, and it has to be hers.
  const needsSize = variantsInColour.filter((v) => v.is_active).length > 1;
  const sizeReady = !needsSize || sizePicked;

  /** Bring the size row into view and make it ask, once, without a modal. */
  function askForSize() {
    sizeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setSizeNudge((n) => n + 1);
    try { navigator.vibrate?.([8, 40, 8]); } catch { /* unsupported */ }
  }

  function lineItem() {
    return {
      id: selectedVariant?.id ?? product!.id,
      name: product!.name,
      price: price / 100,
      quantity: 1,
      image: images[0],
      size: selectedVariant?.size ?? undefined,
      color: selectedVariant?.color ?? selectedColour ?? undefined,
      productId: product!.id,
    };
  }

  /**
   * Straight to paying for this one piece.
   *
   * The whole purchase happens while the wanting is still warm: one tap here,
   * and checkout opens on this piece alone with her details already filled
   * if she has bought before. The bag is left exactly as it was.
   */
  function handleBuyNow() {
    if (!product || isOutOfStock) return;
    if (!sizeReady) { askForSize(); return; }
    setBuying(true);
    try { navigator.vibrate?.(12); } catch { /* unsupported */ }
    // Counted in the same funnel step as the bag - it is the same intent,
    // and the board should not show buy-now shoppers as having dropped off.
    trackEvent("add_to_cart", { product_id: product.id, variant_id: selectedVariant?.id ?? null, price, via: "buy_now" });
    setExpressItem(lineItem());
    router.push("/checkout?express=1");
    // If she comes straight back, the button must not still say "Opening".
    setTimeout(() => setBuying(false), 4000);
  }
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
    if (!product) return;
    if (!selectedVariant && !BROWSE_ONLY) { showToast("Please select a size", "warning"); return; }
    if (!sizeReady) { askForSize(); return; }
    trackEvent("add_to_cart", { product_id: product.id, variant_id: selectedVariant?.id ?? null, price });
    addItem(lineItem());
    toggleCart();
    showToast("Added to your bag", "success");
  }

  return (
    <div className="w-full bg-background">
      <div className="w-full">
        {/* Image carousel */}
        <div className="relative">
          {/* 3:4 is right on a phone. In a 1152px column it is over 1500px
              tall, so the image gets a landscape ratio on large screens. */}
          {/* Every photograph in one horizontal strip that snaps, so a thumb
              swipes between them the way it does everywhere else on a phone.
              The dots and thumbnails below scroll the strip; the strip's own
              scroll updates them. Five photographs used to be one image and
              five 8px dots, and nobody found the other four. */}
          <div
            ref={galleryRef}
            onScroll={onGalleryScroll}
            className="flex w-full overflow-x-auto snap-x snap-mandatory no-scrollbar bg-rose"
            aria-label={`${product.name} photographs`}
          >
            {images.map((src, i) => (
              <div key={i} className="relative w-full shrink-0 snap-center aspect-[3/4] lg:aspect-[16/9]">
                <Image
                  src={src}
                  alt={`${product.name}${images.length > 1 ? ` — photo ${i + 1} of ${images.length}` : ""}`}
                  fill
                  priority={i === 0}
                  sizes="100vw"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
          <RepresentativeImage className="absolute bottom-3 left-4 text-[9px] px-2 py-0.5 z-10" />

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

          {/* Counter and dots over the strip */}
          {images.length > 1 && (
            <>
              <span className="absolute top-12 left-1/2 -translate-x-1/2 rounded-full bg-ink/60 text-white text-[11px] font-semibold px-2 py-0.5 tabular-nums pointer-events-none">
                {imageIdx + 1} / {images.length}
              </span>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5" role="tablist" aria-label="Choose photograph">
                {images.map((_, i) => (
                  <button
                    key={i}
                    role="tab"
                    aria-selected={i === imageIdx}
                    aria-label={`Photo ${i + 1}`}
                    onClick={() => scrollGalleryTo(i)}
                    className={`rounded-full transition-all ${i === imageIdx ? "w-4 h-2 bg-white" : "w-2 h-2 bg-white/50"}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
        {/* Thumbnails: the other photographs, visibly there. */}
        {images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar px-5 pt-3 lg:max-w-3xl lg:mx-auto lg:w-full">
            {images.map((src, i) => (
              <button
                key={i}
                type="button"
                onClick={() => scrollGalleryTo(i)}
                aria-label={`Show photo ${i + 1}`}
                className={`relative h-16 w-12 shrink-0 overflow-hidden rounded-[6px] border-2 bg-rose transition-colors ${i === imageIdx ? "border-burgundy" : "border-transparent opacity-75"}`}
              >
                <Image src={src} alt="" fill sizes="48px" className="object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Product info */}
        <div className="px-5 pt-5 pb-4 lg:max-w-3xl lg:mx-auto lg:w-full">
          {product.category && (
            <p className="text-burgundy text-[11px] uppercase tracking-[0.22em] font-semibold mb-2">
              {product.category.name}
            </p>
          )}
          <h1 className="font-display text-[34px] lg:text-[44px] text-ink leading-[1.02] mb-3 text-balance">
            {product.name}
          </h1>
          {/* Who the piece is named for. The tale in "Tales, Antiqued." -
              one line, in the serif italic, directly under her name so the
              name reads as a person rather than a SKU. */}
          {product.named_for?.trim() && (
            <p className="-mt-1 mb-3 font-display italic text-[17px] leading-snug text-muted text-balance">{product.named_for.trim()}</p>
          )}
          <div className="mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-ink text-[20px] font-medium tabular-nums">{formatPrice(price)}</p>
              {product.offer?.active && product.offer.compare_at_price ? (
                <>
                  <span className="text-muted text-base line-through">{formatPrice(product.offer.compare_at_price)}</span>
                  <OfferBadge offer={product.offer} />
                </>
              ) : null}
            </div>
            <OfferCountdown offer={product.offer} className="mt-1" />
            {/* What you are actually buying, next to what it costs.
                A co-ord set is two garments and the page never said so - the
                only place it appeared was the statutory "net quantity" row,
                which had been typed as "5" and read as five kurtas. Said
                here, in her words, it is also the honest argument for the
                price: two pieces, not one. */}
            {setPieces.length > 1 && (
              <p className="mt-2 text-[13px] text-ink">
                <span className="text-muted">{INCLUDED.label}:</span>{" "}
                {setPieces.join(" + ")}
                <span className="text-muted"> · {setPieces.length} pieces</span>
              </p>
            )}
            {/* The first live coupon, as a ticket under the price. It is the one
                thing on the page that is allowed to look like a sticker, and the
                code copies on tap so it is not something to memorise. */}
            {coupons?.[0] && <CouponTicket coupon={coupons[0]} compact className="mt-3 w-full max-w-[340px]" />}
          </div>
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
                  const any = BROWSE_ONLY || product.variants.some((v) => v.color === c && v.stock > 0);
                  const on = c === selectedColour;
                  return (
                    <button key={c} type="button" role="radio" aria-checked={on} onClick={() => selectColour(c)}
                      className={`h-10 pl-2.5 pr-3.5 rounded-full border text-xs font-semibold transition-all inline-flex items-center gap-2
                        ${on ? "border-ink bg-ink text-white" : any ? "border-line text-ink/80 hover:border-ink hover:text-ink" : "border-line text-ink/30 line-through"}`}>
                      <span className={`inline-block h-4 w-4 rounded-full border ${on ? "border-white/60" : "border-black/10"}`} style={swatchStyle(c)} aria-hidden />
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {/* Variant selector */}
          {variantsInColour.length > 1 && (
            <div ref={sizeRef} className="mb-4 scroll-mt-24">
              <div className="flex items-center justify-between mb-2">
                {/* Keyed on the nudge count so the rise replays each time she
                    tries to buy without a size - the page answers the tap
                    instead of ignoring it. */}
                <p key={sizeNudge} className={`text-sm font-semibold ${sizeNudge > 0 && !sizeReady ? "text-burgundy animate-fade-up" : "text-ink"}`}>
                  {sizeNudge > 0 && !sizeReady ? "Choose your size first" : "Select size"}
                </p>
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
                  className="flex items-center gap-1 text-xs text-ink font-medium underline underline-offset-4 decoration-burgundy/50"
                >
                  <Ruler className="w-3.5 h-3.5" />
                  Size guide
                </button>
              </div>
              <VariantSelector
                variants={variantsInColour}
                selected={sizeReady ? (selectedVariantId ?? selectedVariant?.id ?? null) : null}
                onSelect={(id) => { setSelectedVariantId(id); setSizePicked(true); }}
                groupBy="size"
                honourStock={!BROWSE_ONLY}
              />
            </div>
          )}

          {/* Availability, and only when there is something true to say.
              It used to print "In stock" on every healthy size, which is
              noise, and the founder's own note was that a number must never
              be confused with what is inside the pack. So: silence when the
              size is well stocked, the exact count when it is nearly gone,
              and the batch fact underneath - which is not a countdown
              clock, it is how the label actually works. */}
          {/* The fit cue a chart cannot give: a real person, her height and
              her size, to compare against. Sits under the sizes, where the
              decision is being made. */}
          {product.worn_by_founder ? (
            /* Not a model: the founder, at the customer's own height. The
               most honest fit guide a small label can offer, stated once
               and plainly. */
            <div className="-mt-2 mb-4">
              <p className="text-xs text-ink">
                Worn by {FOUNDER.name}, the founder &middot; {FOUNDER.heightCm} cm
                {product.model_size?.trim() && <> &middot; size <span className="font-medium">{product.model_size.trim()}</span></>}
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{FOUNDER.fitNote}</p>
            </div>
          ) : product.model_size?.trim() ? (
            <p className="-mt-2 mb-4 text-xs text-muted">
              {product.model_height?.trim()
                ? <>Model is {product.model_height.trim()} and wears <span className="text-ink font-medium">{product.model_size.trim()}</span></>
                : <>Model wears size <span className="text-ink font-medium">{product.model_size.trim()}</span></>}
            </p>
          ) : null}
          {/* Only for a size she has chosen: "Only 1 left in XL" about a
              size she never picked is noise, and reads as pressure. */}
          {selectedVariant && sizeReady && !BROWSE_ONLY && selectedVariant.stock <= AVAILABILITY.lowStockAt && (
            <div className="mb-4">
              <p className={`text-xs font-medium ${selectedVariant.stock === 0 ? "text-muted" : "text-rani"}`}>
                {selectedVariant.stock === 0
                  ? AVAILABILITY.soldOut
                  : `Only ${selectedVariant.stock} left in ${selectedVariant.size ?? "this size"}`}
              </p>
              {selectedVariant.stock > 0 && (
                <p className="mt-1 text-[11px] leading-relaxed text-muted">{AVAILABILITY.batch}</p>
              )}
            </div>
          )}

          {/* The description is the reasons to want it, so it comes straight
              after the choice of size and before any reassurance: desire,
              then confidence, then facts. */}
          {product.description && (
            <p className="mt-2 font-display text-[19px] lg:text-[21px] text-ink leading-[1.45]">{product.description}</p>
          )}
          {/* Desire, continued: how she would actually wear it. */}
          <WaysToWear notes={product.styling_notes} />
          {/* Reassurance after desire, before the facts. */}
          <ProductAssurances />


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
          <PieceWeave productId={product.id} colours={selectedColour ? [selectedColour, ...colours.filter((c) => c !== selectedColour)] : colours} />
          {product.fabric_specs && <FabricSpecs specs={product.fabric_specs} />}
          {product.garment_attributes && (
            <GarmentDetails
              attributes={product.garment_attributes}
              hasPockets={product.fabric_specs?.has_pockets}
              selectedColour={selectedColour}
            />
          )}

          {product.legal_metrology && (
            <ProductDeclarations declarations={product.legal_metrology} price={price} hasSizeChart={Boolean(product.size_chart?.rows?.length)} />
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
          // The bag works while checkout is closed; it ends in a WhatsApp
          // order instead of a payment page. A direct line for this one piece
          // sits under it for people who would rather just ask.
          <div>
            <button
              onClick={handleAddToCart}
              className="w-full bg-burgundy text-white py-4 rounded-full font-semibold flex items-center justify-center gap-2 hover:bg-burgundy-deep transition-all active:scale-[0.99]"
            >
              <ShoppingBag className="w-5 h-5" />
              Add to bag
            </button>
            {whatsappOrderUrl(`${product.name}${selectedVariant?.size ? `, size ${selectedVariant.size}` : ""}${selectedColour ? `, ${selectedColour}` : ""}`) && (
              <a
                href={whatsappOrderUrl(`${product.name}${selectedVariant?.size ? `, size ${selectedVariant.size}` : ""}${selectedColour ? `, ${selectedColour}` : ""}`) ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => recordEnquiry({ source: "product", product_id: product.id, variant_id: selectedVariant?.id ?? null, product_name: product.name, size: selectedVariant?.size ?? null, colour: selectedVariant?.color ?? selectedColour ?? null, quantity: 1, total_paise: price })}
                className="block text-center text-xs text-muted mt-2 underline underline-offset-4 decoration-line hover:text-ink"
              >
                or ask about this piece on WhatsApp
              </a>
            )}
          </div>
        ) : isOutOfStock ? (
          <button disabled className="w-full bg-burgundy text-white py-4 rounded-full font-semibold opacity-40 cursor-not-allowed">
            Sold out in this size
          </button>
        ) : (
          /* Buy now leads; the bag is the quieter second choice.
             One primary action per screen still holds - it is Buy now, and
             the bag is outlined beside it rather than competing in burgundy.
             The price is inside the button so the tap is a decision about a
             number she can see, not a step towards one she cannot. The bar
             stays one row tall: a taller sticky bar once hid the price on a
             Pixel 7. */
          <div className="flex gap-2.5">
            <button
              onClick={handleAddToCart}
              aria-label="Add to bag"
              className="shrink-0 h-14 w-14 sm:w-auto sm:px-5 rounded-full border border-ink/20 text-ink flex items-center justify-center gap-2 font-semibold text-sm hover:border-ink/50 transition-colors active:scale-[0.97]"
            >
              <ShoppingBag className="w-5 h-5" />
              <span className="hidden sm:inline">Add to bag</span>
            </button>
            <button
              onClick={handleBuyNow}
              disabled={buying}
              className="flex-1 h-14 bg-burgundy text-white rounded-full font-semibold flex items-center justify-center gap-2 hover:bg-burgundy-deep transition-all active:scale-[0.98] disabled:opacity-80"
            >
              {buying ? "Opening checkout…" : <>Buy now · {formatPrice(price)} <ArrowRight className="w-4 h-4" /></>}
            </button>
          </div>
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
