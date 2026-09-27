"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { formatPrice } from "@/lib/queries/catalog";
import { shareUrl, shareWhatsAppUrl } from "@/lib/referral";

/**
 * Her own code, to share once she has worn the piece.
 *
 * A friend takes Rs 100 off a first order; she earns Rs 150 of store credit
 * when that friend's parcel is delivered. Shown on the order page after
 * delivery and on her account. One action (send on WhatsApp) and a quiet
 * copy - the code is the thing, not a campaign.
 */
export function ShareCode({ code, friendPaise, rewardPaise, creditPaise }: {
  code: string; friendPaise: number; rewardPaise: number; creditPaise?: number;
}) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : undefined;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl(code, origin));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard refused; the code is on screen */ }
  };
  return (
    <section className="rounded-card bg-rose px-5 py-6" aria-labelledby="share-heading">
      <p className="text-[11px] tracking-[0.22em] uppercase text-burgundy font-semibold">Share ZISUN</p>
      <h2 id="share-heading" className="mt-1 font-display text-[26px] leading-tight text-ink">
        {formatPrice(friendPaise)} off for a friend. {formatPrice(rewardPaise)} for you.
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-muted max-w-[44ch]">
        Your friend takes {formatPrice(friendPaise)} off her first order with your code. When her parcel reaches her, {formatPrice(rewardPaise)} of store credit is yours for your next piece.
      </p>
      <p className="mt-4 font-display text-[32px] tracking-[0.08em] text-ink tabular-nums select-all">{code}</p>
      {creditPaise ? <p className="mt-1 text-[13px] text-ink">Your store credit: <span className="font-semibold">{formatPrice(creditPaise)}</span></p> : null}
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <a href={shareWhatsAppUrl(code, Math.round(friendPaise / 100), origin)} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-burgundy text-porcelain text-sm font-semibold">
          <MessageCircle className="w-4 h-4" aria-hidden /> Send on WhatsApp
        </a>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 min-h-[44px] text-sm text-ink underline underline-offset-4">
          {copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />} {copied ? "Link copied" : "Copy link"}
        </button>
      </div>
    </section>
  );
}
