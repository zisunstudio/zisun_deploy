"use client";
import Image from "next/image";
import { BRAND, FOUNDER } from "@/lib/brand";
import { ZisunMark } from "@/components/brand/ZisunMark";

/**
 * The founder's note.
 *
 * The only place on the site that speaks in the first person. A small label
 * is a person before it is a catalogue, and the doubt to answer is "who is
 * behind this and will they stand behind it". Nothing to buy sits beside it
 * any more: the drop is above, and a product card next to her words made the
 * note read as a sales device. Her line is set in the display italic; her
 * signature is the one thing on the site in a handwriting face.
 *
 * The words come from FOUNDER in lib/brand.ts and are null until she writes
 * them. Unwritten copy renders as nothing in production rather than as a
 * placeholder; in development the empty slots show as outlined prompts.
 */
export function FounderNote() {
  const showDevSlots = process.env.NODE_ENV === "development";
  const hasWords = Boolean(FOUNDER.story || FOUNDER.quote);
  if (!hasWords && !showDevSlots) return null;
  return (
    <section className="mt-24 lg:mt-32 bg-rose" aria-labelledby="founder-note-heading">
      <div className="mx-auto max-w-3xl px-5 lg:px-8 py-16 lg:py-24">
        <ZisunMark className="h-10 w-auto text-burgundy" />
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-burgundy">A note from {FOUNDER.name}</p>
        <h2 id="founder-note-heading" className="sr-only">A note from the founder</h2>
        {FOUNDER.quote ? (
          <blockquote className="mt-4 font-display italic text-[30px] lg:text-[40px] leading-[1.12] text-ink text-balance">
            &ldquo;{FOUNDER.quote}&rdquo;
          </blockquote>
        ) : showDevSlots ? (
          <DevSlot label="FOUNDER.quote" hint="One line she would put her name to." />
        ) : null}
        {FOUNDER.story ? (
          <p className="mt-6 max-w-prose text-[15px] lg:text-base leading-relaxed text-ink/80">{FOUNDER.story}</p>
        ) : showDevSlots ? (
          <DevSlot label="FOUNDER.story" hint="One or two sentences, in her voice." />
        ) : null}
        {/* The fit promise, in her voice: she is the model, and she is the
            customer's height. Said once here, and on every piece she wears. */}
        {FOUNDER.modelNote && (
          <p className="mt-4 max-w-prose text-[15px] lg:text-base leading-relaxed text-ink/80">{FOUNDER.modelNote}</p>
        )}
        <div className="mt-8 flex items-center gap-3">
          {FOUNDER.portrait && (
            <Image src={FOUNDER.portrait} alt={FOUNDER.name} width={40} height={40} className="rounded-full object-cover" />
          )}
          <span aria-hidden className="h-px w-8 bg-ink/25" />
          <span className="font-hand text-2xl text-ink">{BRAND.signature}</span>
        </div>
      </div>
    </section>
  );
}

/** Development-only prompt marking a slot that has no copy in it yet. */
function DevSlot({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="mt-5 rounded-lg border border-dashed border-foreground/25 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label} &mdash; not written yet</p>
      <p className="mt-1 text-sm text-muted">{hint}</p>
      <p className="mt-1 text-xs text-muted">Fill it in at <code>src/lib/brand.ts</code>. Hidden in production until then.</p>
    </div>
  );
}
