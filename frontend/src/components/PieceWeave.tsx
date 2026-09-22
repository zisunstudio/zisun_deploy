"use client";
import { useState } from "react";
import { ClothWeave } from "@/components/ClothWeave";
import { INTERLACE_NAME, type WeaveSpec } from "@/lib/weave";
import { WEAVE } from "@/lib/brand";

/**
 * This piece's own cloth.
 *
 * Seeded by the product's id and drawn in its real colours, led by whichever
 * colour is selected - so choosing Indigo re-weaves the cloth in indigo. The
 * number is stable for the piece: it is the same on every visit and every
 * device, which is what lets it mean something ("mine is No. 4F2A").
 *
 * It sits after the reasons and the assurances and before the fabric facts:
 * it is the bridge between wanting the piece and reading what it is made of.
 */
export function PieceWeave({ productId, colours }: { productId: string; colours: string[] }) {
  const [spec, setSpec] = useState<WeaveSpec | null>(null);
  return (
    <section className="mt-10" aria-label={WEAVE.eyebrow}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-burgundy">{WEAVE.eyebrow}</p>
        {spec && (
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted tabular-nums">
            No. {spec.code} · {INTERLACE_NAME[spec.interlace]}
          </p>
        )}
      </div>
      <div className="mt-3 aspect-[3/2] rounded-lg overflow-hidden bg-rose">
        <ClothWeave seed={productId} colours={colours} label="This piece's weave as cloth; tilt your phone or touch it" onSpec={setSpec} />
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-muted">
        {WEAVE.body} <span className="text-ink">{WEAVE.touch}</span>
      </p>
    </section>
  );
}
