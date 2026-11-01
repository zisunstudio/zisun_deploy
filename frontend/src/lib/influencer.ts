"use client";

/**
 * The influencer whose link a visitor last tapped, kept for 30 days.
 *
 * Her link is `zisun.in/r/<code>`, which lands on her collection with
 * `?inf=<code>`. That parameter is read here on whichever page it arrives,
 * stored, and then removed from the address bar - so a refresh, a back
 * button or a copied URL does not count as another tap, and a customer
 * who forwards the page does not forward the influencer's credit.
 *
 * The latest link wins (unlike channel attribution, which keeps the first
 * touch): the post she acted on most recently is the one that sold it. The
 * server makes the final decision - her discount code beats any link, the
 * code must belong to an active influencer, and the tap must be inside the
 * window (`INFLUENCER_WINDOW_DAYS`, services/influencer.py).
 *
 * Nothing here identifies the customer: a code and a time.
 */
import { trackEvent } from "@/lib/queries/analytics";

const KEY = "zisun-influencer";
export const WINDOW_DAYS = 30;
const CODE_RE = /^[a-z0-9][a-z0-9-]{1,29}$/;

type Stored = { code: string; at: string };

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    if (!s?.code || !s.at || Date.now() - Date.parse(s.at) > WINDOW_DAYS * 86_400_000) {
      localStorage.removeItem(KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

/** Read `?inf=` from the address, keep it, count the tap once, tidy the URL. */
export function captureInfluencer(): void {
  if (typeof window === "undefined") return;
  let url: URL;
  try { url = new URL(window.location.href); } catch { return; }
  const raw = (url.searchParams.get("inf") || "").trim().toLowerCase();
  if (!raw) return;
  url.searchParams.delete("inf");
  try { window.history.replaceState(window.history.state, "", url.pathname + (url.search || "") + url.hash); } catch { /* old browser */ }
  if (!CODE_RE.test(raw)) return;
  try { localStorage.setItem(KEY, JSON.stringify({ code: raw, at: new Date().toISOString() })); } catch { /* private mode */ }
  // After it is stored, so the click itself carries her code.
  trackEvent("influencer_click", { path: url.pathname });
}

/** Her code, while the window is open. Every analytics event carries it. */
export function currentInfluencer(): string | null {
  if (typeof window === "undefined") return null;
  return read()?.code ?? null;
}

/** What the order sends; the server checks both. */
export function influencerForOrder(): { influencer?: string; influencer_clicked_at?: string } {
  const s = typeof window === "undefined" ? null : read();
  return s ? { influencer: s.code, influencer_clicked_at: s.at } : {};
}
