"use client";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { StylingNote } from "@/lib/queries/catalog";
import { WAYS_TO_WEAR } from "@/lib/brand";

/**
 * How the founder would wear it, by occasion.
 *
 * The occasions are quiet chips; the note is set in the serif, the same voice
 * as the description above it, because it *is* the same voice - a friend
 * telling you what to put with it. One note at a time: three paragraphs of
 * advice at once is a blog post, one is a suggestion.
 *
 * Renders nothing when there are no notes. The text is stored on the product;
 * nothing here calls a model.
 */
export function WaysToWear({ notes }: { notes: StylingNote[] | null | undefined }) {
  const reduce = useReducedMotion();
  const list = (notes ?? []).filter((n) => n.occasion?.trim() && n.note?.trim());
  const [at, setAt] = useState(0);
  if (list.length === 0) return null;
  const current = list[Math.min(at, list.length - 1)];

  return (
    <section className="mt-10" aria-label={WAYS_TO_WEAR.eyebrow}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-burgundy">{WAYS_TO_WEAR.eyebrow}</p>
      <div role="tablist" aria-label={WAYS_TO_WEAR.eyebrow} className="mt-3 flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 lg:mx-0 lg:px-0">
        {list.map((n, i) => {
          const on = n === current;
          return (
            <button
              key={`${n.occasion}-${i}`} role="tab" aria-selected={on} onClick={() => setAt(i)}
              className={`shrink-0 rounded-full border px-4 py-2 text-[13px] transition-colors ${on ? "border-ink bg-ink text-porcelain" : "border-line text-ink hover:border-ink/40"}`}
            >
              {n.occasion}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="mt-4 min-h-[7.5rem]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={current.occasion}
            initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="font-display text-[19px] lg:text-[21px] leading-[1.45] text-ink"
          >
            {current.note}
          </motion.p>
        </AnimatePresence>
      </div>
      <p className="mt-2 text-[11px] text-muted">{WAYS_TO_WEAR.credit}</p>
    </section>
  );
}
