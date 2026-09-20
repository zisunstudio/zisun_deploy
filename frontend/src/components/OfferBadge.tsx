"use client";

import { useEffect, useState } from "react";
import type { Offer } from "@/lib/queries/catalog";

/**
 * The markdown, said the way a shopper reads it: the percentage, then the
 * price it used to be. `-30%` is the number that stops a thumb; the struck
 * price is the proof. Both come from the API's resolved `offer`, so an
 * expired timer switches everything off without a redeploy.
 */
export function OfferBadge({ offer, className = "" }: { offer: Offer | undefined; className?: string }) {
  if (!offer?.active || !offer.discount_pct) return null;
  return (
    <span
      className={`inline-flex items-center rounded-md bg-[#B4232C] text-white text-[11px] font-bold px-1.5 py-0.5 tracking-wide ${className}`}
      aria-label={`${offer.discount_pct} percent off`}
    >
      −{offer.discount_pct}%
    </span>
  );
}

function remaining(endsAt: string): { d: number; h: number; m: number; s: number; total: number } {
  const total = Math.max(0, new Date(endsAt).getTime() - Date.now());
  const s = Math.floor(total / 1000);
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60, total };
}

/**
 * "Ends in 2d 04:12:33". Ticks once a second while mounted, and renders
 * nothing when the offer has no end or has already ended — the API stops
 * marking it active at that moment anyway, so the page never counts down to
 * a badge that is still showing.
 *
 * Under a day it drops the day and shows hours:minutes:seconds, because that
 * is when the urgency is real and the seconds are worth the motion. Above it,
 * the seconds would be noise.
 */
export function OfferCountdown({ offer, className = "" }: { offer: Offer | undefined; className?: string }) {
  const endsAt = offer?.active ? offer.ends_at : null;
  const [left, setLeft] = useState(() => (endsAt ? remaining(endsAt) : null));
  useEffect(() => {
    if (!endsAt) return;
    setLeft(remaining(endsAt));
    const id = setInterval(() => setLeft(remaining(endsAt)), 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  if (!endsAt || !left || left.total <= 0) return null;
  const pad = (n: number) => n.toString().padStart(2, "0");
  const clock = `${pad(left.h)}:${pad(left.m)}:${pad(left.s)}`;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold text-[#B4232C] tabular-nums ${className}`} role="timer" aria-live="off">
      <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full rounded-full bg-[#B4232C] opacity-75 motion-safe:animate-ping" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#B4232C]" />
      </span>
      Ends in {left.d > 0 ? `${left.d}d ` : ""}{clock}
    </span>
  );
}
