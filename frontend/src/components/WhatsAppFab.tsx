"use client";

import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { HAS_ANY_WHATSAPP, HAS_WHATSAPP, whatsappContactUrl } from "@/lib/launchMode";

/**
 * One tap to WhatsApp, from every storefront page.
 *
 * The founder sells through WhatsApp today — the group is where drops land
 * and questions get answered — and the survey's biggest objection was "who is
 * behind this". A persistent, obviously-human way to reach her answers that
 * on every page, not only at the buy button.
 *
 * Sits above the mobile tab bar so it never covers the nav, and hides itself
 * on admin routes and the login flow where it would just be noise. Renders
 * nothing at all until a WhatsApp destination is configured: a button that
 * opens an empty chat is worse than no button.
 */
export function WhatsAppFab() {
  const pathname = usePathname();
  if (!HAS_ANY_WHATSAPP) return null;
  if (pathname.startsWith("/admin") || pathname.startsWith("/login")) return null;
  const href = whatsappContactUrl();
  if (!href) return null;
  const label = HAS_WHATSAPP ? "Chat with ZISUN on WhatsApp" : "Join ZISUN Tales on WhatsApp";
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="fixed z-40 right-4 bottom-[calc(4rem+1rem+env(safe-area-inset-bottom))] lg:bottom-6
                 flex items-center gap-2 pl-3.5 pr-4 py-3 rounded-full
                 bg-[#25D366] text-white shadow-[0_8px_24px_-8px_rgba(37,211,102,.75)]
                 hover:bg-[#1FB855] active:scale-95 transition-all
                 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366]"
    >
      <MessageCircle className="w-5 h-5" strokeWidth={2.2} aria-hidden="true" />
      <span className="text-sm font-semibold hidden sm:inline">WhatsApp</span>
    </a>
  );
}
