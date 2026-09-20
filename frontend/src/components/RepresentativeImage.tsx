"use client";

import { BROWSE_ONLY } from "@/lib/launchMode";

/**
 * Marks a product image as not being a photograph of the item for sale.
 *
 * The launch imagery is licensed stock: real people in real kurtis, but not
 * *these* kurtis. Sitting beside a name, a price, a size and a stock count, an
 * unlabelled photo is a statement about what arrives in the parcel. India's
 * Consumer Protection (E-Commerce) Rules 2020 require product images to be
 * accurate, and this is what makes the claim honest in the meantime.
 *
 * Shown only while browse mode is on, so it disappears with the same flag that
 * opens checkout — the moment someone can actually buy, the real photographs
 * must already be in place. Delete this component when they are.
 */
export function RepresentativeImage({ className = "" }: { className?: string }) {
  if (!BROWSE_ONLY) return null;
  return (
    <span
      className={`bg-ink/35 text-white/90 backdrop-blur-sm rounded-sm font-normal tracking-wide ${className}`}
    >
      representative image
    </span>
  );
}
