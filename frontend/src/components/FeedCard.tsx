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
  products?: Array<{ id: string; name: string; base_price: number; media?: Array<{ url: string; cdn_url?: string }> }>;
}

export function FeedCard({ item }: { item: FeedItem }) {
  const router = useRouter();

  // Determine primary image
  const imageUrl = item.media_url
    ?? item.thumbnail_url
    ?? item.image
    ?? item.products?.[0]?.media?.[0]?.cdn_url
    ?? item.products?.[0]?.media?.[0]?.url
    ?? "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=1000";

  // Primary product
  const product = item.products?.[0];
  const productId = product?.id ?? item.id;
  const productName = product?.name ?? item.name ?? item.caption ?? "View Product";
  const price = product?.base_price ?? item.base_price;

  function handleShopNow() {
    router.push(`/product/${productId}`);
  }

  return (
    <div className="relative w-full aspect-[9/16] bg-gray-100 flex-shrink-0 overflow-hidden">
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
      <div className="absolute bottom-20 left-0 right-0 px-5">
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
