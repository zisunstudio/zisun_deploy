"use client";

import { useRef, useState } from "react";
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
export function ProductDeclarations({ declarations, price, hasSizeChart = false }: ProductDeclarationsProps & { hasSizeChart?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  function toggle() {
    const next = !open;
    setOpen(next);
    // The product page scrolls inside its own container rather than the
    // window, so expanding a section near the bottom of it reveals content
    // below the fold — the customer taps and, as far as they can tell,
    // nothing happens. Pull the section up after the row has laid out.
    if (next) {
      requestAnimationFrame(() =>
        ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
      );
    }
  }

  const rows: Array<[string, string | null]> = [
    ["Commodity", declarations.commodity_name],
    // Still the statutory term, because this block is the statutory block -
    // but the value is now derived from the pieces in the set ("1 set - 2
    // pieces") rather than typed. It once read "5" on a single co-ord set,
    // which a customer reads as five kurtas. What is in the set is said in
    // the customer's own words further up the page.
    ["Net quantity", declarations.net_quantity],
    // Only when there is no size chart. With one, the chart *is* the
    // garment's measurement declaration and it is already on the page, a
    // tap from the size buttons; a row here pointing back at it was the
    // one line in this block that told a customer nothing.
    ["Size", hasSizeChart ? null : declarations.dimensions],
    // Stated as "inclusive of all taxes" because that is the declaration the
    // rules ask for, and because the price shown on this page is the price
    // charged — GST is inside it, not added at checkout.
    ["MRP", `${formatPrice(price)} (inclusive of all taxes)`],
    ["Country of origin", declarations.country_of_origin],
    ["Marketed and packed by", declarations.manufacturer_name],
    ["Address", declarations.manufacturer_address],
    [
      "Consumer care",
      // The phone is optional and omitted while ZISUN has no business line -
      // it must never fall back to the founder's personal mobile.
      [declarations.consumer_care_name, declarations.consumer_care_email, declarations.consumer_care_phone]
        .filter(Boolean)
        .join(" · "),
    ],
  ];

  return (
    <div ref={ref} className="mt-6 border-t border-gray-100 pt-4">
      <button
        onClick={toggle}
        aria-expanded={open}
        aria-controls="product-declarations"
        className="w-full flex items-center justify-between text-left"
      >
        {/* Named for what it is. Every row here is a declaration the Legal
            Metrology rules require on an online listing, so none can be
            removed - but a customer who reads "Product information" expects
            product information, finds "Net quantity" and "Marketed and
            packed by", and decides the page is confusing. Called what it is,
            she knows she can skip it, and the few who need it know where
            it is. Collapsed, last, and quiet. */}
        <span className="text-xs font-medium text-muted">Legal declarations</span>
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
          // declaration we failed to make. Size and the support phone are the
          // only rows that can legitimately be missing; the rest have a
          // brand-level default.
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
