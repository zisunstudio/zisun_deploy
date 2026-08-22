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
  {
    Icon: RefreshCcw,
    text: `${POLICY_TERMS.returnWindowDays}-day returns from delivery`,
    href: "/refund",
  },
  {
    Icon: Truck,
    text: `Dispatched in ${POLICY_TERMS.dispatchTimeframe}, ships across India`,
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
    text: "Cash on delivery available on most pincodes",
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
    <ul className="mt-4 space-y-2 border-t border-gray-100 pt-3">
      {items.map(({ Icon, text, href }) => (
        <li key={href + text}>
          <Link
            href={href}
            className="flex items-center gap-2.5 text-xs text-muted hover:text-foreground transition-colors"
          >
            <Icon className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span className="underline-offset-2 hover:underline">{text}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
