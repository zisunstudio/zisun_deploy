/**
 * How each size of a piece will sit on *her*, worked out on her phone.
 *
 * Women choose clothes by bust and hip, not height, and those numbers are
 * personal. So:
 *
 *  - This runs entirely in the browser. Her measurements are never sent to
 *    the server, to Claude, or to anyone - the page says so, because that
 *    is the fear to remove before she types a number.
 *  - She can avoid measuring herself altogether: measure a kurta she already
 *    loves, laid flat, and we compare garment with garment.
 *  - The answer describes the garment's fit in words - close, comfortable,
 *    relaxed, roomy - for every size, at equal weight. It never describes
 *    her body, and a size letter is only the tag on the cloth.
 *
 * Charts come in two kinds and both exist in the shop. The console asked for
 * "body measurements the size is cut to fit", but a maker holding a tape
 * measures the garment - the live chart's M has a 38" waist beside a 39"
 * chest, which is a kurta, not a body. `chartKind` reads an explicit
 * `measures` when the chart has one and otherwise infers it: on a body
 * chart the waist sits well under the bust, on a kurta it does not.
 *
 * All arithmetic is in centimetres. Pure functions, unit-tested.
 */

export type Unit = "cm" | "in";
export type Measures = "body" | "garment";
export type Preference = "fitted" | "as_designed" | "relaxed";

export interface ChartRow {
  size: string;
  chest: number;
  waist: number;
  hip: number;
  top_length?: number | null;
  bottom_length?: number | null;
}
export interface Chart { unit: Unit; measures?: Measures | null; rows: ChartRow[] }

/** What she told us - either her body, or a kurta that fits her well. */
export type Input =
  | { method: "body"; bust: number; waist?: number | null; hip?: number | null }
  | { method: "garment"; chest: number; hip?: number | null };

export const BANDS = ["tight", "close", "comfortable", "relaxed", "roomy"] as const;
export type Band = (typeof BANDS)[number];

/** Said to her about the garment, never about her. */
export const BAND_WORD: Record<Band, string> = {
  tight: "too close",
  close: "close to the body",
  comfortable: "comfortable",
  relaxed: "relaxed",
  roomy: "very roomy",
};
/** When she measured her own kurta, the words compare with that kurta. */
export const BAND_WORD_VS_KURTA: Record<Band, string> = {
  tight: "much closer than yours",
  close: "a little closer than yours",
  comfortable: "like your kurta",
  relaxed: "a little roomier than yours",
  roomy: "much roomier than yours",
};

const IN = 2.54;
export const toCm = (v: number, unit: Unit) => (unit === "in" ? v * IN : v);
export const fromCm = (cm: number, unit: Unit) => (unit === "in" ? cm / IN : cm);

/** "XXL" and "2XL" are one size; so are "XXXL" and "3XL". */
export function normSize(s: string): string {
  const u = s.trim().toUpperCase().replace(/\s+/g, "");
  return ({ XXL: "2XL", XXXL: "3XL", XXXXL: "4XL" } as Record<string, string>)[u] ?? u;
}

export function chartKind(chart: Chart): Measures {
  if (chart.measures === "body" || chart.measures === "garment") return chart.measures;
  // Waist within ~7 cm of the chest on most rows: a garment, not a person.
  const rows = chart.rows.filter((r) => r.chest > 0 && r.waist > 0);
  if (rows.length === 0) return "body";
  const close = rows.filter((r) => toCm(r.chest - r.waist, chart.unit) < 7).length;
  return close >= rows.length / 2 ? "garment" : "body";
}

// Ease bands, in cm. For a garment chart against a body: garment minus body
// (a kurta needs a few cm of ease to sit at all). For a body chart against a
// body: the size's "to fit" figure minus hers (the ease is already inside
// the pattern). For a kurta against her kurta: the difference between them.
const EASE_GARMENT_V_BODY = [2.5, 6, 12, 20];
const EASE_BODY_V_BODY = [-2.5, 0, 5, 10];
const EASE_GARMENT_V_GARMENT = [-8, -3, 3, 8];
/** A laid-flat kurta is roughly this much bigger than the body it fits. */
const TYPICAL_KURTA_EASE_CM = 8;

