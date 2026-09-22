"use client";
import { useEffect, useRef } from "react";

/**
 * How the phone is being held, as a smoothed tilt in [-1, 1] on each axis.
 *
 * The one input the spatial layer reads. On a phone it is the device's
 * orientation (the way she is holding it); on a laptop it is where the
 * pointer is over the element. It is read from a ref, never state, so a
 * listener firing 60 times a second causes no React renders; consumers
 * sample it in their own animation frame.
 *
 * iOS only reports orientation after the visitor grants it, and the prompt
 * must come from a tap. `requestTilt()` is called from the tap on the
 * spatial element itself, so the question arrives in context ("move your
 * phone to see the cloth move") rather than on the first tap anywhere on
 * the site. Until then, and wherever orientation is unavailable, the
 * pointer drives it. Reduced motion pins it at rest.
 */
export interface Tilt { x: number; y: number; source: "device" | "pointer" | "rest" }

let permission: "unknown" | "granted" | "denied" = "unknown";

export async function requestTilt(): Promise<boolean> {
  const DOE = typeof window !== "undefined" ? (window as any).DeviceOrientationEvent : undefined;
  if (!DOE) return false;
  if (typeof DOE.requestPermission !== "function") { permission = "granted"; return true; }
  if (permission !== "unknown") return permission === "granted";
  try {
    permission = (await DOE.requestPermission()) === "granted" ? "granted" : "denied";
  } catch {
    permission = "denied";
  }
  return permission === "granted";
}

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

export function useTilt(target: React.RefObject<HTMLElement>, onFrame?: (t: Tilt) => void) {
  const tilt = useRef<Tilt>({ x: 0, y: 0, source: "rest" });
  const frameCb = useRef(onFrame);
  frameCb.current = onFrame;
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const goal = { x: 0, y: 0 };
    let base: { beta: number; gamma: number } | null = null;
    let frame = 0;
    let lastDevice = 0;

    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      // Relative to how she was holding it when it first reported, so a
      // phone held upright and one held flat both start at rest.
      if (!base) base = { beta: e.beta, gamma: e.gamma };
      goal.x = clamp((e.gamma - base.gamma) / 22);
      goal.y = clamp((e.beta - base.beta) / 22);
      tilt.current.source = "device";
      lastDevice = performance.now();
      wake();
    };
    const onPointer = (e: PointerEvent) => {
      if (performance.now() - lastDevice < 1000) return; // the phone wins
      const el = target.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      goal.x = clamp(((e.clientX - r.left) / r.width) * 2 - 1);
      goal.y = clamp(((e.clientY - r.top) / r.height) * 2 - 1);
      tilt.current.source = "pointer";
      wake();
    };
    const onLeave = () => { if (tilt.current.source === "pointer") { goal.x = 0; goal.y = 0; wake(); } };

    // Eases toward the goal and goes to sleep once it arrives; any new input
    // wakes it. A phone lying still costs nothing.
    const step = () => {
      const t = tilt.current;
      t.x += (goal.x - t.x) * 0.08;
      t.y += (goal.y - t.y) * 0.08;
      frameCb.current?.(t);
      if (Math.abs(goal.x - t.x) < 0.001 && Math.abs(goal.y - t.y) < 0.001) { frame = 0; return; }
      frame = requestAnimationFrame(step);
    };
    const wake = () => { if (!frame) frame = requestAnimationFrame(step); };

    window.addEventListener("deviceorientation", onOrient);
    const el = target.current;
    el?.addEventListener("pointermove", onPointer);
    el?.addEventListener("pointerleave", onLeave);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("deviceorientation", onOrient);
      el?.removeEventListener("pointermove", onPointer);
      el?.removeEventListener("pointerleave", onLeave);
    };
  }, [target]);
  return tilt;
}
