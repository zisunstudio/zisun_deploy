"use client";
import { TICKER } from "@/lib/brand";

/**
 * The ribbon: one line of the brand's promises, moving.
 *
 * Duplicated once so the loop is seamless - the animation translates the track
 * by exactly half its width, which is one full copy. Pauses on hover so a
 * reader can catch a line, and stops entirely under reduced-motion (globals).
 */
export function Ticker({ className = "" }: { className?: string }) {
  const items = [...TICKER, ...TICKER];
  return (
    <div className={`overflow-hidden bg-haldi text-ink select-none ${className}`} aria-label={TICKER.join(", ")}>
      <div className="flex w-max animate-marquee hover:[animation-play-state:paused] py-2.5">
        {items.map((line, i) => (
          <span key={i} className="flex items-center whitespace-nowrap text-[12px] font-semibold uppercase tracking-[0.18em]" aria-hidden={i >= TICKER.length}>
            <span className="px-5">{line}</span>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-ink/60" />
          </span>
        ))}
      </div>
    </div>
  );
}
