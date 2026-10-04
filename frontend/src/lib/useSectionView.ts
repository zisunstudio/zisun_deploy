"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/queries/analytics";

/**
 * Fire one `section_viewed` when a part of a page has actually been looked at.
 *
 * "Looked at" is a third of the section on screen for most of a second - a
 * section that flicks past in a fast scroll was not read by anybody. Once per
 * mount, so the console can say what share of visits reached each part of
 * the home page and where they stop.
 */
export function useSectionView<T extends HTMLElement = HTMLElement>(section: string, page = "home") {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(([entry]) => {
      // An empty section (no offers today) has no height and was not seen.
      if (entry.isIntersecting && el.offsetHeight > 0) {
        timer = setTimeout(() => { trackEvent("section_viewed", { section, page }); io.disconnect(); }, 800);
      } else if (timer) { clearTimeout(timer); timer = undefined; }
    }, { threshold: [0, 0.3], rootMargin: "0px" });
    io.observe(el);
    return () => { if (timer) clearTimeout(timer); io.disconnect(); };
  }, [section, page]);
  return ref;
}
