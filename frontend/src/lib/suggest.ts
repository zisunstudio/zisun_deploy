/**
 * Fill the listing form from what her own catalogue already knows.
 *
 * As she types a name (or says the piece aloud), the form's empty fields are
 * filled from the pieces she has already listed: the price of the most
 * similar ones, their category, what is in the set, the wash care for that
 * fabric. She can change or undo any of it.
 *
 * Why this and not a trained model: the catalogue is a handful of pieces. A
 * model fitted to eight examples would be a guess with a confident face.
 * Finding the pieces most like this one and reading the answer off them is
 * the honest method at this size, it improves with every piece she adds
 * with no retraining, and - the part that matters - every suggestion can
 * say exactly which pieces it came from. Understanding her spoken words is a
 * different job and is done by the language model (`AiComposer`).
 *
 * Two kinds of suggestion, kept apart because one is a judgement and the
 * other is a fact:
 *
 *  - **From similar pieces** (price, category, wash care, what is in the
 *    set): a judgement, always shown with the pieces it came from.
 *  - **From her own words** (fabric, print): only when the word is literally
 *    in what she typed and her catalogue already uses it. Nothing about the
 *    cloth is inferred from resemblance - a brand claim must be true of the
 *    piece (CLAUDE.md), and "similar pieces were handloom" is not evidence.
 *
 * Pure functions, so the rules are unit-tested without a browser.
 */
import { PALETTE_NAMES } from "@/lib/colours";

export type Piece = {
  id: string; name: string; pricePaise: number; categoryId: string; categoryName: string;
  fabric: string; washCare: string; setPieces: string[]; printType: string;
};

export type SuggestInput = {
  name: string;
  /** Her spoken or typed description in the "say the product" box. */
  words: string;
  category_id: string;
  fabric_composition: string;
  set_pieces: string[];
};

export type SuggestField = "base_price_rupees" | "category_id" | "set_pieces" | "dupatta_included" | "fabric_composition" | "wash_care" | "print_type";
export type Suggestion = { field: SuggestField; value: string | string[]; label: string; show: string; reason: string };

/** One row of the console's product list, reduced to what suggestions read. */
export function toPiece(p: any): Piece | null {
  if (!p?.id || !p?.name || !(p.base_price > 0)) return null;
  return {
    id: String(p.id), name: String(p.name), pricePaise: Number(p.base_price),
    categoryId: p.category?.id ?? p.category_id ?? "", categoryName: p.category?.name ?? "",
    fabric: (p.fabric_specs?.fabric_composition ?? p.fabric_composition ?? "").trim(),
    washCare: (p.fabric_specs?.wash_care ?? p.wash_care ?? "").trim(),
    setPieces: (p.garment_attributes?.set_pieces ?? p.set_pieces ?? []).filter(Boolean),
    printType: (p.garment_attributes?.print_type ?? p.print_type ?? "").trim(),
  };
}

// The same thing spelt several ways: her own catalogue has "Bhandini",
// "Bandhani", "Dhabu" and "Dabu".
const ALIASES: [RegExp, string][] = [
  [/\bbh?andh?[ia]ni\b/g, "bandhani"], [/\bikk?at\b/g, "ikat"], [/\bdh?abu\b/g, "dabu"], [/\bajrak?h\b/g, "ajrakh"],
  [/\bmul[\s-]?mul\b/g, "mulmul"], [/\bchik[ae]n ?kari\b/g, "chikankari"], [/\bco[\s-]?ord(s|inate)?\b/g, "coord"],
  [/\bkurt[ai]s?\b/g, "kurta"], [/\b(3|three)[\s-]?(piece|pc|pcs)s?\b/g, "3piece"], [/\b(2|two)[\s-]?(piece|pc|pcs)s?\b/g, "2piece"],
];
// Words that say nothing about what a piece is, and colours: a red set and a
// blue set of the same make cost the same.
const STOP = new Set([
  "set", "sets", "with", "and", "the", "a", "an", "of", "in", "for", "to", "piece", "pieces", "women", "womens", "inspired", "type",
  "fabric", "rich", "new", "style", "wear", ...PALETTE_NAMES.flatMap((c) => c.toLowerCase().split(" ")), "coffee", "rose",
]);
const GENERIC_FABRIC = new Set(["cotton", "fabric", "type", "textured", "blend", "pure", "soft", "handloom"]);
const GENERIC_PRINT = new Set(["print", "printed", "pattern", "solid", "design", "all", "over"]);

export function tokens(text: string): string[] {
  let t = ` ${text.toLowerCase()} `;
  for (const [re, to] of ALIASES) t = t.replace(re, to);
  return Array.from(new Set(t.split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w))));
}

