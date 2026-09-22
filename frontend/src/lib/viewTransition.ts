/**
 * Navigation that moves like an app.
 *
 * Uses the browser's own View Transitions API: the old page is captured,
 * the new one is rendered, and the browser animates between them on the
 * compositor - no animation library, nothing on the main thread. A tapped
 * product photograph grows into the product page's first photograph
 * instead of the screen blinking to a new page; Buy now lifts checkout up
 * from below.
 *
 * Only ever one named element per transition. The photo is named at the
 * moment of the tap (a piece can appear twice on the home page - in the
 * drop and in a deal - and two elements with the same name abort the
 * transition). Where the API is missing, or the visitor prefers reduced
 * motion, this is exactly router.push.
 *
 * The App Router has no hook for "the new page has rendered", so the
 * transition waits for the pathname to change (ViewTransitionSettler) and
 * gives up after 1.2 s rather than freeze on a slow network.
 */
type Router = { push: (href: string) => void };
type Kind = "morph" | "up";

export const HERO_NAME = "product-hero";

let pending: (() => void) | null = null;

export function settleTransition(): void {
  const done = pending;
  pending = null;
  done?.();
}

export function navigate(router: Router, href: string, opts: { from?: HTMLElement | null; kind?: Kind } = {}): void {
  const doc = document as Document & { startViewTransition?: (cb: () => Promise<void>) => { finished: Promise<void> } };
  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || reduce) { router.push(href); return; }

  const root = document.documentElement;
  if (opts.kind === "up") root.dataset.vt = "up";
  if (opts.from) opts.from.style.viewTransitionName = HERO_NAME;

  try {
    const t = doc.startViewTransition(() => new Promise<void>((resolve) => {
      pending = resolve;
      router.push(href);
      window.setTimeout(() => { if (pending === resolve) settleTransition(); }, 1200);
    }));
    t.finished.finally(() => {
      delete root.dataset.vt;
      if (opts.from) opts.from.style.viewTransitionName = "";
    });
  } catch {
    delete root.dataset.vt;
    router.push(href);
  }
}
