"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { settleTransition } from "@/lib/viewTransition";

/** Tells a running view transition that the new page has rendered. */
export function ViewTransitionSettler() {
  const pathname = usePathname();
  useEffect(() => {
    // One frame later, so the new page's first photograph has been laid out
    // before the browser captures it as the end of the morph.
    const id = requestAnimationFrame(() => settleTransition());
    return () => cancelAnimationFrame(id);
  }, [pathname]);
  return null;
}
