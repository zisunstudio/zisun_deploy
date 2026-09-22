"use client";
import { chartKind, type Chart } from "@/lib/fitMath";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, X } from "lucide-react";
import Link from "next/link";
import { POLICY_TERMS } from "@/lib/legal";
import { chartForCategory, HOW_TO_MEASURE, SIZE_CHART_NOTES } from "@/lib/sizeGuide";
import type { SizeChart, SizeChartRow, SizeUnit } from "@/lib/queries/catalog";
import { chartInUnit, formatMeasure, readPreferredUnit, writePreferredUnit } from "@/lib/sizeUnits";

interface SizeGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoryName?: string | null;
  /** Highlighted row, so the chart opens showing the size already chosen. */
  selectedSize?: string | null;
  /**
   * This product's own measurements, entered by the founder. When present the
   * table shows these instead of the category chart; the category's fit and
   * fabric notes still apply and are kept.
   */
  chart?: SizeChart | null;
}

/**
 * A modal, not a route.
 *
 * Sending someone to /size-guide loses the product, the size they had picked
 * and their place in the page — on a phone that is a bounce, not a
 * consultation. The chart has to appear over the thing being measured.
 */
export function SizeGuideModal({ isOpen, onClose, categoryName, selectedSize, chart: productChart }: SizeGuideModalProps) {
  // Portals need a DOM, and the server render has none. Gating on a mounted
  // flag rather than a typeof-window check keeps the first client render
  // identical to the server's, which is what React actually diffs against.
  const [mounted, setMounted] = useState(false);
  const [unit, setUnitState] = useState<SizeUnit>("cm");
  useEffect(() => { setMounted(true); setUnitState(readPreferredUnit()); }, []);
  const setUnit = (u: SizeUnit) => { setUnitState(u); writePreferredUnit(u); };

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

  // One table, two sources. The founder's per-product chart wins; the category
  // chart is the fallback. Both are normalised to the same row shape so the
  // table below has a single render path, and both are converted to whatever
  // unit the customer last chose — conversion happens here, at display, never
  // at entry.
  const source: SizeChart | null = productChart?.rows?.length
    ? productChart
    : chart
      ? {
          unit: "cm",
          rows: chart.rows.map((r) => ({
            size: r.size, chest: r.bust, waist: r.waist, hip: r.hip,
            top_length: r.length, bottom_length: r.bottomLength ?? null,
          })),
        }
      : null;
  const fromProduct = Boolean(productChart?.rows?.length);
  const shown: SizeChart | null = source ? chartInUnit(source, unit) : null;
  const rows: SizeChartRow[] = shown?.rows ?? [];
  // Only render the bottom-length column when this chart actually measures one.
  const hasBottom = rows.some((r) => r.bottom_length != null);
  const fmt = (v: number | null | undefined) => (v == null ? "—" : formatMeasure(v, unit));

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
                  {fromProduct ? "Measured for this piece" : chart?.categories.join(" · ")}
                  {" · "}
                  <span className="inline-flex rounded-md border border-gray-200 overflow-hidden align-middle" role="radiogroup" aria-label="Units">
                    {(["cm", "in"] as SizeUnit[]).map((u) => (
                      <button key={u} type="button" role="radio" aria-checked={unit === u} onClick={() => setUnit(u)}
                        className={`px-2 py-0.5 text-[11px] font-semibold ${unit === u ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}>
                        {u}
                      </button>
                    ))}
                  </span>
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
              {/* The instruction has to match the numbers. The category intro
                  says "measure yourself and match your bust", which is right for
                  a body chart and wrong for a chart of the kurta itself: a 39"
                  bust matched to a 39" kurta is a kurta that does not close. */}
              {fromProduct && productChart && chartKind(productChart as Chart) === "garment" ? (
                <p className="text-sm text-muted leading-relaxed">
                  These are the kurta&rsquo;s own measurements, all the way round — not body sizes. Choose one comfortably bigger than you:
                  a few inches over your bust and hip for an easy fit. Or tap <span className="text-ink">Find my size</span> and we will work it out.
                </p>
              ) : (
                chart?.intro && <p className="text-sm text-muted leading-relaxed">{chart.intro}</p>
              )}

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
                        {POLICY_TERMS.exchangeRaiseWindowHours} hours of delivery
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


              {/* A set sold with trousers needs both lengths; a single garment
                  has one. Showing an empty "Bottom length" column on a kurti
                  reads as a measurement we declined to give — on the page whose
                  whole job is preventing a sizing return — so the column only
                  exists when the chart actually carries the data. */}
              <div className="overflow-x-auto -mx-1 px-1">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left text-muted text-xs uppercase tracking-wider">
                      <th className="py-2 pr-3 font-medium">Size</th>
                      <th className="py-2 pr-3 font-medium">Chest</th>
                      <th className="py-2 pr-3 font-medium">Waist</th>
                      <th className="py-2 pr-3 font-medium">Hip</th>
                      <th className={hasBottom ? "py-2 pr-3 font-medium" : "py-2 font-medium"}>
                        {hasBottom ? "Top length" : "Length"}
                      </th>
                      {hasBottom && <th className="py-2 font-medium">Bottom length</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
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
                          <td className="py-2.5 pr-3 tabular-nums">{fmt(r.chest)}</td>
                          <td className="py-2.5 pr-3 tabular-nums">{fmt(r.waist)}</td>
                          <td className="py-2.5 pr-3 tabular-nums">{fmt(r.hip)}</td>
                          <td className={`tabular-nums ${hasBottom ? "py-2.5 pr-3" : "py-2.5"}`}>{fmt(r.top_length)}</td>
                          {hasBottom && <td className="py-2.5 tabular-nums">{fmt(r.bottom_length)}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <ul className="mt-3 space-y-1.5">
                  {SIZE_CHART_NOTES.map((note) => (
                    <li key={note} className="text-[11px] text-muted leading-relaxed flex gap-1.5">
                      <span className="text-primary flex-shrink-0">·</span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {chart && (
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
              )}

              {chart && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1.5">Fabric</h3>
                <p className="text-sm text-muted leading-relaxed">{chart.fabric}</p>
              </div>
              )}

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
