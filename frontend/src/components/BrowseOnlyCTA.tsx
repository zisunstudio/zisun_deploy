"use client";

import { MessageCircle } from "lucide-react";
import { whatsappOrderUrl, HAS_WHATSAPP } from "@/lib/launchMode";

/**
 * Stands in for "Add to Cart" while the store is in preview.
 *
 * Deliberately not a disabled cart button: a greyed-out control reads as a
 * bug or an out-of-stock item. This says what is true — you can look now,
 * and here is how to buy in the meantime.
 */
export function BrowseOnlyCTA({ productName }: { productName?: string }) {
  const href = whatsappOrderUrl(productName);

  if (!HAS_WHATSAPP || !href) {
    // No number configured — still say so plainly rather than showing a
    // button that goes nowhere.
    return (
      <div className="w-full bg-[#F7F0E8] border border-[#EDE4D8] text-center py-4 rounded-full">
        <p className="text-foreground text-sm font-semibold">Launching soon</p>
        <p className="text-muted text-xs mt-0.5">Online ordering opens shortly.</p>
      </div>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="w-full bg-[#25D366] text-white py-4 rounded-full font-semibold flex items-center justify-center gap-2 hover:bg-[#1FB855] transition-colors shadow-md"
    >
      <MessageCircle className="w-5 h-5" />
      Launching soon — order on WhatsApp
    </a>
  );
}

/** One-line inline variant for lists and drawers. */
export function BrowseOnlyNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-muted text-xs text-center ${className}`}>
      Online checkout opens soon — browse freely in the meantime.
    </p>
  );
}
