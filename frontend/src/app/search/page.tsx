"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useSearch } from "@/lib/queries/catalog";
import { ProductCard } from "@/components/ProductCard";
import { ProductCardSkeleton } from "@/components/skeletons/Skeleton";
import { SearchBar } from "@/components/SearchBar";

function SearchResults({ q }: { q: string }) {
  const { data, isLoading } = useSearch(q);

  if (q.trim().length < 2) return (
    <div className="flex items-center justify-center h-32">
      <p className="text-muted text-sm">Type at least 2 characters to search</p>
    </div>
  );

  if (isLoading) return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
      {Array(6).fill(0).map((_, i) => <ProductCardSkeleton key={i} />)}
    </div>
  );

  if (!data?.items.length) return (
    <div className="flex flex-col items-center justify-center h-48 gap-2">
      <p className="text-foreground font-semibold text-sm">No results for &ldquo;{q}&rdquo;</p>
      <p className="text-muted text-xs">Try a different search term</p>
    </div>
  );

  return (
    <>
      <p className="text-muted text-xs mb-4">{data.total} results for &ldquo;{q}&rdquo;</p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
        {data.items.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </>
  );
}

function SearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  return (
    <div className="h-full w-full flex flex-col bg-background">
      {/* Header */}
      <div className="px-5 pt-12 pb-4 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white border border-gray-100 shadow-sm"
        >
          <ChevronLeft className="w-4 h-4 text-foreground" />
        </button>
        <div className="flex-1">
          <SearchBar
            defaultValue={q}
            onSearch={setQ}
            autoFocus
            placeholder="Search styles, categories…"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-6">
        <SearchResults q={q} />
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageInner />
    </Suspense>
  );
}
