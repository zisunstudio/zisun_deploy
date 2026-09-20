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
} as const;

/**
 * The home page's opening line.
 *
 * Written to be edited. The headline is two parts so the second can be set in
 * italic - the one flourish the hero allows itself - and the sub-line says the
 * true thing about small-batch handloom: a colour that sells out is a dye lot
 * that will not be repeated. That is scarcity as a fact, not as a countdown.
 */
export const HERO = {
  eyebrow: "Handloom · small batches",
  headline: "Not made for",
  headlineItalic: "everyone.",
  sub: "Handwoven South Indian cotton, cut for the way you actually live. When a colour goes, that dye lot goes with it.",
  cta: "Shop the drop",
} as const;

/**
 * The ribbon under the hero. Every line is a promise the policy pages already
 * keep - the ribbon is the trust badges said out loud, not a new claim.
 */
export const TICKER = [
  "Handloom cotton",
  "Mangalgiri · Ilkal · Kasavu",
  "Ships across India",
  "Size exchange, no questions",
  "Small batches, never re-run",
  "zisun by Sushmita",
] as const;
