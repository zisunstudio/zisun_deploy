"use client";

import { API_V1 } from "@/lib/apiBase";
import { attributionFields, isReturning, visitorId } from "@/lib/attribution";

type AnalyticsEvent = {
  event_type: string;
  session_id?: string;
  properties?: Record<string, unknown>;
};

let _queue: AnalyticsEvent[] = [];
let _timer: ReturnType<typeof setTimeout> | null = null;
/**
 * One id per browser session.
 *
 * This used to be a module-level constant. Node has had `crypto` globally
 * since 18, so on the server it produced a fresh uuid on every render, and the
 * value never reached the browser anyway — every event carried a different
 * "session", which makes any session-based metric meaningless.
 *
 * Generated lazily on first use in the browser and kept in sessionStorage, so
 * it survives navigation within a tab and ends when the tab does.
 */
function sessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = sessionStorage.getItem("zisun-session-id");
    if (existing) return existing;
    const fresh =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem("zisun-session-id", fresh);
    return fresh;
  } catch {
    // Private mode can throw on sessionStorage; a per-call id is still better
    // than a per-render one, and analytics must never break the page.
    return "no-storage";
  }
}

function flush() {
  if (_queue.length === 0) return;
  const events = _queue.splice(0);
  // Fire-and-forget — never block the UI
  fetch(`${API_V1}/analytics/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
    keepalive: true,
  }).catch(() => {});
}

export function trackEvent(event_type: string, properties: Record<string, unknown> = {}) {
  // Every event carries where this visitor came from and whether she has been
  // here before. Without it the funnel could say what happened but never for
  // whom, so no channel could be judged by anything except raw traffic.
  _queue.push({
    event_type,
    session_id: sessionId(),
    // Attribution is spread last and owns `source`, `medium`, `campaign`,
    // `content` and `referrer_domain`. An event must never use those names
    // for anything else - they will be overwritten (see `opened_from`).
    properties: { ...properties, ...attributionFields(), visitor: visitorId(), returning: isReturning() },
  });
  // Three seconds, not ten: most visits from a reel are shorter than ten
  // seconds, and an in-app browser that is swiped away does not always fire
  // the events the unload flush below relies on.
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(flush, 3_000);
}

/** Send what is queued now - for the moment a page is being left. */
export function flushEvents(): void {
  if (_timer) { clearTimeout(_timer); _timer = null; }
  flush();
}

// Flush on page unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", flush);
  window.addEventListener("pagehide", flush);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}
