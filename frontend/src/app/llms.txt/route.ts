import { fetchAllProducts, REVALIDATE_SECONDS } from "@/lib/server/catalog";
import { plainDescription, productUrl, rupees, activeVariants, inStock } from "@/lib/structuredData";
import { BRAND, FOUNDER } from "@/lib/brand";
import { COMPANY, POLICY_TERMS, SITE_URL } from "@/lib/legal";
import { sortSizes } from "@/lib/colours";

/**
 * /llms.txt - ZISUN, described for AI assistants.
 *
 * A growing share of shoppers ask an assistant ("a cotton co-ord for office
 * under 1500") before they ask a search engine. Assistants read plain text
 * far better than an app shell. This is the whole shop in one page: who
 * makes it, how to buy, the policies that matter, and every live piece with
 * its price, sizes and link. Every line is built from the same data and
 * constants the site shows, so it cannot say something the site does not.
 */
export const revalidate = REVALIDATE_SECONDS;

export async function GET() {
  const products = await fetchAllProducts();
  const lines: string[] = [
    `# ${BRAND.name}`,
    "",
    `> ${BRAND.tagline} A small Indian women's clothing label from Bengaluru, founded and run by ${FOUNDER.name}. Kurtas and co-ord sets, stocked in small numbers.`,
    "",
    "## Buying",
    `- Order online at ${SITE_URL}: pay by UPI, card or netbanking (Razorpay), or cash on delivery on most pincodes.`,
    `- Shipping is free on orders paid online; Cash on Delivery orders carry a Rs ${POLICY_TERMS.codShippingRupees} shipping charge.`,
    `- Dispatched in ${POLICY_TERMS.dispatchTimeframe}. Exchanges: see ${SITE_URL}/refund.`,
    `- Fit: ${FOUNDER.name} photographs pieces on herself; she is ${FOUNDER.heightCm} cm, close to the average height of Indian women. Pieces she wears say so on their page.`,
    `- Contact: ${COMPANY.email}`,
    "",
    "## Pieces",
  ];
  for (const p of products) {
    const sizes = sortSizes(Array.from(new Set(activeVariants(p).filter((v) => v.stock > 0).map((v) => v.size?.trim()).filter(Boolean))) as string[]);
    const colours = Array.from(new Set(activeVariants(p).map((v) => v.color?.trim()).filter(Boolean)));
    const bits = [
      `Rs ${rupees(p.base_price).replace(/\.00$/, "")}`,
      p.category?.name,
      colours.length ? colours.join("/") : null,
      inStock(p) ? (sizes.length ? `sizes in stock: ${sizes.join(", ")}` : "in stock") : "sold out",
    ].filter(Boolean);
    lines.push(`- [${p.name}](${productUrl(p)}): ${bits.join("; ")}. ${plainDescription(p).slice(0, 240)}`);
  }
  lines.push("", "## More", `- Product feed: ${SITE_URL}/feeds/google.xml`, `- Sitemap: ${SITE_URL}/sitemap.xml`, `- Shipping: ${SITE_URL}/shipping`, `- Privacy: ${SITE_URL}/privacy`, "");
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": `public, max-age=${REVALIDATE_SECONDS}` } });
}
