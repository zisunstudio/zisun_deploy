"use client";

import { useState } from "react";
import { ChevronLeft, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useProducts, useCategories, SortBy } from "@/lib/queries/catalog";
import { ProductCard } from "@/components/ProductCard";
import { ProductCardSkeleton } from "@/components/skeletons/Skeleton";
import { SearchBar } from "@/components/SearchBar";
import { LegalFooter } from "@/components/LegalFooter";

const SORT_OPTIONS: { label: string; value: SortBy }[] = [
  { label: "Newest", value: "newest" },
  { label: "Price: Low to High", value: "price_asc" },
  { label: "Price: High to Low", value: "price_desc" },
];

export default function ShopPage() {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading } = useProducts({ category_id: categoryId, sort_by: sortBy });
  const { data: categories } = useCategories();

  return (
    <div className="w-full bg-background">
      {/* Header */}
      <div className="px-5 pt-12 pb-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-line shadow-soft">
          <ChevronLeft className="w-4 h-4 text-foreground" />
        </button>
        <h1 className="font-display text-[28px] text-ink flex-1 leading-none">Shop <em className="italic font-normal text-ink/60">all</em></h1>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`w-10 h-10 flex items-center justify-center rounded-full border shadow-soft transition-colors ${showFilters ? "bg-ink border-ink text-white" : "bg-white border-line"}`}
          aria-label="Filters"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>

      <div className="px-5 mb-3">
        <SearchBar onSearch={(q) => q.trim() && router.push(`/search?q=${encodeURIComponent(q)}`)} />
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="px-5 pb-4 space-y-3">
          {/* Sort */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSortBy(opt.value)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  sortBy === opt.value ? "bg-ink border-ink text-white" : "bg-white border-line text-ink"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Category chips */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setCategoryId(undefined)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                !categoryId ? "bg-ink border-ink text-white" : "bg-white border-line text-ink"
              }`}
            >
              All
            </button>
            {categories?.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoryId(cat.id === categoryId ? undefined : cat.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  categoryId === cat.id ? "bg-ink border-ink text-white" : "bg-white border-line text-ink"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Grid */}
      {/* Own ceiling, now the shell has none: without it a four-up grid on a
          very wide display renders 600px product cards. */}
      <div className="px-5 lg:px-8 pb-6 w-full max-w-[1500px] mx-auto">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
            {Array(8).fill(0).map((_, i) => <ProductCardSkeleton key={i} />)}
          </div>
        ) : data?.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <p className="text-muted text-sm">No products found</p>
            <button onClick={() => setCategoryId(undefined)} className="text-ink text-sm font-semibold underline underline-offset-4">
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <p className="text-muted text-xs mb-4">{data?.total ?? 0} pieces</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
              {data?.items.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </>
        )}

        {/* Inside the scroll area, not beside it. As a sibling of the
            scrolling div this pinned to the bottom of the window and the
            product grid ran underneath it. */}
        <LegalFooter />
      </div>

    </div>
  );
}
