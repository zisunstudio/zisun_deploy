"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { formatPrice } from "@/lib/queries/catalog";

export interface FeedItem {
  id: string;
  type?: "IMAGE" | "VIDEO";
  media_url?: string;
  thumbnail_url?: string;
  caption?: string;
  // Product-based feed item fields
  name?: string;
  base_price?: number;
  image?: string;
  // The feed serves two shapes. A published ContentCard carries `products`;
  // when there are none it falls back to plain products, which carry their
  // media directly. Only the first shape was ever declared here, so every
  // fallback item resolved to the placeholder.
  // `cdn_url` is nullable to match ProductMedia: the feed hands these
  // straight through from the catalogue, and a narrower type here makes
  // Product structurally incompatible with FeedItem.
  media?: Array<{ url: string; cdn_url?: string | null }>;
  products?: Array<{ id: string; name: string; base_price: number; media?: Array<{ url: string; cdn_url?: string }> }>;
}

/**
 * `className` replaces the default aspect ratio.
 *
 * The card was hard-wired to aspect-[9/16]. In the 72vh hero that computes
 * taller than the container, so the caption pinned to the bottom fell below the
 * visible area and disappeared under the trust badges — the hero had a Shop Now
 * button nobody could reach. In a product grid it forces a portrait-video shape
 * where a 3:4 card belongs.
 */
export function FeedCard({ item, className }: { item: FeedItem; className?: string }) {
  const router = useRouter();

  // Primary image, across both feed shapes. The product fallback -- which is
  // what the feed actually serves today, since no ContentCards are published --
  // keeps its media on the item itself, and that branch was missing.
  const imageUrl = item.media_url
    ?? item.thumbnail_url
    ?? item.image
    ?? item.products?.[0]?.media?.[0]?.cdn_url
    ?? item.products?.[0]?.media?.[0]?.url
    ?? item.media?.[0]?.cdn_url
    ?? item.media?.[0]?.url
    ?? "/placeholder-hero.svg";

  // Primary product
  const product = item.products?.[0];
  const productId = product?.id ?? item.id;
  const productName = product?.name ?? item.name ?? item.caption ?? "View Product";
  const price = product?.base_price ?? item.base_price;

  function handleShopNow() {
    router.push(`/product/${productId}`);
  }

  return (
    <div className={`relative w-full bg-gray-100 flex-shrink-0 overflow-hidden ${className ?? "aspect-[9/16]"}`}>
      {item.type === "VIDEO" && item.media_url ? (
        <video
          src={item.media_url}
          poster={item.thumbnail_url ?? undefined}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <Image
          src={imageUrl}
          alt={productName}
          fill
          sizes="100vw"
          className="object-cover"
          priority
        />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

      {/* Caption + Shop Now */}
      <div className="absolute bottom-5 left-0 right-0 px-5">
        {item.caption && (
          <p className="text-white text-sm font-medium mb-2 line-clamp-2">{item.caption}</p>
        )}
        <p className="text-white font-bold text-lg mb-3">{productName}</p>
        {price !== undefined && (
          <p className="text-white/80 text-sm mb-3">{formatPrice(price)}</p>
        )}
        <button
          onClick={handleShopNow}
          className="flex items-center gap-2 bg-white text-[#5C3317] px-5 py-2.5 rounded-full font-semibold text-sm shadow-lg"
        >
          <ShoppingBag className="w-4 h-4" />
          Shop Now
        </button>
      </div>
    </div>
  );
}
