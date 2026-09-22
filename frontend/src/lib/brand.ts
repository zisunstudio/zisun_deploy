/**
 * The brand lockup, in one place.
 *
 * There were four straplines across the site and two of them said different
 * things - the header claimed "Cotton made for your climate" while the login
 * page said "Wear Your Story." Whichever one a visitor met first became the
 * brand as far as they were concerned.
 */

export const BRAND = {
  name: "ZISUN",

  /**
   * The tagline. Punctuation included deliberately: the comma and the full stop
   * are the line - "Tales, Antiqued." reads as a caption on an object, and
   * "Tales Antiqued" reads as two words nobody chose.
   */
  tagline: "Tales, Antiqued.",

  /**
   * The signature. Set in lower case on purpose: it is a maker's note, not a
   * second logo, and capitalising it would put it in competition with the
   * wordmark it sits under.
   */
  signature: "zisun by Sushmita",

  /**
   * The founder's ink, sampled from her original artwork rather than picked -
   * this is the exact green she drew the mark in.
   *
   * It is deliberately NOT wired into the theme yet. The site's accent is
   * `--primary` (#6B3F2A, brown) and it is used on every price, button and
   * link; swapping the accent to this green is a brand decision, not a code
   * one. Until she calls it, the mark inherits `currentColor` like any other
   * glyph and this constant exists so nobody has to re-derive it.
   */
  ink: "#465C41",

  /**
   * The real logo file, if one is ever supplied as artwork.
   *
   * Normally null: the mark ships as a vector component traced from her
   * drawing, which reverses on dark and stays crisp at every size without a
   * second asset. Point this at a file in /public only to override that.
   */
  logoSrc: null as string | null,

  /** Intrinsic ratio of that file, so the header reserves the right box. */
  logoAspect: 1,
} as const;

/** Title used in the browser tab and the manifest. */
export const BRAND_TITLE = `${BRAND.name} | ${BRAND.tagline}`;

/**
 * The founder's words.
 *
 * Kept here rather than hard-coded into the page so that changing them is a
 * one-line edit by someone who is not reading JSX, and so the home page can
 * decide what to render from whether they are filled in. `null` means "not
 * written yet": the section then shows nothing rather than a placeholder, which
 * is the one thing worse than an empty page.
 */
export const FOUNDER = {
  name: "Sushmita",
  role: "Founder",

  /** One or two sentences, in her voice. Replace with the real story. */
  // Drafted from her own words in the ZISUN Tales announcement ("a small space
  // for my close friends and those looking for their next dreamy dress … your
  // thoughts will help me understand what to bring next"). Hers to edit.
  story:
    "I started ZISUN as a small space for my close friends, and for anyone looking for their next dreamy dress. Handwoven South Indian cotton, cut for the way we actually live — every piece here is one I would wear myself." as string | null,

  /** A single line she would put her name to. */
  quote: "Tell me what you genuinely like. It decides what I make next." as string | null,

  /** Optional portrait in /public. */
  portrait: null as string | null,

  /**
   * She photographs every piece on herself, and she is 153 cm - about the
   * height of the average Indian woman (NFHS-5: 151-153 cm). That makes her
   * a truer fit guide for this customer than any agency model, which is why
   * the product page says "Worn by Sushmita" instead of "Model wears".
   */
  heightCm: 153,
  /** Under the founder line on a product page. */
  fitNote: "About the height of most Indian women, so this is close to how it will sit on you.",
  /** In her note on the home page. First person, hers to rewrite. */
  modelNote: "Every piece here is photographed on me. I am 153 cm, like most of the women I make these for - so what you see is how it really falls.",
} as const;

/**
 * The home page's opening line.
 *
 * Written to be edited. The headline is two parts so the second can be set in
 * italic - the one flourish the hero allows itself. The sub-line is about
 * her, not about cotton: identity first, material later. `credit` is the
 * word before the featured piece's name, set like a magazine credit line
 * ("Worn: Purple Rose co-ord") so the product is a credit, not the subject.
 */
// The eyebrow and sub-line are computed from the catalogue (lib/truth.ts):
// they name a fabric, craft or region only when every live piece records
// it. The headline is position, not fact, and stays.
export const HERO = {
  headline: "Not made for",
  headlineItalic: "everyone.",
  cta: "See the drop",
  credit: "Worn",
} as const;

/**
 * What the label is for, in three lines. This is the identity the products
 * are expressions of, and it sits between the drop and the categories so a
 * visitor meets the point of view before the taxonomy. Hers to rewrite.
 */
