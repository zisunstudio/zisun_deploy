"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Heart, ShoppingBag, Trash2 } from "lucide-react";
import { useWishlist, useRemoveFromWishlist } from "@/lib/queries/wishlist";
import { formatPrice } from "@/lib/queries/catalog";
import { useCartStore } from "@/store/useCartStore";
import { useAuthStore } from "@/store/useAuthStore";
import { ProductCardSkeleton } from "@/components/skeletons/Skeleton";
import { BROWSE_ONLY } from "@/lib/launchMode";

const FALLBACK_IMAGE = "/placeholder-product.svg";

export default function WishlistPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const { data: wishlist, isLoading } = useWishlist();
  const removeItem = useRemoveFromWishlist();
  const addCartItem = useCartStore((s) => s.addItem);
  const toggleCart = useCartStore((s) => s.toggleCart);

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 gap-4">
        <Heart className="w-12 h-12 text-gray-200" />
        <p className="text-foreground font-semibold text-base text-center">Sign in to see your wishlist</p>
        <button
          onClick={() => router.push("/login")}
          className="bg-primary text-white px-8 py-3 rounded-full font-semibold text-sm"
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-background">
      <div className="px-5 pt-12 pb-4">
        <h1 className="font-serif text-2xl font-bold text-foreground">Wishlist</h1>
        {!isLoading && (
          <p className="text-muted text-sm mt-0.5">{wishlist?.total_items ?? 0} saved items</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-6">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4">
            {Array(4).fill(0).map((_, i) => <ProductCardSkeleton key={i} />)}
          </div>
        ) : !wishlist?.items.length ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Heart className="w-10 h-10 text-gray-200" />
            <p className="text-muted text-sm">Your wishlist is empty</p>
            <button
              onClick={() => router.push("/shop")}
              className="text-primary text-sm font-semibold underline"
            >
              Browse products
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {wishlist.items.map((item) => {
              const product = item.variant?.product;
              const variant = item.variant;
              if (!product || !variant) return null;
              const price = product.base_price + variant.price_delta;
              const imageUrl = product.media?.[0]?.cdn_url ?? product.media?.[0]?.url ?? FALLBACK_IMAGE;

              return (
                <div
                  key={item.id}
                  className="flex gap-4 bg-white rounded-2xl p-3 shadow-sm border border-gray-50"
                >
                  <div
                    className="relative w-24 h-28 flex-shrink-0 rounded-xl overflow-hidden bg-gray-100 cursor-pointer"
                    onClick={() => router.push(`/product/${product.id}`)}
                  >
                    <Image src={imageUrl} alt={product.name} fill sizes="96px" className="object-cover" />
                  </div>
                  <div className="flex-1 py-1 flex flex-col justify-between">
                    <div>
                      <p
                        className="text-foreground font-semibold text-sm leading-tight line-clamp-2 cursor-pointer"
                        onClick={() => router.push(`/product/${product.id}`)}
                      >
                        {product.name}
                      </p>
                      {variant.size && (
                        <p className="text-muted text-xs mt-0.5">Size: {variant.size}</p>
                      )}
                      <p className="text-primary font-bold text-sm mt-1">{formatPrice(price)}</p>
                    </div>
                    <div className="flex gap-2 mt-2">
                      {BROWSE_ONLY ? (
                        // Saving items still works and is the point of a
                        // pre-launch wishlist; only moving them to a cart that
                        // cannot check out is withheld.
                        <div className="flex-1 flex items-center justify-center rounded-full py-2 bg-[#F7F0E8] border border-[#EDE4D8] text-muted text-xs font-medium">
                          Saved for launch
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            addCartItem({ id: variant.id, name: product.name, price: price / 100, quantity: 1, image: imageUrl, size: variant.size ?? undefined });
                            toggleCart();
                            removeItem.mutate(variant.id);
                          }}
                          disabled={variant.stock === 0}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-white rounded-full py-2 text-xs font-semibold disabled:opacity-50"
                        >
                          <ShoppingBag className="w-3.5 h-3.5" />
                          Move to Cart
                        </button>
                      )}
                      <button
                        onClick={() => removeItem.mutate(variant.id)}
                        className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 text-gray-400"
                        aria-label="Remove from wishlist"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
