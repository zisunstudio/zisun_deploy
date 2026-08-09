"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Category } from "@/lib/queries/catalog";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=400&auto=format&fit=crop";

export function CategoryCard({ category }: { category: Category }) {
  const router = useRouter();
  return (
    <div
      className="flex-shrink-0 w-[138px] cursor-pointer group"
      onClick={() => router.push(`/category/${category.slug}`)}
    >
      <div className="w-[138px] h-[172px] rounded-2xl overflow-hidden bg-gray-100 relative">
        <Image
          src={category.image_url ?? FALLBACK_IMAGE}
          alt={category.name}
          fill
          sizes="138px"
          className="object-cover group-hover:scale-105 transition-transform duration-300"
          placeholder="blur"
          blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        />
      </div>
      <p className="text-foreground font-semibold text-sm mt-2 leading-tight">{category.name}</p>
      <p className="text-muted text-xs">{category.product_count} items</p>
    </div>
  );
}
