/**
 * The words the site is allowed to use about the cloth, from the catalogue.
 *
 * `GET /catalog/truth` (backend services/truth.py) says which claims the
 * live pieces support. These functions turn that into the home page's
 * eyebrow, the manifesto's factual sentence, the "made of" facts, the footer
 * line and the meta description. Positioning ("Not made for everyone",
 * "Clothes for the days that matter") is not a fact and stays as written;
 * anything about fabric, craft, origin or batches comes from here or is not
 * said. When nothing is recorded, the copy falls back to what is always
 * true: kurtas and co-ord sets, chosen by Sushmita in Bengaluru.
 */
export interface Claim { key: "fabric" | "craft" | "origin" | "batch"; text: string; pieces: number; of: number }
export interface Truth {
  pieces: number;
  fabrics: string[];
  crafts: string[];
  origins: string[];
  all_cotton: boolean;
  any_handloom: boolean;
  all_handloom: boolean;
  all_never_rerun: boolean;
  max_batch: number | null;
  claims: Claim[];
  missing: string[];
}

export const EMPTY_TRUTH: Truth = { pieces: 0, fabrics: [], crafts: [], origins: [], all_cotton: false, any_handloom: false, all_handloom: false, all_never_rerun: false, max_batch: null, claims: [], missing: [] };

const claim = (t: Truth, key: Claim["key"]) => t.claims.find((c) => c.key === key && c.pieces === c.of) ?? null;

/** "Handloom cotton · Mangalgiri · Ilkal" / "Cotton · Bengaluru" / "Kurtas & co-ord sets · Bengaluru". */
export function heroEyebrow(t: Truth): string {
  const fabric = claim(t, "fabric")?.text ?? "Kurtas & co-ord sets";
  const origin = claim(t, "origin")?.text ?? "Bengaluru";
  return `${fabric} · ${origin}`;
}

/** The hero's second line. The cut is ours to describe; the cloth only when true. */
export function heroSub(t: Truth): string {
  if (t.all_handloom && t.all_cotton) return "Handwoven cotton, cut for women who dress for themselves.";
  if (t.all_cotton) return "Cotton, cut for women who dress for themselves.";
  return "Cut for women who dress for themselves.";
}

/** The manifesto's factual sentence, after its two lines of position. */
export function manifestoBody(t: Truth): string {
  const parts: string[] = [];
  const fabric = claim(t, "fabric");
  const origin = claim(t, "origin");
  if (fabric && origin) parts.push(`${fabric.text} from ${origin.text.replace(/ · /g, ", ").replace(/, ([^,]+)$/, " and $1")}, cut to move`);
  else if (fabric) parts.push(`${fabric.text}, cut to move`);
  else parts.push("Cut to move, and chosen one piece at a time");
  const batch = claim(t, "batch");
  parts.push(batch ? batch.text.toLowerCase().replace(/^small batches/, "made in small batches") : "kept in small numbers");
  const s = parts.join(", ") + ".";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Up to three facts for the "made of" section; fewer than two hides it. */
export function craftFacts(t: Truth): Array<{ title: string; body: string }> {
  const out: Array<{ title: string; body: string }> = [];
  const origin = claim(t, "origin");
  const craft = claim(t, "craft");
  if (origin) out.push({ title: origin.text, body: craft ? "Woven by hand, on looms that have made cloth this way for generations." : `Where every piece here is from.` });
  const batch = claim(t, "batch");
  if (batch) out.push({ title: "Small batches", body: batch.text.replace(/^Small batches - /, "").replace(/^Never re-run\. /, "Never re-run: ") + "." });
  if (t.all_cotton) out.push({ title: "Cotton, for the heat", body: "Breathable cotton for Indian summers and long days." });
  return out.slice(0, 3);
}

/** One line for the footer and the meta description. */
export function shortLine(t: Truth): string {
  const fabric = claim(t, "fabric");
  const batch = claim(t, "batch");
  const what = fabric ? `${fabric.text} kurtas and co-ord sets` : "Kurtas and co-ord sets";
  return `${what}, chosen by Sushmita in Bengaluru${batch ? ", in small batches" : ""}.`;
}