function band(ease: number, cuts: number[]): Band {
  let i = 0;
  while (i < cuts.length && ease >= cuts[i]) i++;
  return BANDS[i];
}

export interface SizeFit {
  size: string;
  band: Band;
  /** The dimension that decided it: whichever sits closest. */
  decidedBy: "bust" | "hip";
}

export interface FitResult {
  fits: SizeFit[];
  recommended: string | null;
  /** True when even the most generous size sits close on her. */
  nothingComfortable: boolean;
  vsKurta: boolean;
  /** Lower when a body chart had to be compared with a kurta. */
  confidence: "high" | "medium";
}

const TARGET: Record<Preference, Band[]> = {
  fitted: ["close", "comfortable"],
  as_designed: ["comfortable", "relaxed", "close"],
  relaxed: ["relaxed", "comfortable", "roomy"],
};

export function fitsFor(chart: Chart, input: Input, preference: Preference, inStock?: string[]): FitResult {
  const kind = chartKind(chart);
  const stock = inStock ? new Set(inStock.map(normSize)) : null;
  const rows = chart.rows
    .filter((r) => r.chest > 0)
    .filter((r) => !stock || stock.has(normSize(r.size)));

  let cuts: number[];
  let confidence: FitResult["confidence"] = "high";
  let theirs: { bust: number; hip: number | null };

  if (input.method === "garment") {
    const chest = input.chest, hip = input.hip ?? null;
    if (kind === "garment") {
      cuts = EASE_GARMENT_V_GARMENT;
      theirs = { bust: chest, hip };
    } else {
      // A body chart and her kurta: estimate the body her kurta fits.
      cuts = EASE_BODY_V_BODY;
      theirs = { bust: chest - TYPICAL_KURTA_EASE_CM, hip: hip == null ? null : hip - TYPICAL_KURTA_EASE_CM };
      confidence = "medium";
    }
  } else {
    cuts = kind === "garment" ? EASE_GARMENT_V_BODY : EASE_BODY_V_BODY;
    theirs = { bust: input.bust, hip: input.hip ?? null };
  }

  const fits: SizeFit[] = rows.map((r) => {
    const bustEase = toCm(r.chest, chart.unit) - theirs.bust;
    const hipEase = theirs.hip != null && r.hip > 0 ? toCm(r.hip, chart.unit) - theirs.hip : Infinity;
    const decidedBy = hipEase < bustEase ? "hip" : "bust";
    return { size: normSize(r.size), band: band(Math.min(bustEase, hipEase), cuts), decidedBy };
  });

  let recommended: string | null = null;
  for (const want of TARGET[preference]) {
    const hit = fits.find((f) => f.band === want);
    if (hit) { recommended = hit.size; break; }
  }
  const nothingComfortable = fits.length > 0 && fits.every((f) => f.band === "tight" || f.band === "close");
  if (!recommended && fits.length) {
    // Nothing in her band: the most generous size that is not too close,
    // else the most generous size there is - and the page says so kindly.
    recommended = [...fits].reverse().find((f) => f.band !== "tight")?.size ?? fits[fits.length - 1].size;
  }
  return { fits, recommended, nothingComfortable, vsKurta: input.method === "garment" && kind === "garment", confidence };
}

/**
 * A kurta measurement, read the way a tailor would read it.
 *
 * Laid flat, a kurta measures well under 30" (76 cm) across; all the way
 * round it measures twice that. Customers type either, whatever the label
 * says - the founder typed "36" meaning round, the page doubled it to 72",
 * and every size came back "much closer than yours". So a value too big to
 * be a flat width is read as round, and the page says it has done so.
 */
export type KurtaMode = "across" | "round";
export const MAX_ACROSS: Record<Unit, number> = { in: 30, cm: 76 };

export function kurtaRound(value: number, unit: Unit, mode: KurtaMode): { roundCm: number; readAs: KurtaMode; corrected: boolean } {
  const corrected = mode === "across" && value > MAX_ACROSS[unit];
  const readAs: KurtaMode = corrected ? "round" : mode;
  return { roundCm: toCm(readAs === "across" ? value * 2 : value, unit), readAs, corrected };
}
