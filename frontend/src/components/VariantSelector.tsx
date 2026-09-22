"use client";

import { ProductVariant } from "@/lib/queries/catalog";
import { sizeRank } from "@/lib/colours";

interface Props {
  variants: ProductVariant[];
  selected: string | null;
  onSelect: (variantId: string) => void;
  groupBy?: "size" | "color";
  /**
   * Grey out sizes with zero stock. Off in browse mode: the counts are
   * still being entered, and a chip struck through for a size that exists
   * reads as "we do not make this", which is false.
   */
  honourStock?: boolean;
}

export function VariantSelector({ variants, selected, onSelect, groupBy = "size", honourStock = true }: Props) {
  // One chip per size (or colour). Two rows can share a label - the live
  // catalogue has two "XL / Purple" rows - so the chip stands for whichever
  // of them is in stock, and "selected" is decided by label, not by row id:
  // choosing either row lights the same chip.
  const key = (v: ProductVariant) => (groupBy === "size" ? v.size : v.color)?.trim().toUpperCase() ?? "";
  const byLabel = new Map<string, ProductVariant>();
  for (const v of variants.filter((x) => x.is_active)) {
    const k = key(v);
    const had = byLabel.get(k);
    if (!had || (had.stock === 0 && v.stock > 0)) byLabel.set(k, v);
  }
  const options = Array.from(byLabel.values());
  const selectedVariant = variants.find((v) => v.id === selected);
  const selectedKey = selectedVariant ? key(selectedVariant) : null;
  if (groupBy === "size") {
    options.sort((a, b) => sizeRank(a.size) - sizeRank(b.size));
  }

  if (options.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((variant) => {
        const label = groupBy === "size" ? variant.size : variant.color;
        const isOutOfStock = honourStock && variant.stock === 0;
        const isSelected = selectedKey !== null && key(variant) === selectedKey;

        return (
          <button
            key={variant.id}
            onClick={() => !isOutOfStock && onSelect(variant.id)}
            disabled={isOutOfStock}
            aria-label={`${label}${isOutOfStock ? " — out of stock" : ""}`}
            className={`min-w-[40px] h-10 px-3 rounded-full border text-xs font-semibold transition-all relative
              ${isSelected
                ? "border-ink bg-ink text-white"
                : isOutOfStock
                  ? "border-line text-ink/30 line-through cursor-not-allowed"
                  : "border-line text-ink/80 hover:border-ink hover:text-ink"
              }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
