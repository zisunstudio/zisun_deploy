"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { ChevronLeft, Heart, ShoppingBag, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useProduct, formatPrice, productImageUrl } from "@/lib/queries/catalog";
import { useAddToWishlist, useRemoveFromWishlist, useWishlist } from "@/lib/queries/wishlist";
import { VariantSelector } from "@/components/VariantSelector";
import { ProductDetailSkeleton } from "@/components/skeletons/Skeleton";
import { useCartStore } from "@/store/useCartStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/components/ui/ToastProvider";
import { trackEvent } from "@/lib/queries/analytics";

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

  const images = product.media.length > 0
    ? product.media.map((m) => m.cdn_url ?? m.url)
    : [productImageUrl(product)];

  const selectedVariant = product.variants.find((v) => v.id === selectedVariantId) ?? product.variants[0] ?? null;
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
    <div className="h-full w-full flex flex-col bg-background">
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {/* Image carousel */}
        <div className="relative">
          <div className="relative w-full aspect-[3/4] bg-gray-100">
            <Image
              src={images[imageIdx]}
              alt={product.name}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          </div>

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
              <button
                onClick={handleWishlistToggle}
                aria-label={inWishlist ? "Remove from wishlist" : "Add to wishlist"}
                className="w-11 h-11 flex items-center justify-center rounded-full bg-white/90 backdrop-blur-sm shadow"
              >
                <Heart className={`w-4 h-4 ${inWishlist ? "fill-red-500 text-red-500" : "text-foreground"}`} />
              </button>
              <button
                aria-label="Share"
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
        <div className="px-5 pt-5 pb-4">
          {product.category && (
            <p className="text-muted text-xs uppercase tracking-widest font-medium mb-1">
              {product.category.name}
            </p>
          )}
          <h1 className="font-serif text-2xl font-bold text-foreground leading-tight mb-2">
            {product.name}
          </h1>
          <p className="text-primary text-xl font-bold mb-4">{formatPrice(price)}</p>

          {/* Variant selector */}
          {product.variants.length > 1 && (
            <div className="mb-4">
              <p className="text-foreground text-sm font-semibold mb-2">Select Size</p>
              <VariantSelector
                variants={product.variants}
                selected={selectedVariantId ?? selectedVariant?.id ?? null}
                onSelect={setSelectedVariantId}
                groupBy="size"
              />
            </div>
          )}

          {/* Stock status */}
          {selectedVariant && (
            <p className={`text-xs font-medium mb-4 ${selectedVariant.stock > 5 ? "text-green-600" : selectedVariant.stock > 0 ? "text-amber-600" : "text-red-500"}`}>
              {selectedVariant.stock === 0 ? "Out of stock" : selectedVariant.stock <= 5 ? `Only ${selectedVariant.stock} left` : "In stock"}
            </p>
          )}

          {/* Description */}
          {product.description && (
            <p className="text-muted text-sm leading-relaxed">{product.description}</p>
          )}
        </div>
      </div>

      {/* CTA */}
      <div className="px-5 pb-8 pt-3 border-t border-gray-100 bg-background flex-shrink-0">
        <button
          onClick={handleAddToCart}
          disabled={isOutOfStock}
          className="w-full bg-[#5C3317] text-white py-4 rounded-full font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#4A2810] transition-colors shadow-md"
        >
          <ShoppingBag className="w-5 h-5" />
          {isOutOfStock ? "Out of Stock" : "Add to Cart"}
        </button>
      </div>
    </div>
  );
}
