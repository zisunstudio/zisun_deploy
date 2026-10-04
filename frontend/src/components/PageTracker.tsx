"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { captureAttribution } from "@/lib/attribution";
import { flushEvents, trackEvent } from "@/lib/queries/analytics";
import { resetImpressions } from "@/lib/useImpression";

/**
 * Records that someone arrived, how long she stayed, how far she read and
 * what she tapped - on every storefront page.
 *
 * Before this, nothing was recorded on arrival. A visit existed only once a
 * product card had sat on screen or a piece had been opened, so a woman who
 * landed, looked at the first screen and left was never counted, and the UTM
 * tags on her link were read only if some later event happened to fire -
 * after one internal click they are gone from the URL.
 *
 *  - `page_view`    on every route. Attribution is captured first, from the
 *                   landing URL, before anything else can navigate away.
 *  - `page_engaged` once per page, when she leaves it or hides the tab:
 *                   seconds the page was actually visible and the furthest
 *                   she scrolled. Sent once, at the first leave - an
 *                   under-count for someone who comes back to the tab, never
 *                   an over-count.
 *  - `cta_click`    for a tap on anything carrying `data-track="name"`.
 *
 * It measures; it never profiles. No text she types, no coordinates, no
 * element contents - a page kind, two numbers and a button's name.
 * The console is not tracked.
 */
export function pageKind(path: string): string {
  if (path === "/") return "home";
  const first = path.split("/")[1] ?? "";
  if (first === "product") return "product";
  if (first === "journal") return path.split("/").length > 2 ? "article" : "journal";
  if (["privacy", "terms", "refund", "shipping", "contact", "share"].includes(first)) return first === "share" ? "share" : "policy";
  if (["shop", "category", "search", "checkout", "order", "orders", "login", "profile", "wishlist"].includes(first)) return first;
  return "other";
}

export function PageTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;
    captureAttribution();
    resetImpressions();
    const page = pageKind(pathname);
    let landing = false;
    try {
      landing = !sessionStorage.getItem("zisun-landed");
      sessionStorage.setItem("zisun-landed", "1");
    } catch { /* private mode: every page reads as not-landing */ }
    trackEvent("page_view", { page, path: pathname, landing });

    let visibleSince: number | null = document.visibilityState === "visible" ? Date.now() : null;
    let visibleMs = 0;
    let maxScroll = 0;
    let sent = false;

    // Pages scroll either the window or an inner region (the app-shell
    // pages). Listening in the capture phase hears both; a sideways rail has
    // no vertical travel and is ignored.
    const onScroll = (e: Event) => {
      const t = e.target;
      let top = 0, travel = 0;
      if (t === document || t === document.documentElement || t === document.body) {
        top = window.scrollY;
        travel = document.documentElement.scrollHeight - window.innerHeight;
      } else if (t instanceof HTMLElement && t.clientHeight >= window.innerHeight * 0.6) {
        top = t.scrollTop;
        travel = t.scrollHeight - t.clientHeight;
      }
      if (travel > 40) maxScroll = Math.max(maxScroll, Math.min(100, Math.round((top / travel) * 100)));
    };
    const pause = () => {
      if (visibleSince !== null) { visibleMs += Date.now() - visibleSince; visibleSince = null; }
    };
    const send = () => {
      if (sent) return;
      sent = true;
      pause();
      trackEvent("page_engaged", { page, path: pathname, seconds: Math.round(visibleMs / 1000), scroll_pct: maxScroll });
      flushEvents();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") send();
      else if (visibleSince === null) visibleSince = Date.now();
    };
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-track]");
      const name = el?.getAttribute("data-track");
      if (name) trackEvent("cta_click", { name, page });
    };

    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", send);
    document.addEventListener("click", onClick, { capture: true });
    return () => {
      send();
      document.removeEventListener("scroll", onScroll, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", send);
      document.removeEventListener("click", onClick, { capture: true });
    };
  }, [pathname]);

  return null;
}
