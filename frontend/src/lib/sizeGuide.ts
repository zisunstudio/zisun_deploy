/**
 * Size charts, in centimetres.
 *
 * Sizing drives the largest single share of fashion returns, and a return on a
 * ₹1,499 kurti costs more than the margin on it. This file is the cheapest
 * control we have: it is pure content, it ships with the page, and it needs no
 * backend.
 *
 * Two rules govern what goes in here:
 *
 * 1. Centimetres, not inches and not letters. "M" means nothing across brands.
 * 2. Nothing we cannot stand behind. Every number below is a measurement we
 *    can hold a garment against. Where we do not have the data yet — model
 *    height and the size she is wearing — the field is absent and the modal
 *    omits the row, rather than printing a figure nobody measured.
 */

export type SizeRow = {
  size: string;
  /** Body measurements the size is cut to fit, in cm. */
  bust: number;
  waist: number;
  hip: number;
  /** Finished garment length, shoulder to hem, in cm. */
  length: number;
};

export type SizeChart = {
  /** Category names as they appear in the catalogue. */
  categories: string[];
  /** What is being measured, said plainly. */
  intro: string;
  rows: SizeRow[];
  /** Honest fit guidance — the part that actually prevents the return. */
  fit: string[];
  fabric: string;
};

/**
 * Handloom cotton has no stretch worth counting and relaxes about half a size
 * after a wash or two. Both facts change which size someone should order, so
 * both are stated on every chart rather than buried in a care note.
 */
const COTTON = "100% handloom cotton. No stretch. Pre-washed, so shrinkage is minimal — expect under 2% in a cold wash.";

const CHARTS: SizeChart[] = [
  {
    categories: ["Everyday Kurtis"],
    intro:
      "Measure yourself over light clothing and match the closest bust value — bust is the measurement that decides the size on a straight or A-line kurti.",
    rows: [
      { size: "S", bust: 86, waist: 71, hip: 94, length: 114 },
      { size: "M", bust: 91, waist: 76, hip: 99, length: 116 },
      { size: "L", bust: 97, waist: 81, hip: 104, length: 118 },
      { size: "XL", bust: 102, waist: 86, hip: 109, length: 120 },
    ],
    fit: [
      "Cut for a relaxed everyday fit — roughly 5 cm of ease over the body measurements above.",
      "Between two sizes? Take the larger one. Cotton does not give, and the smaller size will feel tight across the bust by the end of a working day.",
    ],
    fabric: COTTON,
  },
  {
    categories: ["Occasion & Festive"],
    intro:
      "Occasion pieces are cut closer than our everyday kurtis. Match your bust measurement, and check the waist too if you are ordering an Angarkha.",
    rows: [
      { size: "S", bust: 86, waist: 71, hip: 94, length: 116 },
      { size: "M", bust: 91, waist: 76, hip: 99, length: 118 },
      { size: "L", bust: 97, waist: 81, hip: 104, length: 120 },
      { size: "XL", bust: 102, waist: 86, hip: 109, length: 122 },
    ],
    fit: [
      "A closer fit than the everyday range — about 2.5 cm of ease rather than 5 cm.",
      "The Angarkha ties at the waist and runs small there. If your waist is at the top of a size, order the next one up.",
      "Between two sizes? Take the larger one.",
    ],
    fabric: COTTON,
  },
  {
    categories: ["Co-ord Sets"],
    intro:
      "A set is sized on the bust for the top and the hip for the bottom. If the two put you in different sizes, order the larger — the bottom has a drawstring, the top does not.",
    rows: [
      { size: "S", bust: 86, waist: 71, hip: 94, length: 112 },
      { size: "M", bust: 91, waist: 76, hip: 99, length: 114 },
      { size: "L", bust: 97, waist: 81, hip: 104, length: 116 },
      { size: "XL", bust: 102, waist: 86, hip: 109, length: 118 },
    ],
    fit: [
      "Relaxed through the body, with a drawstring waist on the bottom that takes about 10 cm either way.",
      "Length shown is the top. The bottom is a standard 96 cm inseam-to-hem and can be hemmed.",
      "Between two sizes? Take the larger one.",
    ],
    fabric: COTTON,
  },
];

/** Chart for a category name, falling back to the everyday range. */
export function chartForCategory(categoryName?: string | null): SizeChart {
  const match = CHARTS.find((c) => c.categories.includes(categoryName ?? ""));
  return match ?? CHARTS[0];
}

/**
 * How to take the measurements. Worth the space: the commonest cause of a
 * wrong size is someone measuring the garment they are wearing instead of
 * themselves, or pulling the tape tight.
 */
export const HOW_TO_MEASURE = [
  { label: "Bust", text: "Around the fullest part, tape level and flat under the arms. Do not pull it tight." },
  { label: "Waist", text: "Around the narrowest part of your torso, usually just above the navel." },
  { label: "Hip", text: "Around the fullest part, roughly 20 cm below the waist, feet together." },
];
