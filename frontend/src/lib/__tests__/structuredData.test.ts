import { describe, expect, it } from "vitest";
import { breadcrumbJsonLd, inStock, jsonLdString, productJsonLd, rupees } from "@/lib/structuredData";
import type { Product } from "@/lib/queries/catalog";

const base = {
  id: "774f350f-4fcc-4535-b9ec-c1ffe7d277ab", name: "Purple Rose Co-ord Set", description: "Two pieces.", base_price: 103900,
  category_id: "c1", category: { id: "c1", name: "Co-ord Sets", slug: "co-ord-sets", image_url: null, description: null, is_active: true, product_count: 1 },
  is_active: true, created_at: "", updated_at: "",
  media: [{ id: "m1", url: "https://cdn/x.jpg", cdn_url: null, type: "IMAGE", display_order: 0 }],
  variants: [
    { id: "v1", sku: "a", size: "M", color: "Purple", stock: 0, price_delta: 0, is_active: true, version: 1 },
    { id: "v2", sku: "b", size: "XL", color: "Purple", stock: 2, price_delta: 0, is_active: true, version: 1 },
  ],
  fabric_specs: { fabric_composition: "Vartican silk" },
} as unknown as Product;

describe("productJsonLd", () => {
  it("states the real price in rupees and INR", () => {
    const d = productJsonLd(base) as any;
    expect(d.offers.price).toBe("1039.00");
    expect(d.offers.priceCurrency).toBe("INR");
  });
  it("is in stock when any active size has stock, out when none does", () => {
    expect((productJsonLd(base) as any).offers.availability).toBe("https://schema.org/InStock");
    const sold = { ...base, variants: base.variants.map((v) => ({ ...v, stock: 0 })) } as Product;
    expect(inStock(sold)).toBe(false);
    expect((productJsonLd(sold) as any).offers.availability).toBe("https://schema.org/OutOfStock");
  });
  it("uses the recorded fabric, never a brand-level guess", () => {
    expect((productJsonLd(base) as any).material).toBe("Vartican silk");
  });
  it("declares free shipping to India", () => {
    expect((productJsonLd(base) as any).offers.shippingDetails.shippingRate.value).toBe("0");
  });
  it("becomes an AggregateOffer when sizes are priced differently", () => {
    const tiered = { ...base, variants: [base.variants[0], { ...base.variants[1], price_delta: 10000 }] } as Product;
    const d = productJsonLd(tiered) as any;
    expect(d.offers["@type"]).toBe("AggregateOffer");
    expect([d.offers.lowPrice, d.offers.highPrice]).toEqual(["1039.00", "1139.00"]);
  });
});

describe("helpers", () => {
  it("rupees formats paise", () => expect(rupees(99900)).toBe("999.00"));
  it("breadcrumbs run Home > category > piece", () => {
    expect(breadcrumbJsonLd(base).itemListElement.map((i: any) => i.name)).toEqual(["Home", "Co-ord Sets", "Purple Rose Co-ord Set"]);
  });
  it("cannot be closed early by a </script> in a description", () => {
    expect(jsonLdString({ d: "</script><script>x" })).not.toContain("</script>");
  });
});
