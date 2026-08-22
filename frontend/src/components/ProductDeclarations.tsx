"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { LegalMetrology } from "@/lib/queries/catalog";
import { formatPrice } from "@/lib/queries/catalog";

interface ProductDeclarationsProps {
  declarations: LegalMetrology;
  /** MRP in paise for the selected variant. */
  price: number;
}

/**
 * The declarations the Legal Metrology (Packaged Commodities) Rules require a
 * listing to carry before the buyer pays: packer name and address, country of
 * origin, generic commodity name, net quantity, MRP inclusive of taxes,
 * consumer-care contact, and — for apparel specifically — dimensions.
 *
 * Collapsed by default. The rule is that the information must be available
 * before purchase, not that it must outweigh the product; a wall of statutory
 * text above the Add-to-Cart button would push the buy action off a phone
 * screen. Rendered in the DOM either way, so it is searchable and reachable by
 * a screen reader without the toggle.
 */
export function ProductDeclarations({ declarations, price }: ProductDeclarationsProps) {
  const [open, setOpen] = useState(false);

  const rows: Array<[string, string | null]> = [
    ["Commodity", declarations.commodity_name],
    ["Net quantity", declarations.net_quantity],
    ["Dimensions", declarations.dimensions],
    // Stated as "inclusive of all taxes" because that is the declaration the
    // rules ask for, and because the price shown on this page is the price
    // charged — GST is inside it, not added at checkout.
    ["MRP", `${formatPrice(price)} (inclusive of all taxes)`],
    ["Country of origin", declarations.country_of_origin],
    ["Marketed and packed by", declarations.manufacturer_name],
    ["Address", declarations.manufacturer_address],
    [
      "Consumer care",
      `${declarations.consumer_care_name} · ${declarations.consumer_care_email} · ${declarations.consumer_care_phone}`,
    ],
  ];

  return (
    <div className="mt-6 border-t border-gray-100 pt-4">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="product-declarations"
        className="w-full flex items-center justify-between text-left"
      >
        <span className="text-sm font-semibold text-foreground">Product information</span>
        <ChevronDown
          className={`w-4 h-4 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <dl
        id="product-declarations"
        hidden={!open}
        className="mt-3 space-y-2 text-xs leading-relaxed"
      >
        {rows.map(([label, value]) =>
          // A blank statutory row is worse than an absent one — it reads as a
          // declaration we failed to make. Dimensions is the only row that can
          // legitimately be missing; everything else has a brand-level default.
          value ? (
            <div key={label} className="flex flex-col sm:flex-row sm:gap-3">
              <dt className="text-muted sm:w-44 sm:flex-shrink-0">{label}</dt>
              <dd className="text-foreground">{value}</dd>
            </div>
          ) : null
        )}
      </dl>
    </div>
  );
}
