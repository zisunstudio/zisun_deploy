"use client";

import { Droplets, Ruler, Scissors, Shirt, WashingMachine, Wind } from "lucide-react";
import type { FabricSpecs as Specs } from "@/lib/queries/catalog";

interface Props {
  specs: Specs;
}

/**
 * Fabric and care, above the buy button.
 *
 * Every row here answers something a real customer named. Of 26 survey
 * responses, "doubt about quality" was the top reason for not buying from a
 * small brand — 12 of 26 — and the complaints about ethnic wear they already
 * own were specific: colour bleeding (9), no pockets (7), creasing and heat
 * (5 each). The product page had nothing to answer any of it with.
 *
 * Open by default, unlike the statutory declarations below it. Those are a
 * legal obligation the buyer rarely reads; this is the argument for buying, and
 * an argument behind a toggle is an argument nobody hears.
 *
 * A row only appears when the value exists. There is no brand-level fallback
 * anywhere in this panel: these are measurements of one garment, and a default
 * would put a claim nobody checked on a live product page. If nothing has been
 * recorded the panel does not render — an empty quality panel is worse than
 * none, because it reads as a specification we declined to give on the exact
 * question the customer is already suspicious about.
 */
export function FabricSpecs({ specs }: Props) {
  const rows: Array<{ Icon: typeof Shirt; label: string; value: string }> = [];

  if (specs.fabric_composition) {
    rows.push({ Icon: Shirt, label: "Fabric", value: specs.fabric_composition });
  }
  if (specs.fabric_gsm) {
    rows.push({
      Icon: Ruler,
      label: "Weight",
      // The number alone means nothing to a shopper. Cotton below about 130
      // reads as light and breathable; above it, substantial.
      value: `${specs.fabric_gsm} GSM — ${specs.fabric_gsm < 130 ? "light, breathable" : "substantial"}`,
    });
  }
  if (specs.weave) {
    rows.push({ Icon: Wind, label: "Weave", value: specs.weave });
  }
  if (specs.has_pockets !== null && specs.has_pockets !== undefined) {
    rows.push({
      Icon: Scissors,
      label: "Pockets",
      // Stated either way. Seven people named missing pockets unprompted, which
      // makes "no" worth saying honestly rather than leaving them to discover it.
      value: specs.has_pockets ? "Yes" : "No pockets on this piece",
    });
  }
  if (specs.colourfastness) {
    rows.push({ Icon: Droplets, label: "Colour", value: specs.colourfastness });
  }
  if (specs.wash_care) {
    rows.push({ Icon: WashingMachine, label: "Care", value: specs.wash_care });
  }

  if (rows.length === 0) return null;

  return (
    <section className="mt-6 border-t border-gray-100 pt-4">
      <h2 className="text-sm font-semibold text-foreground mb-3">Fabric &amp; care</h2>
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
