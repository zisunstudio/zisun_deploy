import { fetchAllProducts, REVALIDATE_SECONDS } from "@/lib/server/catalog";
import { activeVariants, plainDescription, productImages, productUrl, rupees } from "@/lib/structuredData";
import { BRAND } from "@/lib/brand";
import { SITE_URL } from "@/lib/legal";

/**
 * The product feed, for Google Merchant Center (free Shopping listings in
 * India) and any other shopping surface that reads a Google-format feed.
 *
 * One item per size and colour, grouped by piece, so Shopping can show the
 * sizes she can actually buy. Availability is the variant's real stock at
 * the moment the feed was built (at most five minutes old). Shipping is
 * declared at 0: the standard way to buy is paying online, which ships
 * free. Cash on Delivery adds a charge (shipping policy, services/pricing).
 *
 * Submit https://zisun.in/feeds/google.xml in Merchant Center as a
 * scheduled fetch.
 */
export const revalidate = REVALIDATE_SECONDS;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function GET() {
  const products = await fetchAllProducts();
  const items: string[] = [];
  for (const p of products) {
    const images = productImages(p);
    if (images.length === 0) continue; // Shopping rejects an item without an image
    const description = plainDescription(p).slice(0, 4900);
    for (const v of activeVariants(p)) {
      const title = [p.name, v.color?.trim(), v.size?.trim() ? `Size ${v.size.trim()}` : null].filter(Boolean).join(" · ");
      items.push(`    <item>
      <g:id>${esc(v.id)}</g:id>
      <g:item_group_id>${esc(p.id)}</g:item_group_id>
      <title>${esc(title.slice(0, 150))}</title>
      <description>${esc(description)}</description>
      <link>${esc(productUrl(p))}</link>
      <g:image_link>${esc(images[0])}</g:image_link>
${images.slice(1, 10).map((u) => `      <g:additional_image_link>${esc(u)}</g:additional_image_link>`).join("\n")}
      <g:availability>${v.stock > 0 ? "in_stock" : "out_of_stock"}</g:availability>
      <g:price>${rupees(p.base_price + v.price_delta)} INR</g:price>
      <g:brand>${esc(BRAND.name)}</g:brand>
      <g:condition>new</g:condition>
      <g:identifier_exists>no</g:identifier_exists>
      <g:google_product_category>Apparel &amp; Accessories &gt; Clothing</g:google_product_category>
      ${p.category?.name ? `<g:product_type>${esc(p.category.name)}</g:product_type>` : ""}
      <g:gender>female</g:gender>
      <g:age_group>adult</g:age_group>
      ${v.color?.trim() ? `<g:color>${esc(v.color.trim())}</g:color>` : ""}
      ${v.size?.trim() ? `<g:size>${esc(v.size.trim())}</g:size>` : ""}
      ${p.fabric_specs?.fabric_composition ? `<g:material>${esc(p.fabric_specs.fabric_composition)}</g:material>` : ""}
      <g:shipping><g:country>IN</g:country><g:price>0.00 INR</g:price></g:shipping>
    </item>`);
    }
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${esc(BRAND.name)}</title>
    <link>${SITE_URL}</link>
    <description>${esc(`${BRAND.name} - ${BRAND.tagline}`)}</description>
${items.join("\n")}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": `public, max-age=${REVALIDATE_SECONDS}` } });
}
