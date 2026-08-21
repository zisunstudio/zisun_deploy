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
