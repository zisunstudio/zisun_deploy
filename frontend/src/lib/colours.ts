/**
 * The colour palette, in one place.
 *
 * The console offers these names in a picker instead of a free-text box, so
 * a colour is spelled one way across every product and the storefront can
 * draw a real swatch for it. Names are the ones a customer in India would say
 * ("rani pink", "mustard", "bottle green"), not paint-catalogue codes.
 *
 * `hex` is for the swatch dot only; the photographs carry the real colour.
 */
import type { CSSProperties } from "react";

export interface PaletteColour { name: string; hex: string; code: string }

export const PALETTE: PaletteColour[] = [
  { name: "Ivory", hex: "#F4EFE4", code: "IVR" },
  { name: "White", hex: "#FFFFFF", code: "WHT" },
  { name: "Beige", hex: "#D9C7A8", code: "BEG" },
  { name: "Blush", hex: "#F3C6C6", code: "BLS" },
  { name: "Peach", hex: "#F7B48F", code: "PCH" },
  { name: "Coral", hex: "#F0705B", code: "CRL" },
  { name: "Rani Pink", hex: "#D81E6B", code: "RNI" },
  { name: "Red", hex: "#C8102E", code: "RED" },
  { name: "Maroon", hex: "#7A1F2B", code: "MRN" },
  { name: "Wine", hex: "#5E1A3A", code: "WIN" },
  { name: "Rust", hex: "#B5471F", code: "RST" },
  { name: "Orange", hex: "#F27A1A", code: "ORG" },
  { name: "Mustard", hex: "#D9A62E", code: "MST" },
  { name: "Yellow", hex: "#F2C14E", code: "YLW" },
  { name: "Olive", hex: "#7A7A3A", code: "OLV" },
  { name: "Green", hex: "#3C8D4E", code: "GRN" },
  { name: "Bottle Green", hex: "#1F4D3A", code: "BTG" },
  { name: "Mint", hex: "#A9DCC3", code: "MNT" },
  { name: "Teal", hex: "#1F7A82", code: "TEL" },
  { name: "Sky Blue", hex: "#9BC7E6", code: "SKY" },
  { name: "Royal Blue", hex: "#2A4BB5", code: "RYL" },
  { name: "Navy", hex: "#1B2A4A", code: "NVY" },
  { name: "Indigo", hex: "#2E3A8C", code: "IND" },
  { name: "Lavender", hex: "#C3B3E0", code: "LAV" },
  { name: "Purple", hex: "#6A2C91", code: "PRP" },
  { name: "Brown", hex: "#6B4A2E", code: "BRN" },
  { name: "Grey", hex: "#8C8C8C", code: "GRY" },
  { name: "Charcoal", hex: "#3B3B3B", code: "CHR" },
  { name: "Black", hex: "#111111", code: "BLK" },
  { name: "Gold", hex: "#C9A227", code: "GLD" },
  { name: "Multicolour", hex: "linear-gradient(135deg,#D81E6B,#F2C14E,#2E3A8C)", code: "MLT" },
];

export const PALETTE_NAMES = PALETTE.map((c) => c.name);

/** Sizes the console offers first; anything else can still be typed. */
export const SIZE_PRESETS = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "Free"];

const byLower = new Map(PALETTE.map((c) => [c.name.toLowerCase(), c]));

/** The palette entry for a stored colour name, tolerant of older free text. */
export function paletteColour(name: string | null | undefined): PaletteColour | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  const exact = byLower.get(n);
  if (exact) return exact;
  // "Indigo with off-white border" → Indigo. Longest name first so "Bottle
  // Green" wins over "Green" and "Rani Pink" over "Pink".
  const hit = [...PALETTE].sort((a, b) => b.name.length - a.name.length).find((c) => n.includes(c.name.toLowerCase()));
  return hit ?? null;
}

/** CSS background for a swatch, or a neutral when the colour is unknown. */
export function swatchStyle(name: string | null | undefined): CSSProperties {
  const c = paletteColour(name);
  if (!c) return { background: "repeating-linear-gradient(45deg,#e5e5e5 0 3px,#f5f5f5 3px 6px)" };
  return c.hex.startsWith("linear") ? { background: c.hex } : { backgroundColor: c.hex };
}

/** Three-letter code for a SKU, from the palette or the name's initials. */
export function colourCode(name: string): string {
  const c = paletteColour(name);
  if (c) return c.code;
  return name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "CLR";
}
