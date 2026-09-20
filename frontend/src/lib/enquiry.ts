"use client";
import { API_V1 } from "@/lib/apiBase";
import { trackEvent } from "@/lib/queries/analytics";

/**
 * A tap on a WhatsApp link is the storefront's sale, while checkout is
 * closed. It is recorded twice, on purpose: as an analytics event (the
 * funnel) and as a row in the enquiries ledger (the founder's order book,
 * where she marks what became of it).
 *
 * sendBeacon, because the tap opens WhatsApp in a new tab and the page may
 * be backgrounded before a fetch completes. Nothing here waits; the link
 * proceeds whether or not the record lands.
 */
export type EnquirySource = "bag" | "product" | "sheet" | "fab" | "footer" | "community";

export interface EnquiryPayload {
  source: EnquirySource;
  product_id?: string | null;
  variant_id?: string | null;
  product_name?: string | null;
  size?: string | null;
  colour?: string | null;
  quantity?: number;
  total_paise?: number;
  items?: Array<{ product_id?: string | null; name: string; size?: string | null; colour?: string | null; quantity: number; price_paise: number }>;
}

function sessionId(): string | undefined {
  try { return sessionStorage.getItem("zisun-session-id") ?? undefined; } catch { return undefined; }
}

export function recordEnquiry(payload: EnquiryPayload): void {
  if (typeof window === "undefined") return;
  trackEvent("whatsapp_enquiry", { ...payload, items: undefined, item_count: payload.items?.length });
  const body = JSON.stringify({ ...payload, session_id: sessionId() });
  try {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon && navigator.sendBeacon(`${API_V1}/enquiries`, blob)) return;
  } catch { /* fall through */ }
  fetch(`${API_V1}/enquiries`, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
}

/**
 * Where a product page was opened from. Set by whoever navigates - a card,
 * the hero, a deal - and read once by the product page, so an open can be
 * compared with the impressions of the surface that produced it. Opens with
 * no source (a shared link, a search result, the back button) are "direct".
 */
export function markOpenSource(source: "card" | "hero" | "deal" | "search" | "category"): void {
  try { sessionStorage.setItem("zisun.open_source", source); } catch { /* ignore */ }
}
export function takeOpenSource(): string {
  try {
    const s = sessionStorage.getItem("zisun.open_source");
    sessionStorage.removeItem("zisun.open_source");
    return s ?? "direct";
  } catch { return "direct"; }
}
