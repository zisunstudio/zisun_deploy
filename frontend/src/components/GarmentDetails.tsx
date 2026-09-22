"use client";

import { Layers, Package, Palette, Ruler, Scissors, Shirt, Sparkles } from "lucide-react";
import type { GarmentAttributes } from "@/lib/queries/catalog";

interface Props {
  attributes: GarmentAttributes;
  /**
   * Lives on the fabric block in the data, but it is a fact about the cut,
   * not the cloth. Shown here so a customer reads "does it have pockets"
   * beside neck and sleeve, where they are looking for it, and reads it once.
   */
  hasPockets?: boolean | null;
  /**
   * The colour chip the customer has already chosen. The garment's described
   * colour is only worth a row when it says more than that chip does
   * ("Indigo with off-white border" vs "Indigo").
   */
  selectedColour?: string | null;
}

/**
 * What the garment is.
 *
 * Every row is a question the founder answers by hand in the WhatsApp group,
 * and a page that cannot answer them sends the customer back to the chat to
 * ask. The panel is deliberately in the order someone asks them: what am I
 * getting, how does it fit, how long is it, then the neck, the sleeve, the
 * surface, and the small yes/no facts.
 *
 * Rules, all of them learned the hard way:
 *  - A row appears only when the value exists. There are no brand-level
 *    fallbacks: these are facts about one garment and a default would print
 *    a claim nobody checked.
 *  - Nothing here repeats what the page already says elsewhere. Pockets moved
 *    off the fabric panel rather than being printed on both, and the colour
 *    row is suppressed when it only echoes the selected swatch.
 *  - The labels are the words a customer uses. "Dimensions" and "net
 *    quantity" are warehouse language; a woman buying a kurti asks about
 *    length, fit and what is in the set.
 */
export function GarmentDetails({ attributes: a, hasPockets, selectedColour }: Props) {
  const rows: Array<{ Icon: typeof Shirt; label: string; value: string }> = [];

  // What is in the set. First, because on a co-ord set it is the difference
  // between a kurta and two garments, and nothing else on the page says so.
  const pieces = (a.set_pieces ?? []).filter((p) => p && p.trim());
  if (pieces.length > 1) {
    rows.push({ Icon: Package, label: "Set of " + pieces.length, value: pieces.join(" · ") });
  }

  if (a.fit) rows.push({ Icon: Shirt, label: "Fit", value: a.fit });
  if (a.garment_length) rows.push({ Icon: Ruler, label: "Length", value: a.garment_length });
  if (a.neck_type) rows.push({ Icon: Shirt, label: "Neck", value: a.neck_type });

  // Sleeve type and whether it is attached are one line to a reader, two facts
  // in the data. "Three-quarter, attached" is how someone would say it aloud.
  if (a.sleeve_type || a.sleeve_attached !== null) {
    const parts: string[] = [];
    if (a.sleeve_type) parts.push(a.sleeve_type);
    if (a.sleeve_attached === true) parts.push("attached");
    if (a.sleeve_attached === false) parts.push("sold separately, not attached");
    rows.push({ Icon: Scissors, label: "Sleeve", value: parts.join(" · ") });
  }

  if (a.print_type) rows.push({ Icon: Sparkles, label: "Print", value: a.print_type });
  if (a.pattern) rows.push({ Icon: Layers, label: "Pattern", value: a.pattern });
  if (a.embroidery) rows.push({ Icon: Sparkles, label: "Embroidery", value: a.embroidery });

  // Only when it adds to the swatch the customer already picked.
  if (a.colour && a.colour.trim().toLowerCase() !== (selectedColour ?? "").trim().toLowerCase()) {
    rows.push({ Icon: Palette, label: "Colour", value: a.colour });
  }

  if (a.bottom_type) rows.push({ Icon: Layers, label: "Bottom", value: a.bottom_type });

  if (hasPockets !== null && hasPockets !== undefined) {
    rows.push({
      Icon: Scissors,
      label: "Pockets",
      // Stated either way. Seven people named missing pockets unprompted,
      // which makes "no" worth saying honestly rather than leaving them to
      // find out after it arrives.
      value: hasPockets ? "Yes" : "No pockets on this piece",
    });
  }

  if (a.dupatta_included !== null && a.dupatta_included !== undefined) {
    rows.push({
      Icon: Layers,
      label: "Dupatta",
      // A customer expecting a dupatta that does not arrive is an exchange
      // request, and "no" costs nothing to say up front.
      value: a.dupatta_included ? "Included" : "Not included",
    });
  }

  if (a.occasion) rows.push({ Icon: Sparkles, label: "Wear it for", value: a.occasion });

  // Two questions Indian cotton always raises, answered only when recorded.
  if (a.lining) rows.push({ Icon: Layers, label: "Lining", value: a.lining });
  if (a.transparency) rows.push({ Icon: Layers, label: "Sheerness", value: a.transparency });

  // Provenance is the trust evidence: how it was made, where, and how many.
  // Each only when recorded - the site never says "handloom" on its own.
  if (a.craft) rows.push({ Icon: Sparkles, label: "Made by", value: a.craft });
  if (a.origin) rows.push({ Icon: Package, label: "From", value: a.origin });
  if (a.batch_size || a.will_rerun === false) {
    const bits: string[] = [];
    if (a.batch_size) bits.push(`${a.batch_size} made`);
    if (a.will_rerun === false) bits.push("not re-run");
    if (a.will_rerun === true) bits.push("will be re-run");
    rows.push({ Icon: Package, label: "Batch", value: bits.join(" · ") });
  }

  if (rows.length === 0) return null;

  return (
    <section className="mt-6 border-t border-gray-100 pt-4">
      <h2 className="text-sm font-semibold text-foreground mb-3">The garment</h2>
      <dl className="flex flex-col gap-2.5">
        {rows.map(({ Icon, label, value }) => (
          <div key={label} className="flex gap-2.5">
            <Icon className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex flex-col sm:flex-row sm:gap-2 min-w-0">
              <dt className="text-xs text-muted sm:w-24 sm:flex-shrink-0">{label}</dt>
              <dd className="text-sm text-foreground leading-snug">{value}</dd>
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}
