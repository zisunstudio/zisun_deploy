"use client";

import Image from "next/image";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCategory, type Category, type Product } from "@/lib/queries/catalog";
import { ProductCard } from "@/components/ProductCard";
import { ProductCardSkeleton } from "@/components/skeletons/Skeleton";

const FALLBACK_IMAGE = "/placeholder-product.svg";

/** The interactive category page, inside the server shell in page.tsx. */
export default function CategoryView({ params, initial }: { params: { slug: string }; initial?: (Category & { products: Product[] }) | null }) {
  const router = useRouter();
  const { data: category, isLoading } = useCategory(params.slug, initial ?? undefined);

  return (
    <div className="w-full bg-background">
      {/* Hero */}
      <div className="relative h-56 lg:h-72 flex-shrink-0 bg-rose">
        <Image
          src={category?.image_url ?? FALLBACK_IMAGE}
          alt={category?.name ?? "Category"}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/35 via-ink/10 to-ink/70" />
        <div className="absolute inset-0 flex flex-col justify-between p-5">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/20 backdrop-blur-sm text-white mt-6"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="font-display text-[40px] lg:text-6xl text-white leading-[0.95] drop-shadow-sm">
              {isLoading ? "..." : category?.name}
            </h1>
            {category?.description && (
              <p className="text-white/85 text-sm mt-2 max-w-md">{category.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Products grid */}
      <div className="px-5 pt-5 pb-6">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
            {Array(6).fill(0).map((_, i) => <ProductCardSkeleton key={i} />)}
          </div>
        ) : !category?.products?.length ? (
          <div className="flex flex-col items-center justify-center h-48">
            <p className="text-muted text-sm">No products in this category yet.</p>
          </div>
        ) : (
          <>
            <p className="text-muted text-xs mb-4">{category.product_count} {category.product_count === 1 ? "piece" : "pieces"}</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
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
