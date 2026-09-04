"use client";

import Image from "next/image";
import { BRAND, FOUNDER } from "@/lib/brand";
import { ZisunMark } from "@/components/brand/ZisunMark";
import { FeedCard, FeedItem } from "@/components/FeedCard";

interface Props {
  /** One piece of the catalogue, shown on its own. Omit to render the note alone. */
  feature?: FeedItem;
}

/**
 * The founder's note, and one piece of the catalogue beside it.
 *
 * Two jobs in one band. The left half is the only place on the site that speaks
 * in the first person - a small label brand is a person before it is a
 * catalogue, and the survey said in as many words that the doubt to answer is
 * "who is behind this and will they stand behind it". The right half is a
 * single product shown large, because a story with nothing to buy next to it is
 * a blog post.
 *
 * The words come from FOUNDER in lib/brand.ts and are null until she writes
 * them. Unwritten copy renders as nothing in production rather than as a
 * placeholder - a visible "Lorem ipsum" on a live storefront is worse than a
 * shorter page. In development the empty slots show as outlined prompts so the
 * space is obvious to whoever is filling it in.
 */
export function FounderNote({ feature }: Props) {
  const showDevSlots = process.env.NODE_ENV === "development";
  const hasWords = Boolean(FOUNDER.story || FOUNDER.quote);

  // Nothing written and nothing to show beside it: render nothing at all.
  if (!hasWords && !feature && !showDevSlots) return null;

  return (
    <section
      className="mt-14 border-y border-foreground/10 bg-foreground/[0.02]"
      aria-labelledby="founder-note-heading"
    >
      <div className="mx-auto max-w-6xl px-5 lg:px-8 py-12 lg:py-16">
        <div className="grid gap-10 lg:gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          {/* The words */}
          <div>
            <ZisunMark className="h-12 w-auto text-primary" />

            <h2
              id="founder-note-heading"
              className="sr-only"
            >
              A note from the founder
            </h2>

            {FOUNDER.quote ? (
              <blockquote className="mt-6 font-serif text-2xl lg:text-[28px] leading-snug text-foreground text-balance">
                &ldquo;{FOUNDER.quote}&rdquo;
              </blockquote>
            ) : showDevSlots ? (
              <DevSlot label="FOUNDER.quote" hint="One line she would put her name to." />
            ) : null}

            {FOUNDER.story ? (
              <p className="mt-5 max-w-prose text-[15px] leading-relaxed text-muted">
                {FOUNDER.story}
              </p>
            ) : showDevSlots ? (
              <DevSlot
                label="FOUNDER.story"
                hint="One or two sentences, in her voice. Why handloom, why these six colours."
              />
            ) : null}

            {/* The signature. Set apart from the paragraph by a short rule
                rather than by size, so it reads as a hand at the bottom of a
                letter and not as another heading. */}
            <div className="mt-7 flex items-center gap-3">
              {FOUNDER.portrait && (
                <Image
                  src={FOUNDER.portrait}
                  alt={FOUNDER.name}
                  width={40}
                  height={40}
                  className="rounded-full object-cover"
                />
              )}
              <span aria-hidden className="h-px w-8 bg-foreground/25" />
              <span className="font-serif italic text-base text-foreground">
                {BRAND.signature}
              </span>
            </div>
          </div>

          {/* One product, shown on its own */}
          {feature && (
            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
                From the loom this week
              </p>
              <div className="overflow-hidden rounded-2xl">
                <FeedCard item={feature} className="aspect-[4/5]" />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** Development-only prompt marking a slot that has no copy in it yet. */
function DevSlot({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="mt-5 rounded-lg border border-dashed border-foreground/25 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label} &mdash; not written yet
      </p>
      <p className="mt-1 text-sm text-muted">{hint}</p>
      <p className="mt-1 text-xs text-muted">
        Fill it in at <code>src/lib/brand.ts</code>. Hidden in production until then.
      </p>
    </div>
  );
}
