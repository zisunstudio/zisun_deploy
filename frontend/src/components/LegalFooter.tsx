import Link from "next/link";
import { COMPANY } from "@/lib/legal";

const LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  // The route is still /refund; the policy behind it is an exchange policy.
  { href: "/refund", label: "Exchanges" },
  { href: "/shipping", label: "Shipping" },
  { href: "/contact", label: "Contact" },
];

/**
 * Policy links. Payment gateways check that these are reachable from the store
 * during merchant onboarding, and consumer law requires them to be findable.
 */
export function LegalFooter() {
  return (
    <footer className="border-t border-gray-200 px-5 py-6 text-center">
      <nav className="flex flex-wrap justify-center gap-x-3 gap-y-2 text-xs text-muted">
        {LINKS.map(({ href, label }) => (
          <Link key={href} href={href} className="hover:text-primary underline-offset-2 hover:underline">
            {label}
          </Link>
        ))}
      </nav>
      <p className="mt-3 text-[11px] text-muted">
        © {new Date().getFullYear()} {COMPANY.legalName}. All rights reserved.
      </p>
    </footer>
  );
}
