"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { X, ShoppingBag } from "lucide-react";
import { useCartStore } from "@/store/useCartStore";
import { useProduct, formatPrice, productImageUrl, useAddToCart } from "@/lib/queries/catalog";
import { useToast } from "@/components/ui/ToastProvider";
import { BROWSE_ONLY } from "@/lib/launchMode";
import { BrowseOnlyCTA } from "@/components/BrowseOnlyCTA";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  productId?: string | null;
}

export default function BottomSheet({ isOpen, onClose, productId }: BottomSheetProps) {
  const addItem = useCartStore((state) => state.addItem);
  const toggleCart = useCartStore((state) => state.toggleCart);
  const { showToast } = useToast();
  const addToCart = useAddToCart();

  const { data: product, isLoading } = useProduct(productId ?? "");
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);

  const selectedVariant = product
    ? (product.variants.find((v) => v.id === selectedVariantId) ?? product.variants[0] ?? null)
    : null;

  const price = selectedVariant && product
    ? product.base_price + selectedVariant.price_delta
    : product?.base_price ?? 0;

  const imageUrl = product
    ? productImageUrl(product)
    : "/placeholder-product.svg";

  const handleAddToCart = () => {
    if (product && selectedVariant) {
      // Backend cart sync (fire-and-forget — don't block UI)
      addToCart.mutate({ variant_id: selectedVariant.id, quantity: 1 });
      // Local cart for drawer
      addItem({
        id: selectedVariant.id,
        name: product.name,
        price: price / 100,
        quantity: 1,
        image: imageUrl,
        size: selectedVariant.size ?? undefined,
      });
      showToast("Added to cart", "success");
    } else if (!productId) {
      // Fallback for static usage (no productId provided)
      addItem({
        id: "variant_123",
        name: "Silk Resort Shirt",
        price: 2499,
        quantity: 1,
        image: "/placeholder-product.svg",
        size: "M",
      });
    }
    onClose();
    toggleCart();
  };

  // Determine sizes to show
  const sizes = product
    ? product.variants
        .filter((v) => v.is_active && v.size)
        .map((v) => ({ id: v.id, size: v.size!, inStock: v.stock > 0 }))
    : ["XS", "S", "M", "L", "XL"].map((s) => ({ id: s, size: s, inStock: true }));

  const activeSize = selectedVariantId
    ?? (product?.variants[0]?.id ?? "M");

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 z-40"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 220 }}
            className="absolute bottom-0 w-full bg-white rounded-t-3xl z-50 overflow-hidden shadow-2xl"
          >
            {/* Drag handle */}
            <div className="w-full pt-4 pb-2 flex justify-center items-center relative">
              <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
              <button
                onClick={onClose}
                aria-label="Close"
                className="absolute right-4 w-11 h-11 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 pb-8 pt-2">
              {isLoading && productId ? (
                <div className="animate-pulse space-y-3">
                  <div className="flex gap-4">
                    <div className="w-24 h-32 bg-gray-200 rounded-xl" />
                    <div className="flex-1 space-y-2 py-2">
                      <div className="h-5 bg-gray-200 rounded w-3/4" />
                      <div className="h-4 bg-gray-200 rounded w-1/3" />
                      <div className="h-3 bg-gray-200 rounded w-full" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((i) => <div key={i} className="w-10 h-10 bg-gray-200 rounded-full" />)}
                  </div>
                </div>
              ) : (
                <>
                  {/* Product info */}
                  <div className="flex gap-4 mb-6">
                    <div className="relative w-24 h-32 rounded-xl overflow-hidden flex-shrink-0">
                      <Image
                        src={imageUrl}
                        alt={product?.name ?? "Product"}
                        fill
                        sizes="96px"
                        className="object-cover"
                      />
                    </div>
                    <div className="flex-1 py-1">
                      <h3 className="font-serif text-xl font-bold text-foreground mb-1">
                        {product?.name ?? "Silk Resort Shirt"}
                      </h3>
                      <p className="text-primary text-lg font-semibold mb-2">
                        {product ? formatPrice(price) : "₹2,499"}
                      </p>
                      {product?.description && (
                        <p className="text-muted text-sm leading-relaxed line-clamp-2">
                          {product.description}
                        </p>
                      )}
                      {!product && (
                        <p className="text-muted text-sm leading-relaxed line-clamp-2">
                          Premium silk blend resort shirt perfect for your summer getaway. Relaxed fit.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Size / variant selector */}
                  {sizes.length > 0 && (
                    <div className="flex gap-2 mb-5 flex-wrap">
                      {sizes.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setSelectedVariantId(s.id)}
                          disabled={!s.inStock}
                          className={`w-10 h-10 rounded-full border text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                            activeSize === s.id
                              ? "border-primary bg-primary text-white"
                              : "border-gray-200 text-gray-500 hover:border-primary"
                          }`}
                        >
                          {s.size}
                        </button>
                      ))}
                    </div>
                  )}

                  {BROWSE_ONLY ? (
                    <BrowseOnlyCTA productName={product?.name} />
                  ) : (
                    <button
                      onClick={handleAddToCart}
                      disabled={product ? (!selectedVariant || selectedVariant.stock === 0) : false}
                      className="w-full bg-[#5C3317] text-white py-4 rounded-full font-semibold flex items-center justify-center gap-2 hover:bg-[#4A2810] transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ShoppingBag className="w-5 h-5" />
                      {product && selectedVariant?.stock === 0 ? "Out of Stock" : "Add to Cart"}
                    </button>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
