"use client";

type AnalyticsEvent = {
  event_type: string;
  session_id?: string;
  properties?: Record<string, unknown>;
};

let _queue: AnalyticsEvent[] = [];
let _timer: ReturnType<typeof setTimeout> | null = null;
const SESSION_ID = typeof crypto !== "undefined" ? crypto.randomUUID() : "ssr";

function flush() {
  if (_queue.length === 0) return;
  const events = _queue.splice(0);
  // Fire-and-forget — never block the UI
  fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/analytics/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
    keepalive: true,
  }).catch(() => {});
}

export function trackEvent(event_type: string, properties: Record<string, unknown> = {}) {
  _queue.push({ event_type, session_id: SESSION_ID, properties });
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
