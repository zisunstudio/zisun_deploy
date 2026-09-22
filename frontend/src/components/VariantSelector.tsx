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
  const options = Array.from(
    new Map(
      variants
        .filter((v) => v.is_active)
        // Trimmed: "Purple " and "Purple" were two chips for one colour, and
        // "XL " and "XL" two sizes. The API trims on write now; this keeps
        // rows entered before it did from splitting the selector.
        .map((v) => [(groupBy === "size" ? v.size : v.color)?.trim() ?? null, v])
    ).values()
  );
  if (groupBy === "size") {
    options.sort((a, b) => sizeRank(a.size) - sizeRank(b.size));
  }

  if (options.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((variant) => {
        const label = groupBy === "size" ? variant.size : variant.color;
        const isOutOfStock = honourStock && variant.stock === 0;
        const isSelected = selected === variant.id;

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