const rupees = (paise: number) => "₹" + Math.round(paise / 100).toLocaleString("en-IN");
const names = (ps: Piece[]) => {
  const n = ps.slice(0, 3).map((p) => `${p.name} (${rupees(p.pricePaise)})`);
  return n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
};
/** The most frequent value; ties go to the one seen first. Null for nothing. */
function mode<T>(values: T[], key: (v: T) => string = String): { value: T; count: number } | null {
  const seen = new Map<string, { value: T; count: number }>();
  for (const v of values) { const k = key(v); const e = seen.get(k); if (e) e.count++; else seen.set(k, { value: v, count: 1 }); }
  let best: { value: T; count: number } | null = null;
  seen.forEach((e) => { if (!best || e.count > best.count) best = e; });
  return best;
}

/** How many pieces the set has, from her words, or null if she has not said. */
export function setSizeFrom(tok: string[], setPieces: string[]): number | null {
  if (setPieces.length) return setPieces.length;
  if (tok.includes("3piece")) return 3;
  if (tok.includes("2piece") || tok.includes("coord")) return 2;
  return null;
}

/** Pieces like the one being described, most alike first, with why. */
export function similar(input: SuggestInput, pieces: Piece[]): { piece: Piece; score: number }[] {
  const tok = tokens(`${input.name} ${input.words}`);
  const fabricTok = tokens(`${input.fabric_composition} ${input.name} ${input.words}`).filter((t) => !GENERIC_FABRIC.has(t));
  const size = setSizeFrom(tok, input.set_pieces);
  return pieces.map((piece) => {
    let score = 0;
    if (size != null && piece.setPieces.length === size) score += 3;
    if (input.category_id && piece.categoryId === input.category_id) score += 2;
    const pf = tokens(piece.fabric).filter((t) => !GENERIC_FABRIC.has(t));
    score += Math.min(4, pf.filter((t) => fabricTok.includes(t)).length * 2);
    const pn = tokens(piece.name);
    score += Math.min(3, pn.filter((t) => tok.includes(t)).length);
    return { piece, score };
  }).filter((x) => x.score >= 3).sort((a, b) => b.score - a.score);
}

export function suggest(input: SuggestInput, pieces: Piece[]): Suggestion[] {
  const said = `${input.name} ${input.words}`.trim();
  if (said.length < 3 || pieces.length === 0) return [];
  const tok = tokens(said);
  const out: Suggestion[] = [];

  const ranked = similar(input, pieces);
  // "Like these": the best match and anything nearly as good, four at most.
  const close = ranked.filter((x) => x.score >= ranked[0].score - 1.5).slice(0, 4).map((x) => x.piece);

  // ── Her own words: fabric and print, only when literally mentioned ────────
  let fabric = input.fabric_composition.trim();
  if (!fabric) {
    const hits = pieces.filter((p) => p.fabric && tokens(p.fabric).some((t) => !GENERIC_FABRIC.has(t) && tok.includes(t)));
    const m = mode(hits.map((p) => p.fabric), (f) => f.toLowerCase());
    if (m) {
      const word = tokens(m.value).find((t) => !GENERIC_FABRIC.has(t) && tok.includes(t));
      fabric = m.value;
      out.push({ field: "fabric_composition", value: m.value, label: "Fabric", show: m.value, reason: `You said "${word}". Your other pieces call it "${m.value}".` });
    }
  }
  {
    const hits = pieces.filter((p) => p.printType && tokens(p.printType).some((t) => !GENERIC_PRINT.has(t) && tok.includes(t)));
    const m = mode(hits.map((p) => p.printType), (f) => f.toLowerCase());
    if (m) {
      const word = tokens(m.value).find((t) => !GENERIC_PRINT.has(t) && tok.includes(t));
      out.push({ field: "print_type", value: m.value, label: "Print", show: m.value, reason: `You said "${word}". Your other pieces call it "${m.value}".` });
    }
  }

  // ── What is in the set ────────────────────────────────────────────────────
  let setPieces = input.set_pieces;
  if (!setPieces.length) {
    const size = setSizeFrom(tok, []);
    if (size != null) {
      const pool = (close.filter((p) => p.setPieces.length === size).length ? close : pieces).filter((p) => p.setPieces.length === size);
      const m = mode(pool.map((p) => p.setPieces), (s) => [...s].map((x) => x.toLowerCase()).sort().join("+"));
      if (m) {
        setPieces = m.value;
        out.push({ field: "set_pieces", value: m.value, label: "What is in the set", show: m.value.join(" + "),
          reason: `Your other ${size}-piece sets are ${m.value.join(" + ")}.` });
      }
    }
  }
  if (setPieces.length) {
    const has = setPieces.some((s) => s.toLowerCase() === "dupatta");
    out.push({ field: "dupatta_included", value: has ? "yes" : "no", label: "Dupatta", show: has ? "Included" : "Not included",
      reason: has ? "The set has a dupatta." : "The set has no dupatta." });
  }

  // ── From the most similar pieces: category, price, wash care ──────────────
  if (close.length) {
    if (!input.category_id) {
      const m = mode(close.filter((p) => p.categoryId), (p) => p.categoryId);
      if (m) out.push({ field: "category_id", value: m.value.categoryId, label: "Category", show: m.value.categoryName || "Same as similar pieces",
        reason: `Where your similar pieces are: ${close.slice(0, 3).map((p) => p.name).join(", ")}.` });
    }
    const sorted = close.map((p) => p.pricePaise).sort((a, b) => a - b);
    const price = sorted[Math.floor((sorted.length - 1) / 2)];
    out.unshift({ field: "base_price_rupees", value: String(Math.round(price / 100)), label: "Price", show: rupees(price),
      reason: close.length === 1 ? `The price of your most similar piece: ${names(close)}.` : `The middle price of your most similar pieces: ${names(close)}.` });
  }
  {
    const sameFabric = fabric ? pieces.filter((p) => p.washCare && p.fabric.toLowerCase() === fabric.toLowerCase()) : [];
    const pool = sameFabric.length ? sameFabric : close.filter((p) => p.washCare);
    const m = mode(pool.map((p) => p.washCare), (w) => w.toLowerCase());
    // From one piece it is a copy, not a pattern - unless it is the same fabric.
    if (m && (sameFabric.length || m.count >= 2)) {
      out.push({ field: "wash_care", value: m.value, label: "Wash care", show: m.value,
        reason: sameFabric.length ? `What you wrote for your other ${fabric} pieces.` : "What you wrote for your similar pieces." });
    }
  }
  return out;
}

