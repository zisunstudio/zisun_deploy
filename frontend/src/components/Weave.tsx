"use client";
import { useEffect, useMemo, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { designWeave, drawWeave, rippling, type Ripple, type WeaveSpec } from "@/lib/weave";

/**
 * A cloth, woven in front of the visitor.
 *
 * Two ways of weaving:
 *  - `scroll`: the weft advances with the page, so the visitor weaves the
 *    cloth by scrolling and unweaves it by scrolling back. It is the one
 *    scroll-linked thing on the site and it is spent here because the
 *    metaphor is exact - her thumb is the shuttle.
 *  - `enter`: weaves itself once, when it first comes into view.
 *
 * Either way it then answers a touch: the threads give under a finger and
 * settle, like cloth does. Nothing loops - the canvas redraws only while the
 * weave is advancing or a ripple is alive, and is otherwise a still image
 * that costs nothing. Reduced motion gets the finished cloth, still.
 */
export function Weave({
  seed,
  colours,
  mode = "enter",
  cols = 72,
  rows = 48,
  label,
  className = "",
  onSpec,
  still = false,
}: {
  seed: string;
  colours: (string | null | undefined)[];
  mode?: "scroll" | "enter";
  cols?: number;
  rows?: number;
  label: string;
  className?: string;
  onSpec?: (spec: WeaveSpec) => void;
  /** The finished cloth, drawn once: for print (hang tags) and thumbnails. */
  still?: boolean;
}) {
  const reduce = useReducedMotion() || still;
  const canvas = useRef<HTMLCanvasElement>(null);
  const colourKey = colours.filter(Boolean).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const spec = useMemo(() => designWeave(seed, colours, { cols, rows }), [seed, colourKey, cols, rows]);

  useEffect(() => { onSpec?.(spec); }, [spec, onSpec]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let progress = reduce ? 1 : 0;
    let target = progress;
    let ripples: Ripple[] = [];
    let frame = 0;
    let last = 0;
    let entered = false;
    let alive = true;

    const paint = () => drawWeave(ctx, spec, width, height, progress, ripples);

    const tick = (now: number) => {
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      // Ease toward the target rather than jumping, so a flung scroll still
      // looks like weaving and not like a wipe.
      const gap = target - progress;
      progress = Math.abs(gap) < 0.002 ? target : progress + gap * (mode === "scroll" ? Math.min(1, dt / 140) : 1);
      ripples = ripples.map((r) => ({ ...r, age: r.age + dt })).filter((r) => rippling([r]));
      paint();
      if (progress !== target || ripples.length > 0) {
        frame = requestAnimationFrame(tick);
      } else {
        frame = 0;
        last = 0;
      }
    };
    const wake = () => { if (!frame) frame = requestAnimationFrame(tick); };

    const measure = () => {
      const box = el.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = box.width;
      height = box.height;
      el.width = Math.round(width * dpr);
      el.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint();
    };
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    measure();

    // Weaving.
    let stopWeaving = () => {};
    if (!reduce && mode === "scroll") {
      const onScroll = () => {
        const box = el.getBoundingClientRect();
        const vh = window.innerHeight;
        // 0 as the top edge enters at the bottom of the screen, 1 once the
        // cloth's bottom edge has cleared the lower third - finished while
        // it is still fully in view, so the visitor sees it complete.
        const travelled = (vh - box.top) / (box.height + vh * 0.35);
        target = Math.max(0, Math.min(1, travelled));
        wake();
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
      stopWeaving = () => window.removeEventListener("scroll", onScroll);
    } else if (!reduce) {
      const started = { at: 0 };
      const seen = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting || entered) return;
        entered = true;
        seen.disconnect();
        const run = (now: number) => {
          if (!alive) return;
          if (!started.at) started.at = now;
          const t = Math.min(1, (now - started.at) / 2600);
          // Ease out: a weaver is quick through the body and careful at the end.
          target = 1 - Math.pow(1 - t, 2.2);
          wake();
          if (t < 1) requestAnimationFrame(run);
        };
        requestAnimationFrame(run);
      }, { threshold: 0.35 });
      seen.observe(el);
      stopWeaving = () => seen.disconnect();
    }

    // A finger on the cloth.
    const touch = (e: PointerEvent) => {
      if (reduce) return;
      const box = el.getBoundingClientRect();
      ripples = [...ripples.slice(-2), { x: e.clientX - box.left, y: e.clientY - box.top, age: 0 }];
      // The lightest tick a phone can give; ignored where unsupported.
      try { navigator.vibrate?.(6); } catch { /* not allowed before a gesture */ }
      wake();
    };
    el.addEventListener("pointerdown", touch);

    return () => {
      alive = false;
      resize.disconnect();
      stopWeaving();
      el.removeEventListener("pointerdown", touch);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [spec, mode, reduce]);

  return <canvas ref={canvas} role="img" aria-label={label} className={`block w-full h-full touch-pan-y select-none ${className}`} />;
}
