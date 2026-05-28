"use client";

import Image from "next/image";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCategory } from "@/lib/queries/catalog";
import { ProductCard } from "@/components/ProductCard";
import { ProductCardSkeleton } from "@/components/skeletons/Skeleton";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=800&auto=format&fit=crop";

export default function CategoryPage({ params }: { params: { slug: string } }) {
  const router = useRouter();
  const { data: category, isLoading } = useCategory(params.slug);

  return (
    <div className="h-full w-full flex flex-col bg-background">
      {/* Hero */}
      <div className="relative h-48 flex-shrink-0">
        <Image
          src={category?.image_url ?? FALLBACK_IMAGE}
          alt={category?.name ?? "Category"}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black/60" />
        <div className="absolute inset-0 flex flex-col justify-between p-5">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/20 backdrop-blur-sm text-white mt-6"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="font-serif text-3xl font-bold text-white leading-tight">
              {isLoading ? "..." : category?.name}
            </h1>
            {category?.description && (
              <p className="text-white/80 text-xs mt-1">{category.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Products grid */}
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-6">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4">
            {Array(6).fill(0).map((_, i) => <ProductCardSkeleton key={i} />)}
          </div>
        ) : !category?.products?.length ? (
          <div className="flex flex-col items-center justify-center h-48">
            <p className="text-muted text-sm">No products in this category yet.</p>
          </div>
        ) : (
          <>
            <p className="text-muted text-xs mb-4">{category.product_count} items</p>
            <div className="grid grid-cols-2 gap-4">
              {category.products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
