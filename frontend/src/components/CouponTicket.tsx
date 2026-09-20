"use client";
import { useState } from "react";
import { Check, Copy, Scissors } from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import { OfferCountdown } from "@/components/OfferBadge";
import { couponHeadline, couponTerms, type PublicCoupon } from "@/lib/queries/coupons";
import type { Offer } from "@/lib/queries/catalog";

/**
 * A coupon as a ticket: stub on the left with the code, body on the right
 * with what it is worth, a perforation between. Tap anywhere to copy.
 *
 * Turmeric on ink because the ticket is meant to be the loudest thing in its
 * row - it is the one element on the page allowed to be a sticker. The
 * countdown is real: the API stops listing the coupon at expiry.
 */
export function CouponTicket({ coupon, compact = false, className = "" }: { coupon: PublicCoupon; compact?: boolean; className?: string }) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const terms = couponTerms(coupon);
  const offerLike: Offer | undefined = coupon.expires_at ? { active: true, ends_at: coupon.expires_at, compare_at_price: null, discount_pct: null } : undefined;

  async function copy() {
    try {
      await navigator.clipboard.writeText(coupon.code);
      setCopied(true);
      showToast(`${coupon.code} copied — apply it at checkout`, "success");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast(`Use code ${coupon.code} at checkout`, "info");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Coupon ${coupon.code}, ${couponHeadline(coupon)}. Tap to copy`}
      className={`ticket group relative flex items-stretch text-left bg-haldi text-ink shadow-soft transition-transform active:scale-[0.98] hover:-translate-y-0.5 hover:shadow-lift ${compact ? "h-16" : "h-[92px]"} ${className}`}
    >
      {/* The stub: code, rotated the way a real stub prints it. */}
      <div className={`flex items-center justify-center ${compact ? "w-24 px-3" : "w-28 px-4"}`}>
        <span className={`font-display font-semibold tracking-[0.06em] ${compact ? "text-sm" : "text-base"}`}>{coupon.code}</span>
      </div>
      <span aria-hidden className="ticket-tear w-px my-2 text-ink" />
      {/* The body: what it is worth. */}
      <div className="flex-1 min-w-0 flex flex-col justify-center pl-4 pr-3">
        <span className={`font-display font-semibold leading-none ${compact ? "text-xl" : "text-[26px]"}`}>{couponHeadline(coupon)}</span>
        {!compact && terms && <span className="mt-1 text-[11px] font-medium leading-tight text-ink/70 truncate">{terms}</span>}
        <span className="mt-1 flex items-center gap-2 text-[11px] font-semibold">
          {offerLike ? (
            <OfferCountdown offer={offerLike} className="!text-ink" />
          ) : (
            <span className="text-ink/70">No expiry</span>
          )}
        </span>
      </div>
      <div className="flex items-center pr-3.5 text-ink/70 group-hover:text-ink">
        {copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}
      </div>
      <Scissors aria-hidden className="absolute -top-2 left-[6.6rem] w-3.5 h-3.5 rotate-90 text-ink/50" />
    </button>
  );
}
