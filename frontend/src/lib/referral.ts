/**
 * A friend's code, carried from the link she shared to the checkout.
 *
 * A shared link looks like zisun.in/product/…?ref=PRIYA482. The code is
 * read on whichever page the visitor lands, kept in this browser for 30
 * days, and filled into the checkout's code box - where it is checked
 * before anything is placed, so a stale or used code only ever shows a
 * sentence and never stops a sale. Unlike attribution (first touch wins),
 * the latest link wins: the friend who sent the most recent one is the one
 * she is acting on.
 */
/**
 * The terms as the public page states them. Mirrors backend
 * `app/services/referral.py` (BUYER_DISCOUNT_PAISE, REFERRER_REWARD_PAISE,
 * MIN_ORDER_PAISE, HOLD_DAYS), which is the enforcement; a unit test there
 * and one here would not see each other, so change both together.
 */
export const REFERRAL_TERMS = {
  friendOffRupees: 100,
  thankYouRupees: 150,
  minOrderRupees: 500,
  holdDays: 14,
} as const;

const KEY = "zisun-ref";
const TTL_MS = 30 * 86_400_000;

export function captureReferral(): void {
  try {
    const code = new URL(window.location.href).searchParams.get("ref");
    if (code && /^[A-Za-z0-9]{4,20}$/.test(code)) {
      localStorage.setItem(KEY, JSON.stringify({ code: code.toUpperCase(), at: Date.now() }));
    }
  } catch { /* private mode, or no window */ }
}

export function storedReferral(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { code, at } = JSON.parse(raw) as { code: string; at: number };
    if (!code || Date.now() - at > TTL_MS) { localStorage.removeItem(KEY); return null; }
    return code;
  } catch {
    return null;
  }
}

export function clearReferral(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing kept */ }
}

/** The link she shares: any page of the shop, with her code on it. */
export function shareUrl(code: string, origin = "https://zisun.in"): string {
  return `${origin}/?ref=${encodeURIComponent(code)}`;
}

/** A WhatsApp message with her code and the link, ready to send to anyone. */
export function shareWhatsAppUrl(code: string, friendOffRupees: number, origin?: string): string {
  // Her words to a friend, not ours to a market: what it is, what the code
  // does, the link. No exclamation, no "hurry".
  const text = `I bought this from ZISUN and liked it. If you order, my code ${code} takes ₹${friendOffRupees} off your first one: ${shareUrl(code, origin)}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