// ── Her words without the language model ─────────────────────────────────────

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"];
const normSize = (s: string) => s.toUpperCase().replace(/^XXXL$/, "3XL").replace(/^XXL$/, "2XL");
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/**
 * The plain facts in a spoken description - price, sizes, colours, stock -
 * read with rules. Used when the language model cannot be reached, so
 * "Fill the form" still does something useful on a bad day. It does not
 * write a name or a description; those need the model, or her.
 */
export function parseWords(text: string): { base_price_rupees: number | null; sizes: string[]; colours: string[]; stock_per_variant: number | null } {
  const t = ` ${text} `;
  const price = t.match(/(?:₹|rs\.?|inr|rupees?|price(?:d)?(?: is| at| of)?)\s*([0-9][0-9,]{2,6})\b/i) ?? t.match(/\b([0-9][0-9,]{2,6})\s*(?:₹|rs\.?|rupees?|inr)\b/i);
  const sizeRe = "(XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL)";
  const sizes = new Set<string>();
  const range = t.match(new RegExp(`\\b${sizeRe}\\s*(?:to|-|–|through|till)\\s*${sizeRe}\\b`, "i"));
  if (range) {
    const a = SIZE_ORDER.indexOf(normSize(range[1])), b = SIZE_ORDER.indexOf(normSize(range[2]));
    if (a >= 0 && b >= a) SIZE_ORDER.slice(a, b + 1).forEach((s) => sizes.add(s));
  }
  // Single letters are only sizes next to the word "size" or in a list of sizes.
  const listed = t.match(new RegExp(`\\bsizes?\\s*:?\\s*((?:${sizeRe}\\s*(?:,|and|&|/)?\\s*)+)`, "i"));
  if (listed) (listed[1].match(new RegExp(sizeRe, "gi")) ?? []).forEach((s) => sizes.add(normSize(s)));
  (t.match(/\b(XXL|XXXL|2XL|3XL|4XL|XL|XS)\b/gi) ?? []).forEach((s) => sizes.add(normSize(s)));
  const colours = PALETTE_NAMES.filter((c) => new RegExp(`\\b${c}\\b`, "i").test(t))
    // "Rani Pink" should not also count as "Pink".
    .filter((c, _, all) => !all.some((o) => o !== c && o.toLowerCase().includes(c.toLowerCase())));
  const stock = t.match(/\b([0-9]{1,3}|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:of\s+)?(?:each|per size|in each|pieces? each|pcs? each)\b/i);
  return {
    base_price_rupees: price ? Number(price[1].replace(/,/g, "")) : null,
    sizes: SIZE_ORDER.filter((s) => sizes.has(s)),
    colours,
    stock_per_variant: stock ? (NUMBER_WORDS[stock[1].toLowerCase()] ?? Number(stock[1])) : null,
  };
}
