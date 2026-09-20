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
