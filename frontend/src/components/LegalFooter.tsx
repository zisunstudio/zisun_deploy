"use client";
import Link from "next/link";
import { COMPANY } from "@/lib/legal";
import { BRAND } from "@/lib/brand";
import { ZisunMark } from "@/components/brand/ZisunMark";
import { HAS_ANY_WHATSAPP, WHATSAPP_GROUP_HREF, whatsappContactUrl } from "@/lib/launchMode";
import { POLICY_TERMS } from "@/lib/legal";
import { recordEnquiry } from "@/lib/enquiry";

const LINKS = [
  { href: "/shop", label: "Shop" },
  // "Privacy Policy" in full: an automated reviewer looks for the phrase,
  // and "Privacy" alone was one of the things Google could not find.
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms" },
  // The route is still /refund; the policy behind it is an exchange policy.
  { href: "/refund", label: "Exchanges" },
  { href: "/shipping", label: "Shipping" },
  { href: "/contact", label: "Contact" },
];

/**
 * The footer, in burgundy.
 *
 * The brand colour as a whole surface, once, at the foot of the page - the
 * "cover" the founder plans everything else around. A dark foot anchors a
 * light page: it is where the scroll ends, and it says so. The name is set very large and cropped by the edge on purpose - the one
 * place the wordmark is allowed to be a shape rather than a label. The policy
 * links stay, and stay on the home page: Google's app verification and
 * Razorpay's onboarding both look for them here.
 */
export function LegalFooter() {
  const wa = whatsappContactUrl();
  return (
    <footer className="mt-16 bg-burgundy text-porcelain overflow-hidden">
      <div className="mx-auto max-w-6xl px-5 lg:px-8 pt-12 pb-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <ZisunMark className="h-10 w-auto text-porcelain" />
            <p className="mt-4 font-hand text-2xl text-porcelain/90 leading-none">{BRAND.signature}</p>
            <p className="mt-2 text-[13px] text-porcelain/60 max-w-xs leading-relaxed">
              Handloom cotton from South India, in small batches.
            </p>
            <p className="mt-4 text-[11px] uppercase tracking-[0.18em] text-porcelain/55">
              Ships across India · {POLICY_TERMS.exchangeRaiseWindowHours}h size exchange
            </p>
            {WHATSAPP_GROUP_HREF && (
              <a href={WHATSAPP_GROUP_HREF} target="_blank" rel="noopener noreferrer" onClick={() => recordEnquiry({ source: "community" })} className="mt-3 inline-block text-[13px] text-porcelain/85 underline underline-offset-4 decoration-porcelain/40 hover:decoration-porcelain">
                ZISUN Tales — where drops land first →
              </a>
            )}
          </div>
          <nav className="grid grid-cols-2 gap-x-10 gap-y-2.5 text-sm" aria-label="Footer">
            {LINKS.map(({ href, label }) => (
              <Link key={href} href={href} className="text-porcelain/80 hover:text-porcelain underline-offset-4 hover:underline">
                {label}
              </Link>
            ))}
            {HAS_ANY_WHATSAPP && wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" onClick={() => recordEnquiry({ source: "footer" })} className="text-porcelain/80 hover:text-porcelain underline-offset-4 hover:underline">
                WhatsApp us
              </a>
            )}
          </nav>
        </div>
        <p aria-hidden className="font-display font-semibold text-porcelain/[0.07] leading-none select-none mt-10 -mb-6 text-[26vw] lg:text-[13rem] tracking-tight whitespace-nowrap">
          {BRAND.name}
        </p>
        <p className="relative mt-8 text-[11px] text-porcelain/50">
          © {new Date().getFullYear()} {COMPANY.legalName}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