// The body sentence is computed from the catalogue (lib/truth.ts).
export const MANIFESTO = {
  lines: ["Clothes for the days that matter.", "Which, it turns out, is all of them."],
} as const;

/** The category section's question. Categories answer it as occasions. */
export const OCCASIONS = {
  eyebrow: "By occasion",
  heading: "What are you dressing for?",
} as const;

// The "made of" facts are computed from the catalogue (lib/truth.ts,
// craftFacts). They once said Mangalgiri, Ilkal, Kasavu, woven by hand and
// never re-run over a silk piece and a Rajasthani print; no constant may
// state a fact about the cloth again.

/**
 * The site knows what time it is.
 *
 * ZISUN is a point of view about the ordinary day, so the page says
 * something about the part of the day the visitor is actually in. One line,
 * under the hero, from her own clock. `from` is the hour it starts (24h);
 * the last entry before the current hour wins, and the list wraps, so the
 * late-night line also covers the small hours. Hers to rewrite - keep them
 * short enough for two lines on a phone.
 */
export const DAYPARTS = [
  { from: 5, greeting: "Good morning.", line: "The day has not decided what it is yet. You can." },
  { from: 11, greeting: "It is the middle of the day.", line: "The best-dressed hour is the one nobody planned." },
  { from: 16, greeting: "Good evening.", line: "Somewhere to be, or nowhere at all. Both deserve cotton." },
  { from: 21, greeting: "It is late.", line: "Tomorrow's outfit is a good thing to fall asleep having decided." },
] as const;

export function daypartAt(hour: number) {
  const past = DAYPARTS.filter((d) => d.from <= hour);
  return past.length ? past[past.length - 1] : DAYPARTS[DAYPARTS.length - 1];
}

/**
 * The loom on the home page: a cloth in the colours of the current drop,
 * woven by the visitor's scroll, and a different cloth every day.
 */
// The pattern on the home page and each piece's "mark" are GENERATED from
// colours - they are not pictures of the fabric, and they are not how any
// piece was made. The words must never say otherwise: "Every piece begins
// like this", "by hand", "no other piece has this cloth" and "Herringbone"
// all did, over pieces bought in and one recorded as silk. They are the
// label's signature, and said to be exactly that.
export const LOOM = {
  eyebrow: "Today's pattern",
  heading: "A new one every day.",
  body: "Drawn from the colours of this week's pieces. Keep scrolling and you weave it.",
  touch: "Go on, touch it.",
} as const;

/** The caption under a piece's own weave on its product page. */
export const WEAVE = {
  eyebrow: "Its ZISUN mark",
  body: "A pattern drawn from this piece's colours: its own signature, not a picture of the fabric. The photographs show the fabric; this mark and its number are on the tag.",
  touch: "Tilt your phone, or touch it.",
} as const;

/**
 * "Ways to wear it" on the product page. The credit line is there because
 * it is true: the notes are drafted with AI in the console and she edits and
 * approves every one. Saying so is the honest version of an "AI stylist".
 */
export const WAYS_TO_WEAR = {
  eyebrow: "Ways to wear it",
  credit: "Drafted with AI, edited and approved by Sushmita.",
} as const;

/**
 * What the product page says about availability.
 *
 * Only ever shown when it is true. `lowStockAt` is the count at or below
 * which the page names the number; above it the page says nothing at all,
 * because "In stock" on a healthy size is noise and a number on a healthy
 * size is theatre. The scarcity here is real and it is already the label's
 * position: small batches, no re-runs, stated in MANIFESTO on the home page.
 */
export const AVAILABILITY = {
  lowStockAt: 3,
  /** Before a size is chosen, the whole colour counts - shown at or below this. */
  colourLowAt: 8,
  soldOut: "Sold out in this size",
  // Only what is true of stock we buy in: there is very little of it.
  batch: "We keep very few of each. When a size sells out, it may not come back.",
} as const;

/**
 * When the whole collection is small, it is presented as the drop it is,
 * not as a catalogue that has not filled up yet. Below this many pieces the
 * collection page loses its filter and sort chrome, the count reads as a
 * decision, and the home page stops offering "Everything" it already shows.
 */
export const SMALL_COLLECTION_AT = 6;
export const DROP = {
  /** "Two pieces. That is the drop." - the count in words, then this line. */
  small: "That is the drop. When a piece goes, it goes.",
} as const;

/** The pieces in a set, said the way she would say it. */
export const INCLUDED = {
  label: "What you get",
} as const;
