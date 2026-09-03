"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, X } from "lucide-react";
import Link from "next/link";
import { POLICY_TERMS } from "@/lib/legal";
import { chartForCategory, HOW_TO_MEASURE } from "@/lib/sizeGuide";

interface SizeGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoryName?: string | null;
  /** Highlighted row, so the chart opens showing the size already chosen. */
  selectedSize?: string | null;
}

/**
 * A modal, not a route.
 *
 * Sending someone to /size-guide loses the product, the size they had picked
 * and their place in the page — on a phone that is a bounce, not a
 * consultation. The chart has to appear over the thing being measured.
 */
export function SizeGuideModal({ isOpen, onClose, categoryName, selectedSize }: SizeGuideModalProps) {
  // Portals need a DOM, and the server render has none. Gating on a mounted
  // flag rather than a typeof-window check keeps the first client render
  // identical to the server's, which is what React actually diffs against.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    // Keep the page behind from scrolling under the sheet on a phone.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [isOpen, onClose]);

  if (!mounted) return null;

  const chart = chartForCategory(categoryName);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end lg:items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="size-guide-title"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="relative w-full lg:max-w-lg bg-background rounded-t-2xl lg:rounded-2xl max-h-[88vh] overflow-y-auto no-scrollbar"
          >
            <div className="sticky top-0 bg-background px-5 pt-5 pb-3 border-b border-gray-100 flex items-start justify-between gap-4">
              <div>
                <h2 id="size-guide-title" className="font-serif text-lg font-bold text-foreground">
                  Size guide
                </h2>
                <p className="text-muted text-xs mt-0.5">
                  {chart.categories.join(" · ")} · all measurements in cm
                </p>
              </div>
              <button
                ref={closeRef}
                onClick={onClose}
                aria-label="Close size guide"
                className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <X className="w-4 h-4 text-foreground" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-5">
              <p className="text-sm text-muted leading-relaxed">{chart.intro}</p>

              {/* Above the chart, not below it. With no returns and a size-only
                  exchange this is the reason the chart matters, and one line of
                  it is time-critical: "record before you open the parcel" is
                  useless advice once the parcel is open. Measured on a 390px
                  viewport it sat at 949px inside a 743px modal — reachable only
                  by scrolling past the very table it is asking them to read. */}
              <div className="rounded-xl bg-primary/5 border border-primary/15 p-3.5">
                <div className="flex gap-2.5">
                  <AlertCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold text-foreground">
                      Please measure before you order
                    </p>
                    <p className="text-xs text-muted leading-relaxed">
                      We do not accept returns. If the size does not fit we will exchange
                      it within{" "}
                      <strong className="font-semibold text-foreground">
                        {POLICY_TERMS.exchangeWindowDays} days of delivery
                      </strong>
                      , and size is the only reason we can accept.
                    </p>
                    <p className="text-xs text-muted leading-relaxed">
                      An exchange needs an{" "}
                      <strong className="font-semibold text-foreground">
                        unedited, single-shot video
                      </strong>{" "}
                      of the sealed parcel being opened — so please start recording
                      before you open it. We arrange and pay for the pickup.
                    </p>
                    <Link
                      href="/refund"
                      className="inline-block text-xs text-primary font-medium underline underline-offset-2"
                    >
                      Read the exchange policy
                    </Link>
                  </div>
                </div>
              </div>


              <div className="overflow-x-auto -mx-1 px-1">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left text-muted text-xs uppercase tracking-wider">
                      <th className="py-2 pr-3 font-medium">Size</th>
                      <th className="py-2 pr-3 font-medium">Bust</th>
                      <th className="py-2 pr-3 font-medium">Waist</th>
                      <th className="py-2 pr-3 font-medium">Hip</th>
                      <th className="py-2 font-medium">Length</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chart.rows.map((r) => {
                      const isSelected = selectedSize != null && r.size === selectedSize;
                      return (
                        <tr
                          key={r.size}
                          className={`border-t border-gray-100 ${
                            isSelected ? "bg-primary/5 font-semibold text-foreground" : "text-muted"
                          }`}
                        >
                          <td className="py-2.5 pr-3 text-foreground font-semibold">
                            {r.size}
                            {isSelected && (
                              <span className="ml-1.5 text-[10px] font-medium text-primary">selected</span>
                            )}
                          </td>
                          <td className="py-2.5 pr-3">{r.bust}</td>
                          <td className="py-2.5 pr-3">{r.waist}</td>
                          <td className="py-2.5 pr-3">{r.hip}</td>
                          <td className="py-2.5">{r.length}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-[11px] text-muted mt-2">
                  Bust, waist and hip are <strong className="font-semibold">body</strong> measurements.
                  Length is the finished garment.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">How this one fits</h3>
                <ul className="space-y-1.5">
                  {chart.fit.map((line) => (
                    <li key={line} className="text-sm text-muted leading-relaxed flex gap-2">
                      <span className="text-primary flex-shrink-0">·</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1.5">Fabric</h3>
                <p className="text-sm text-muted leading-relaxed">{chart.fabric}</p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">How to measure</h3>
                <ul className="space-y-1.5">
                  {HOW_TO_MEASURE.map((m) => (
                    <li key={m.label} className="text-sm text-muted leading-relaxed">
                      <span className="font-medium text-foreground">{m.label}:</span> {m.text}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Model height and the size she is wearing belong here, and the
                  research asks for them on every product. We do not have them:
                  the launch photography is licensed stock, which the product
                  page already says. Printing a height nobody measured would be
                  worse than leaving it out — it is exactly the kind of claim a
                  customer discovers is wrong by returning the garment. */}
              <p className="text-xs text-muted leading-relaxed border-t border-gray-100 pt-4">
                Photographs are representative. Model height and the size worn will be
                published with our own studio shoot — until then, please size from the
                measurements above rather than from the photograph.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
