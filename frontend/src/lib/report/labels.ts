/**
 * The words the console and the downloadable report use for things a
 * developer named: traffic sources ("fb"), page kinds ("product"), home-page
 * sections ("receipts") and buttons ("fit_find_size"). One list, so the
 * board on screen and the report she sends to someone say the same thing.
 */

export const PAGE: Record<string, string> = {
  home: "Home page", product: "A piece's page", shop: "The collection", category: "A category", search: "Search",
  journal: "Journal", article: "A journal article", checkout: "Checkout", order: "Order tracking", orders: "Her orders",
  login: "Sign-in", profile: "Her account", wishlist: "Wishlist", policy: "A policy page", share: "Sharing ZISUN", other: "Another page",
};
export const SECTION: Record<string, string> = {
  hero: "Opening photo", stories: "Story circles", drop: "The drop (swipe row)", offers: "Offers and coupons",
  fit: "The fit, 153 cm", ways: "Ways to wear", receipts: "Prices and delivery", mark: "ZISUN mark", ask: "Ask Sushmita",
};
export const CLICK: Record<string, string> = {
  hero_cta: "\"Swipe the drop\" button", hero_piece: "The piece named on the opening photo", drop_swipe: "Swiped the drop row",
  drop_swipe_to_end: "Swiped to the last piece", drop_see_all: "\"See all\"", fit_find_size: "\"Find your size\"",
  receipts_shipping: "Shipping policy link", receipts_exchange: "Exchange policy link", ask_whatsapp: "\"Message on WhatsApp\"",
  nav_search: "Search icon", nav_account: "Account icon", nav_bag: "Bag icon", nav_everything: "\"Everything\" link",
  share_whatsapp: "Shared her code on WhatsApp", share_copy: "Copied her code link", share_terms: "\"How sharing works\"",
};
export const label = (map: Record<string, string>, k: string) => map[k] ?? k.replace(/_/g, " ");

/**
 * A traffic source in words she would use. The stored value is whatever
 * the link or the ad said - "fb", "ig", "l.instagram.com" - and the panel
 * used to print it as is, which is how "Fb" and "Hero" reached the founder.
 */
export const SOURCE_NAMES: Record<string, string> = {
  fb: "Facebook", facebook: "Facebook", "facebook.com": "Facebook", "m.facebook.com": "Facebook", meta: "Facebook",
  ig: "Instagram", instagram: "Instagram", "instagram.com": "Instagram", "l.instagram.com": "Instagram",
  google: "Google", "google.com": "Google", "google.co.in": "Google",
  whatsapp: "WhatsApp", wa: "WhatsApp", "wa.me": "WhatsApp",
  youtube: "YouTube", "youtube.com": "YouTube", yt: "YouTube",
  pinterest: "Pinterest", "pinterest.com": "Pinterest", "in.pinterest.com": "Pinterest",
  bing: "Bing", "bing.com": "Bing", chatgpt: "ChatGPT", "chatgpt.com": "ChatGPT",
  direct: "Typed in or saved link",
  "not recorded": "Before tracking started",
};
export const SOURCE_NOTES: Record<string, string> = {
  direct: "They typed zisun.in, used a bookmark, or tapped a link that did not say where it came from (a WhatsApp forward often looks like this).",
  "not recorded": "Visits from before 23 Sept, when the site started noting where each visitor came from. Unknown, not direct.",
};
export function sourceName(raw: string): string {
  const k = raw.toLowerCase().trim();
  if (SOURCE_NAMES[k]) return SOURCE_NAMES[k];
  const host = k.replace(/^(www|m|l|lm)\./, "");
  if (SOURCE_NAMES[host]) return SOURCE_NAMES[host];
  const word = host.replace(/\.(com|in|co\.in|net|org)$/, "");
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export type SourceRow = { source: string; orders: number; collected_paise: number; committed_paise: number; sessions: number; visitors: number; conversion: number | null };
/** "fb" and "facebook" are one channel; show one row, largest first. */
export function mergeSources(rows: SourceRow[]): SourceRow[] {
  const by = new Map<string, SourceRow>();
  for (const r of rows) {
    const name = sourceName(r.source);
    const m = by.get(name);
    if (!m) { by.set(name, { ...r }); continue; }
    m.sessions += r.sessions; m.visitors += r.visitors; m.orders += r.orders;
    m.collected_paise += r.collected_paise; m.committed_paise += r.committed_paise;
    m.conversion = m.sessions ? m.orders / m.sessions : null;
  }
  return Array.from(by.values()).sort((a, b) => b.sessions - a.sessions);
}

