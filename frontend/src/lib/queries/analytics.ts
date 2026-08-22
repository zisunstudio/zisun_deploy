"use client";

import { API_V1 } from "@/lib/apiBase";

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
  _queue.push({ event_type, session_id: sessionId(), properties });
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(flush, 10_000);
}

// Flush on page unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", flush);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}
