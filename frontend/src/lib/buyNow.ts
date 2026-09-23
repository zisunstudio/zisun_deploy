/**
 * Buy now, and the details that make the second order one tap.
 *
 * Buy now is a separate lane from the bag. It carries exactly one piece to
 * checkout and leaves whatever is in the bag untouched: someone who has been
 * collecting three things and buys a fourth on impulse should not find the
 * first three gone, or paid for.
 *
 * The piece travels in sessionStorage, not the URL: a URL with a variant id
 * in it gets shared, and a friend opening it would land on a checkout for a
 * size she never chose. Session scope also means a stale express item never
 * outlives the tab it was chosen in.
 *
 * Every storage access is wrapped - private windows and blocked site data
 * throw, and a checkout must still work, just without the shortcut.
 */
import type { CartItem } from "@/store/useCartStore";

const EXPRESS_KEY = "zisun-buy-now";
const BUYER_KEY = "zisun-buyer";

export function setExpressItem(item: CartItem): void {
  try { sessionStorage.setItem(EXPRESS_KEY, JSON.stringify(item)); } catch { /* shortcut unavailable */ }
}

export function getExpressItem(): CartItem | null {
  try {
    const raw = sessionStorage.getItem(EXPRESS_KEY);
    if (!raw) return null;
    const item = JSON.parse(raw) as CartItem;
    return item && typeof item.id === "string" && item.quantity > 0 ? item : null;
  } catch {
    return null;
  }
}

export function clearExpressItem(): void {
  try { sessionStorage.removeItem(EXPRESS_KEY); } catch { /* nothing to clear */ }
}

/**
 * Who she is and where it goes, remembered on her own device after an order
 * succeeds - never before, so an abandoned form leaves nothing behind.
 *
 * This is what turns the second purchase into item → Pay: the address is
 * already there as a card with a "Change" link. It lives only in this
 * browser; nothing new is sent anywhere, and "Change" or a different phone
 * replaces it.
 */
export interface Buyer {
  name: string;
  phone: string;
  /** Optional: where the receipt goes. Older saved buyers have none. */
  email?: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
}

export function rememberBuyer(buyer: Buyer): void {
  try { localStorage.setItem(BUYER_KEY, JSON.stringify(buyer)); } catch { /* not remembered */ }
}

export function recallBuyer(): Buyer | null {
  try {
    const raw = localStorage.getItem(BUYER_KEY);
    if (!raw) return null;
    const b = JSON.parse(raw) as Buyer;
    return b && b.name && b.phone && b.line1 && b.pincode ? b : null;
  } catch {
    return null;
  }
}

/**
 * The day it should arrive, as a date she can picture rather than a count
 * of days. Dispatch (up to three days, per the shipping policy) plus the
 * courier's own estimate for her pincode. Deliberately the late end of the
 * range: an early parcel is a pleasure, a late one is a complaint.
 */
export function arrivalDate(courierDays: number | null | undefined, from = new Date()): string | null {
  if (!courierDays || courierDays <= 0) return null;
  const d = new Date(from);
  d.setDate(d.getDate() + 3 + courierDays);
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
