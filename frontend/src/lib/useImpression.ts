"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/queries/analytics";

/**
 * Fire one `product_impression` when a card is actually seen.
 *
 * Without this the catalogue has views and no denominator, so "6 views" cannot
 * become a click-through rate — and a product nobody wants looks exactly like a
 * product nobody reached. Impressions are the difference between those two, and
 * they are the one signal that cannot be backfilled: a day without them is a
 * day of attention data that is simply gone.
 *
 * Three things keep the volume honest rather than enormous:
 *
 *  - "Seen" means half the card visible for 600ms, not one pixel for one frame.
 *    A card that flicks past during a fast scroll was not shown to anybody.
 *  - It unobserves after firing, so one card is one impression per page, no
 *    matter how often it scrolls back into view.
 *  - A module-level set of ids already reported this page-load guards the case
 *    where the same product appears in two rails.
 */
const reported = new Set<string>();

/** Clears the per-page guard. Call on a route change if a page reuses cards. */
export function resetImpressions(): void {
  reported.clear();
}

export function useImpression(productId: string, context: string) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !productId) return;
    if (reported.has(productId)) return;
    // Older browsers, and any environment without the API, simply record no
    // impressions rather than breaking the page.
    if (typeof IntersectionObserver === "undefined") return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          timer = setTimeout(() => {
            if (reported.has(productId)) return;
            reported.add(productId);
            trackEvent("product_impression", { product_id: productId, context });
            observer.disconnect();
          }, 600);
        } else if (timer) {
          // Scrolled away before it counted.
          clearTimeout(timer);
          timer = undefined;
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [productId, context]);

  return ref;
}
