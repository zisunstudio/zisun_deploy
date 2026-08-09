"use client";

import { ProductVariant } from "@/lib/queries/catalog";

interface Props {
  variants: ProductVariant[];
  selected: string | null;
  onSelect: (variantId: string) => void;
  groupBy?: "size" | "color";
}

export function VariantSelector({ variants, selected, onSelect, groupBy = "size" }: Props) {
  const options = Array.from(
    new Map(
      variants
        .filter((v) => v.is_active)
        .map((v) => [groupBy === "size" ? v.size : v.color, v])
    ).values()
  );

  if (options.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((variant) => {
        const label = groupBy === "size" ? variant.size : variant.color;
        const isOutOfStock = variant.stock === 0;
        const isSelected = selected === variant.id;

        return (
          <button
            key={variant.id}
            onClick={() => !isOutOfStock && onSelect(variant.id)}
            disabled={isOutOfStock}
            aria-label={`${label}${isOutOfStock ? " — out of stock" : ""}`}
            className={`min-w-[40px] h-10 px-3 rounded-full border text-xs font-semibold transition-all relative
              ${isSelected
                ? "border-primary bg-primary text-white"
                : isOutOfStock
                  ? "border-gray-200 text-gray-300 line-through cursor-not-allowed"
                  : "border-gray-200 text-gray-600 hover:border-primary hover:text-primary"
              }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
