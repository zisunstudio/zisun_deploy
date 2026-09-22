"use client";

import Link from "next/link";
import { RefreshCcw, Truck, MessageCircle, ShieldCheck, Banknote } from "lucide-react";
import { POLICY_TERMS } from "@/lib/legal";
import { BROWSE_ONLY } from "@/lib/launchMode";

/**
 * Reassurance placed directly beneath the buy action.
 *
 * The research brief is specific about this: return policy, delivery
 * expectation, payment safety, COD availability and support access belong
 * beside the CTA rather than in the footer, and for an unknown brand these are
 * the cheapest conversion available. Roughly a fifth of abandonment is
 * attributed to not trusting the seller.
 *
 * Each line states something the policy pages already commit to, and links to
 * the page that commits to it — a claim the customer cannot verify in one tap
 * is worth less than no claim.
 *
 * No delivery date here yet. The serviceability API is wired now and returns a
 * real per-courier estimate, but it needs the customer's pincode, so showing a
 * date means asking for one. That belongs in a delivery checker beside the
 * CTA, not in a static list.
 */
type Assurance = {
  Icon: typeof RefreshCcw;
  text: string;
  href: string;
  /** Claims about paying are false while the store cannot take a payment. */
  checkoutOnly?: boolean;
};

const ITEMS: Assurance[] = [
  // The exchange window is no longer listed here. A time limit under the buy
  // button reads as a warning before she has bought anything; the policy is
  // one tap away in the footer and on the refund page, unchanged.
  {
    // Free when she pays online; Cash on Delivery carries a shipping charge
    // (added by the server - see services/pricing.py).
    Icon: Truck,
    text: `Free shipping when you pay online · dispatched in ${POLICY_TERMS.dispatchTimeframe}`,
    href: "/shipping",
  },
  {
    // Razorpay is the payment processor; card and UPI details never reach our
    // servers. Worth naming — "secure payment" unattributed is wallpaper,
    // whereas a processor the customer has already paid someone else through
    // is a borrowed reputation.
    Icon: ShieldCheck,
    text: "Secure payment by Razorpay — UPI, cards, netbanking",
    href: "/terms",
    checkoutOnly: true,
  },
  {
    Icon: Banknote,
    text: `Cash on delivery on most pincodes · ₹${POLICY_TERMS.codShippingRupees} shipping`,
    href: "/shipping",
    checkoutOnly: true,
  },
  {
    Icon: MessageCircle,
    text: "Questions before you buy? Message us",
    href: "/contact",
  },
];

export function ProductAssurances() {
  // In browse mode there is no checkout, so promising a payment method would
  // be a promise the store cannot keep this week. Returns, dispatch and
  // support hold either way.
  const items = ITEMS.filter((i) => !(i.checkoutOnly && BROWSE_ONLY));

  return (
    <ul className="mt-6 space-y-2 border-t border-ink/10 pt-4">
      {items.map(({ Icon, text, href }) => (
        <li key={href + text}>
          <Link
            href={href}
            className="flex items-center gap-2.5 text-xs text-muted hover:text-foreground transition-colors"
          >
            <Icon className="w-3.5 h-3.5 text-ink/50 flex-shrink-0" strokeWidth={1.8} />
            <span className="underline-offset-2 hover:underline">{text}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
