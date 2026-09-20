"use client";

import { MessageCircle } from "lucide-react";
import { whatsappOrderUrl, HAS_WHATSAPP } from "@/lib/launchMode";
import { recordEnquiry } from "@/lib/enquiry";

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
      <div className="w-full bg-rose border border-line text-center py-4 rounded-full">
        <p className="text-foreground text-sm font-semibold">Ask us about this piece</p>
        <p className="text-muted text-xs mt-0.5">Orders are taken over WhatsApp for now.</p>
      </div>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => recordEnquiry({ source: "sheet", product_name: productName ?? null })}
      className="w-full bg-burgundy text-white py-4 rounded-full font-semibold flex items-center justify-center gap-2 hover:bg-burgundy-deep transition-colors"
    >
      <MessageCircle className="w-5 h-5" />
      Order on WhatsApp
    </a>
  );
}

/** One-line inline variant for lists and drawers. */
export function BrowseOnlyNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-muted text-xs text-center ${className}`}>
      Orders are confirmed on WhatsApp for now — size, delivery and payment (COD or UPI).
    </p>
  );
}
