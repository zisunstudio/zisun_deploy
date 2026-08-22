"use client";

import Link from "next/link";
import { RefreshCcw, Truck, MessageCircle } from "lucide-react";
import { POLICY_TERMS } from "@/lib/legal";

/**
 * Reassurance placed directly beneath the buy action.
 *
 * The research brief is specific about this: return policy, delivery
 * expectation and support access belong beside the CTA rather than in the
 * footer, and for an unknown brand these are the cheapest conversion available.
 * Roughly a fifth of abandonment is attributed to not trusting the seller.
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
const ITEMS = [
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
    Icon: MessageCircle,
    text: "Questions before you buy? Message us",
    href: "/contact",
  },
];

export function ProductAssurances() {
  return (
    <ul className="mt-4 space-y-2 border-t border-gray-100 pt-3">
      {ITEMS.map(({ Icon, text, href }) => (
        <li key={href}>
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
