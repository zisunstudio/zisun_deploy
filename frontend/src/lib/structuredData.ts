/**
 * What machines are told about a piece.
 *
 * schema.org JSON-LD for the product page, and the same facts for the
 * Google Merchant feed. Search engines, Google Shopping's free listings and
 * AI shopping agents all read this rather than the page's layout, so it is
 * the one place a claim has to be exactly true: price from base price plus
 * the variant delta, availability from real stock, and nothing inferred.
 *
 * Shipping is stated as 0 to India: paying online ships free, and that is the
 * standard price. Cash on Delivery adds a charge, shown at checkout.
 *
 * Deliberately absent: a return-policy block (ZISUN's policy is a 24h size
 * exchange, not a return, and there is no schema term that says that
 * without overstating it) and delivery-time estimates (they depend on the
 * pincode). Pure functions, so they are unit-tested.
 */
import type { Product } from "@/lib/queries/catalog";
import { SITE_URL } from "@/lib/legal";
import { BRAND } from "@/lib/brand";
import { sortSizes } from "@/lib/colours";

export function productUrl(p: Product): string {
  return `${SITE_URL}/product/${p.id}`;
}

export function productImages(p: Product): string[] {
  return p.media
    .filter((m) => m.type === "IMAGE")
    .sort((a, b) => a.display_order - b.display_order)
    .map((m) => m.cdn_url ?? m.url)
    .filter(Boolean);
}

/** Rupees as schema.org wants them: "1039.00". */
export function rupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

export function activeVariants(p: Product) {
  return p.variants.filter((v) => v.is_active);
}

export function inStock(p: Product): boolean {
  return activeVariants(p).some((v) => v.stock > 0);
}

/** A short plain-text description: hers, or a sentence built from facts. */
export function plainDescription(p: Product): string {
  const own = (p.description ?? "").replace(/\s+/g, " ").trim();
  if (own) return own;
  const bits = [p.category?.name, p.fabric_specs?.fabric_composition, p.garment_attributes?.colour].filter(Boolean);
  return bits.length ? `${p.name}: ${bits.join(", ")}. ${BRAND.name}.` : `${p.name} by ${BRAND.name}.`;
}

export function productJsonLd(p: Product) {
  const variants = activeVariants(p);
  const prices = variants.length ? variants.map((v) => p.base_price + v.price_delta) : [p.base_price];
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const colours = Array.from(new Set(variants.map((v) => v.color?.trim()).filter(Boolean))) as string[];
  const sizes = sortSizes(Array.from(new Set(variants.map((v) => v.size?.trim()).filter(Boolean))) as string[]);
  const shipping = {
    "@type": "OfferShippingDetails",
    shippingRate: { "@type": "MonetaryAmount", value: "0", currency: "INR" },
    shippingDestination: { "@type": "DefinedRegion", addressCountry: "IN" },
  };
  const availability = inStock(p) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
  const offers = low === high
    ? { "@type": "Offer", price: rupees(low), priceCurrency: "INR", availability, url: productUrl(p), itemCondition: "https://schema.org/NewCondition", shippingDetails: shipping }
    : { "@type": "AggregateOffer", lowPrice: rupees(low), highPrice: rupees(high), priceCurrency: "INR", offerCount: variants.length, availability, url: productUrl(p) };

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    productID: p.id,
    sku: p.id,
    name: p.name,
    description: plainDescription(p),
    url: productUrl(p),
    image: productImages(p),
    brand: { "@type": "Brand", name: BRAND.name },
    offers,
  };
  if (p.category?.name) data.category = p.category.name;
  if (colours.length) data.color = colours.join(", ");
  if (sizes.length) data.size = sizes.join(", ");
  if (p.fabric_specs?.fabric_composition) data.material = p.fabric_specs.fabric_composition;
  data.audience = { "@type": "PeopleAudience", suggestedGender: "female" };
  return data;
}

export function breadcrumbJsonLd(p: Product) {
  const items = [{ name: "Home", url: SITE_URL }];
  if (p.category) items.push({ name: p.category.name, url: `${SITE_URL}/category/${p.category.slug}` });
  items.push({ name: p.name, url: productUrl(p) });
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })),
  };
}

/** Safe inside a <script> tag: no "</script>" can close it early. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/**
 * A collection page for machines: the pieces on it, in the order shown.
 * Google reads this as a list of products and can show them as such; an AI
 * assistant reads it as "what this shop sells in this category".
 */
export function itemListJsonLd(products: Product[], name: string, url: string) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    url,
    numberOfItems: products.length,
    itemListElement: products.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: productUrl(p),
      name: p.name,
      ...(productImages(p)[0] ? { image: productImages(p)[0] } : {}),
    })),
  };
}

export function trailJsonLd(steps: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: steps.map((s, i) => ({ "@type": "ListItem", position: i + 1, name: s.name, item: s.url })),
  };
}
