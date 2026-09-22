/**
 * Pre-launch browse-only mode.
 *
 * Mirrors the backend's LAUNCH_MODE=browse. The server is the enforcement —
 * every ordering endpoint 503s regardless of what the UI renders — so this
 * flag exists purely so a customer never taps a button that fails.
 *
 * Read at BUILD time, not from the API: the flag decides whether "Add to Cart"
 * ever paints. Fetching it would render the button, then snatch it away a
 * moment later, which is a worse experience than not offering it at all.
 * Changing it therefore needs a frontend REBUILD, not a restart.
 */
export const BROWSE_ONLY =
  (process.env.NEXT_PUBLIC_LAUNCH_MODE ?? "").trim().toLowerCase() === "browse";

/** Digits only, with country code, e.g. 919876543210. */
// Set NEXT_PUBLIC_WHATSAPP_NUMBER explicitly, or there is no 1:1 chat.
//
// This used to fall back to COMPANY.phone, which is how the founder's
// personal mobile ended up behind every WhatsApp button on the site without
// anyone choosing it. A published contact channel is now always a deliberate
// configuration, never inherited: when neither this nor the group URL is
// set, the button does not render at all.
const WHATSAPP_NUMBER = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");

export const HAS_WHATSAPP = WHATSAPP_NUMBER.length > 0;

/**
 * The "ZISUN Tales" community group the founder already runs on WhatsApp.
 * Used as the destination when no 1:1 number is configured, and offered on
 * its own as "join the community" — it is where she posts drops, fabric
 * details and asks what to make next, so it is a real place to send people.
 */
const WHATSAPP_GROUP_URL = (process.env.NEXT_PUBLIC_WHATSAPP_GROUP_URL ?? "").trim();
export const HAS_WHATSAPP_GROUP = /^https:\/\/chat\.whatsapp\.com\//.test(WHATSAPP_GROUP_URL);
export const WHATSAPP_GROUP_HREF = HAS_WHATSAPP_GROUP ? WHATSAPP_GROUP_URL : null;

/** Somewhere on WhatsApp a visitor can actually reach ZISUN. */
export const HAS_ANY_WHATSAPP = HAS_WHATSAPP || HAS_WHATSAPP_GROUP;

/**
 * A private 1:1 chat with a message already written, or null.
 *
 * Never falls back to the community group: this is for things a customer
 * would not say in front of others - a size question above all.
 */
export function whatsappPrivateUrl(text: string): string | null {
  if (!HAS_WHATSAPP) return null;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

/** Best available WhatsApp destination: 1:1 chat if configured, else the group. */
export function whatsappContactUrl(productName?: string): string | null {
  return whatsappOrderUrl(productName) ?? WHATSAPP_GROUP_HREF;
}

/**
 * wa.me deep link, pre-filled with what the customer is looking at — without
 * it they land in an empty chat and have to describe the product themselves.
 */
export function whatsappOrderUrl(productName?: string): string | null {
  if (!HAS_WHATSAPP) return null;
  const text = productName
    ? `Hi ZISUN — I'd like to order "${productName}".`
    : "Hi ZISUN — I'd like to place an order.";
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

/**
 * The bag, as a WhatsApp message Sushmita can answer.
 *
 * While checkout is closed this IS the order form: every line, size and
 * colour, the total, and a link per piece so she can open it on her phone.
 * Ends with the two things she needs to ask anyway. Null when there is no
 * number to send it to.
 */
export function whatsappCartUrl(
  items: Array<{ name: string; size?: string; color?: string; quantity: number; price: number; productId?: string }>,
  totalRupees: number,
  origin = "https://zisun.in",
): string | null {
  if (!HAS_WHATSAPP || items.length === 0) return null;
  const lines = items.map((i) => {
    // Trimmed: colours entered before the palette picker can carry stray
    // whitespace, and "(Size S, Purple )" in a message to a customer is the
    // kind of detail that reads as carelessness.
    const bits = [i.size && `Size ${i.size.trim()}`, i.color?.trim()].filter(Boolean).join(", ");
    return `• ${i.name}${bits ? ` (${bits})` : ""} × ${i.quantity} — ₹${(i.price * i.quantity).toLocaleString("en-IN")}${i.productId ? `\n  ${origin}/product/${i.productId}` : ""}`;
  });
  const text = [
    "Hi ZISUN — I'd like to order:",
    ...lines,
    `Total: ₹${totalRupees.toLocaleString("en-IN")}`,
    "",
    "My name and delivery pincode:",
  ].join("\n");
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}
