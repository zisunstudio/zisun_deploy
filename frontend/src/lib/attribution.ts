"use client";

/**
 * Where a visitor came from, captured once and remembered.
 *
 * Nothing recorded this before: every visit was anonymous and un-sourced, so
 * "Instagram is an important channel" was a belief the site could not check.
 * A UTM tag or a referring domain is only present on the *first* page of a
 * visit - one internal click and it is gone - so it is read immediately and
 * kept.
 *
 * First touch wins and is never overwritten: the post that introduced ZISUN
 * deserves the credit, not the direct visit a week later that happened to be
 * the last click. `landing` and `visitor` live in localStorage so a returning
 * visitor is recognisable; `session` stays in sessionStorage.
 *
 * Nothing here identifies a person. It is a random id, a source name and a
 * referring domain - never the full referring URL, which can carry a search
 * query or a private profile path.
 */
const FIRST_KEY = "zisun-first-touch";
const VISITOR_KEY = "zisun-visitor-id";

export interface Attribution {
  source: string;            // "instagram" | "google" | "direct" | utm_source
  medium: string | null;     // utm_medium, or "referral" / "organic"
  campaign: string | null;
  content: string | null;    // utm_content - which post or creative
  referrer_domain: string | null;
  landed_at: string;
}

/** Known hosts, so a referrer becomes a channel name rather than a domain. */
const HOSTS: Array<[RegExp, string]> = [
  [/(^|\.)instagram\.com$/i, "instagram"],
  [/(^|\.)l\.instagram\.com$/i, "instagram"],
  [/(^|\.)facebook\.com$|(^|\.)fb\.me$/i, "facebook"],
  [/(^|\.)google\./i, "google"],
  [/(^|\.)bing\.com$|(^|\.)duckduckgo\.com$/i, "search"],
  [/(^|\.)pinterest\./i, "pinterest"],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/i, "youtube"],
  [/(^|\.)whatsapp\.com$|(^|\.)wa\.me$/i, "whatsapp"],
  [/(^|\.)chatgpt\.com$|(^|\.)openai\.com$|(^|\.)perplexity\.ai$|(^|\.)claude\.ai$/i, "ai-search"],
  [/(^|\.)t\.co$|(^|\.)x\.com$|(^|\.)twitter\.com$/i, "x"],
];

function channelFor(host: string): string {
  for (const [re, name] of HOSTS) if (re.test(host)) return name;
  return "referral";
}

function read<T>(key: string, storage: "local" | "session"): T | null {
  try {
    const s = storage === "local" ? localStorage : sessionStorage;
    const raw = s.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;   // private mode; attribution is never worth breaking a page
  }
}

function write(key: string, value: unknown, storage: "local" | "session"): void {
  try {
    (storage === "local" ? localStorage : sessionStorage).setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/** A stable id for this browser, so new and returning visits are separable. */
export function visitorId(): string {
  if (typeof window === "undefined") return "ssr";
  const existing = read<string>(VISITOR_KEY, "local");
  if (existing) return existing;
  const fresh =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `v-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  write(VISITOR_KEY, fresh, "local");
  return fresh;
}

/** True when this browser has been here before today's visit began. */
export function isReturning(): boolean {
  if (typeof window === "undefined") return false;
  return read<string>(VISITOR_KEY, "local") !== null && read<Attribution>(FIRST_KEY, "local") !== null;
}

/**
 * Read the URL and referrer, keep the first touch, return it.
 *
 * Safe to call on every page: after the first call it only reads storage.
 */
export function captureAttribution(): Attribution | null {
  if (typeof window === "undefined") return null;

  const existing = read<Attribution>(FIRST_KEY, "local");
  if (existing) return existing;

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    return null;
  }
  const utmSource = params.get("utm_source");
  const utmMedium = params.get("utm_medium");

  let referrerDomain: string | null = null;
  try {
    if (document.referrer) {
      const host = new URL(document.referrer).hostname;
      // Our own pages are not a source.
      if (host && host !== window.location.hostname) referrerDomain = host;
    }
  } catch {
    /* malformed referrer */
  }

  const source =
    (utmSource || "").trim().toLowerCase() ||
    (referrerDomain ? channelFor(referrerDomain) : "direct");

  const first: Attribution = {
    source,
    medium: (utmMedium || "").trim().toLowerCase() || (referrerDomain ? "referral" : null),
    campaign: (params.get("utm_campaign") || "").trim().toLowerCase() || null,
    content: (params.get("utm_content") || "").trim().toLowerCase() || null,
    referrer_domain: referrerDomain,
    landed_at: new Date().toISOString(),
  };
  write(FIRST_KEY, first, "local");
  return first;
}

/** The fields every analytics event and every order carries. */
export function attributionFields(): Record<string, string | null> {
  const a = captureAttribution();
  return {
    source: a?.source ?? null,
    medium: a?.medium ?? null,
    campaign: a?.campaign ?? null,
    content: a?.content ?? null,
    referrer_domain: a?.referrer_domain ?? null,
  };
}
