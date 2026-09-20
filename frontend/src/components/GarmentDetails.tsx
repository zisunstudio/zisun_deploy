"use client";

import { Layers, Palette, Scissors, Shirt, Sparkles } from "lucide-react";
import type { GarmentAttributes } from "@/lib/queries/catalog";

interface Props {
  attributes: GarmentAttributes;
}

/**
 * The garment's details, beside the buy button.
 *
 * These are the seven questions the founder answers by hand in the WhatsApp
 * group every day — colour, print, pattern, neck, sleeve, whether the sleeve is
 * attached, whether a dupatta is included. Asking them is the last step before
 * someone buys ethnic wear, and a page that cannot answer sends them back to
 * the chat to ask.
 *
 * Same rule as the fabric panel above it: a row appears only when the value
 * exists, and there are no brand-level fallbacks. These are facts about one
 * garment, and a default would print a claim nobody checked. If nothing has
 * been recorded the panel does not render at all.
 */
export function GarmentDetails({ attributes: a }: Props) {
  const rows: Array<{ Icon: typeof Shirt; label: string; value: string }> = [];

  if (a.colour) rows.push({ Icon: Palette, label: "Colour", value: a.colour });
  if (a.print_type) rows.push({ Icon: Sparkles, label: "Print", value: a.print_type });
  if (a.pattern) rows.push({ Icon: Layers, label: "Pattern", value: a.pattern });
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

  if (a.dupatta_included !== null && a.dupatta_included !== undefined) {
    rows.push({
      Icon: Layers,
      label: "Dupatta",
      // Stated either way. A customer expecting a dupatta that does not arrive
      // is an exchange request, and "no" costs nothing to say up front.
      value: a.dupatta_included ? "Included" : "Not included",
    });
  }

  if (rows.length === 0) return null;

  return (
    <section className="mt-6 border-t border-gray-100 pt-4">
      <h2 className="text-sm font-semibold text-foreground mb-3">Product details</h2>
      <dl className="flex flex-col gap-2.5">
        {rows.map(({ Icon, label, value }) => (
          <div key={label} className="flex gap-2.5">
            <Icon className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex flex-col sm:flex-row sm:gap-2 min-w-0">
              <dt className="text-xs text-muted sm:w-20 sm:flex-shrink-0">{label}</dt>
              <dd className="text-sm text-foreground leading-snug">{value}</dd>
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}
