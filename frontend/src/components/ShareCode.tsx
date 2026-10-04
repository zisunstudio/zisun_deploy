"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, MessageCircle } from "lucide-react";
import { formatPrice } from "@/lib/queries/catalog";
import { shareUrl, shareWhatsAppUrl } from "@/lib/referral";

/**
 * Her own code, to share once she has worn the piece.
 *
 * Worded as a thank-you, not an offer: no "earn", no amounts in the
 * headline, nothing that reads as a campaign. The numbers are stated once,
 * plainly, with the condition that matters (her friend's order has to be
 * complete) and a link to the page that says everything else (/share).
 * One action - send it on WhatsApp - and a quiet copy.
 */
export function ShareCode({ code, friendPaise, rewardPaise, creditPaise, kind = "customer" }: {
  code: string; friendPaise: number; rewardPaise: number; creditPaise?: number; kind?: string | null;
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
      <p className="text-[11px] tracking-[0.22em] uppercase text-burgundy font-semibold">Pass it on</p>
      <h2 id="share-heading" className="mt-1 font-display text-[26px] leading-tight text-ink">
        If you liked it, tell a friend.
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-muted max-w-[46ch]">
        Your code takes {formatPrice(friendPaise)} off her first ZISUN order. When her order is complete, we thank you with {formatPrice(rewardPaise)}{kind === "creator" ? "" : " of store credit"}.{" "}
        <Link href="/share" data-track="share_terms" className="underline underline-offset-2">How sharing works</Link>
      </p>
      <p className="mt-4 font-display text-[32px] tracking-[0.08em] text-ink tabular-nums select-all">{code}</p>
      {creditPaise ? <p className="mt-1 text-[13px] text-ink">Your store credit: <span className="font-semibold">{formatPrice(creditPaise)}</span></p> : null}
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <a href={shareWhatsAppUrl(code, Math.round(friendPaise / 100), origin)} target="_blank" rel="noopener noreferrer"
          data-track="share_whatsapp"
          className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-burgundy text-porcelain text-sm font-semibold">
          <MessageCircle className="w-4 h-4" aria-hidden /> Send on WhatsApp
        </a>
        <button type="button" data-track="share_copy" onClick={copy} className="inline-flex items-center gap-1.5 min-h-[44px] text-sm text-ink underline underline-offset-4">
          {copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />} {copied ? "Link copied" : "Copy link"}
        </button>
      </div>
    </section>
  );
}
