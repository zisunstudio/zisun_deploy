"use client";
import { useRef, type ReactNode } from "react";
import { useTilt } from "@/lib/useTilt";

/**
 * A photograph with depth.
 *
 * Tilt the phone and the photograph leans with it - three degrees at most -
 * while a soft band of light slides across it the way light moves over
 * cloth when you turn it in your hands. It is the smallest amount of motion
 * that makes a flat screen feel like it has something behind the glass.
 *
 * Transforms are written straight to the element from the tilt loop, so it
 * costs no React renders; it scales up 7% inside a clipped frame so the
 * lean never shows an edge.
 * Still when the phone is still, and entirely off under reduced motion.
 */
export function DepthPhoto({ children, className = "" }: { children: ReactNode; className?: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const sheen = useRef<HTMLDivElement>(null);

  useTilt(frame, ({ x, y }) => {
    const l = layer.current, s = sheen.current;
    if (l) l.style.transform = `rotateY(${(x * 3).toFixed(2)}deg) rotateX(${(-y * 3).toFixed(2)}deg) scale(1.07)`;
    if (s) {
      s.style.backgroundPosition = `${50 - x * 45}% ${50 - y * 30}%`;
      s.style.opacity = String(Math.min(0.9, Math.hypot(x, y) * 1.2));
    }
  });

  return (
    <div ref={frame} className={`absolute inset-0 overflow-hidden [perspective:900px] ${className}`}>
      <div ref={layer} className="absolute inset-0 will-change-transform [transform-style:preserve-3d] transition-none">
        {children}
      </div>
      <div
        ref={sheen}
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 mix-blend-soft-light"
        style={{ backgroundImage: "linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.55) 50%, transparent 65%)", backgroundSize: "250% 250%" }}
      />
    </div>
  );
}
