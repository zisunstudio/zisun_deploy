/**
 * The loom.
 *
 * Every piece ZISUN sells is a cloth somebody wove, and no photograph shows
 * that. This draws one: a warp, a weft, a selvedge, an interlacing pattern -
 * the actual structure of handloom cotton, not a texture image - generated
 * from a seed and the piece's own colours. The same seed always weaves the
 * same cloth, so a product's weave is *its* weave: it can be shown on the
 * product page today and printed on a swing tag next year and they match.
 *
 * Pure functions, no DOM beyond the 2D context handed in, so the draw can be
 * tested and reused (a share card, an order keepsake) without the component.
 *
 * Colours come from the palette in `colours.ts` by name. There are no hex
 * codes in this file on purpose - see "one palette" in CLAUDE.md.
 */
import { paletteColour } from "@/lib/colours";

export type Interlace = "plain" | "twill" | "basket" | "herringbone";

export interface WeaveSpec {
  cols: number;
  rows: number;
  /** Colour of each vertical thread, left to right. */
  warp: string[];
  /** Colour of each horizontal thread, top to bottom. */
  weft: string[];
  /** Columns at each edge woven as selvedge rather than body. */
  border: number;
  interlace: Interlace;
  /** Four hex digits, for "Weave No. 4F2A". Stable for a seed. */
  code: string;
}

/** A finger on the cloth: where, and how long ago (ms). */
export interface Ripple { x: number; y: number; age: number }

const RIPPLE_MS = 1400;

// ── Seeded randomness ───────────────────────────────────────────────────────

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Colour ──────────────────────────────────────────────────────────────────

function hexOf(name: string): string | null {
  const c = paletteColour(name);
  if (!c) return null;
  // "Multicolour" is a gradient for a swatch dot; a thread is one colour.
  return c.hex.startsWith("linear") ? null : c.hex;
}

const MULTI = ["Rani Pink", "Yellow", "Indigo"];

/** Blend two palette hexes; `t` is how much of `b`. Threads are dyed, not picked. */
function mix(a: string, b: string, t: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) => Math.round(ch(a, i) * (1 - t) + ch(b, i) * t));
  return `rgb(${out[0]},${out[1]},${out[2]})`;
}

/** Palette names → thread colours, dropping anything the palette cannot name. */
function threads(names: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const n of names) {
    if (!n) continue;
    const c = paletteColour(n);
    const list = c?.name === "Multicolour" ? MULTI : [n];
    for (const m of list) {
      const hex = hexOf(m);
      if (hex && !out.includes(hex)) out.push(hex);
    }
  }
  return out;
}

// ── The cloth ───────────────────────────────────────────────────────────────

/**
 * Design a cloth.
 *
 * The structure is the one South Indian handloom cotton actually has: a body
 * in the piece's colour shot with an ivory weft (which is what gives
 * Mangalgiri its depth - the warp and weft are different colours and the eye
 * mixes them), pinstripes at irregular intervals, and a contrasting border
 * band at each selvedge. The seed decides the interlacing, where the
 * pinstripes fall and how the border is striped.
 */
export function designWeave(
  seedText: string,
  colourNames: (string | null | undefined)[],
  size: { cols: number; rows: number } = { cols: 72, rows: 48 },
): WeaveSpec {
  const seed = hash(seedText);
  const rand = rng(seed);
  const { cols, rows } = size;

  const ivory = hexOf("Ivory")!;
  const burgundy = hexOf("Burgundy")!;
  const gold = hexOf("Gold")!;

  const own = threads(colourNames);
  const body = own[0] ?? burgundy;
  const second = own[1] ?? ivory;
  // The border is the label's hand on the cloth: burgundy and gold, unless
  // the piece is itself burgundy, in which case it reverses to ivory so the
  // border still reads as a border.
  const edge = body === burgundy ? ivory : burgundy;

  const interlace = (["plain", "twill", "basket", "herringbone"] as const)[Math.floor(rand() * 4)];
  const border = Math.max(4, Math.round(cols * 0.12));

  // Border stripes: edge colour, broken by one or two gold threads.
  const goldAt = new Set([1 + Math.floor(rand() * 2), border - 2 - Math.floor(rand() * 2)]);
  const borderThread = (i: number) => (goldAt.has(i) ? gold : edge);

  // Pinstripes in the body, at irregular seeded intervals.
  const pins = new Set<number>();
  let at = border + 3 + Math.floor(rand() * 4);
  while (at < cols - border - 2) {
    pins.add(at);
    if (rand() > 0.55) pins.add(at + 1);
    at += 5 + Math.floor(rand() * 7);
  }

  const warp = Array.from({ length: cols }, (_, x) => {
    if (x < border) return borderThread(x);
    if (x >= cols - border) return borderThread(cols - 1 - x);
    return pins.has(x) ? second : body;
  });

  // Weft: ivory shot, with one seeded band where the weaver changed bobbin.
  const bandAt = Math.floor(rows * (0.25 + rand() * 0.5));
  const bandDeep = 2 + Math.floor(rand() * 3);
  // The shot weft is ivory that has taken a little of the body's dye, the
  // way an undyed yarn does beside a dyed one; stark ivory read as pixels.
  const shot = mix(ivory, body, 0.34);
  const weft = Array.from({ length: rows }, (_, y) =>
    y >= bandAt && y < bandAt + bandDeep ? (own[1] ?? gold) : shot,
  );

  const code = ((seed >>> 8) & 0xffff).toString(16).toUpperCase().padStart(4, "0");
  return { cols, rows, warp, weft, border, interlace, code };
}

/** Is the warp (vertical) thread on top at this crossing? */
function warpOver(spec: WeaveSpec, x: number, y: number): boolean {
  // The selvedge is always a tight rib, whatever the body does - it is what
  // stops a real cloth fraying, and it makes the border read as a border.
  if (x < spec.border || x >= spec.cols - spec.border) return y % 2 === 0 ? x % 2 === 0 : x % 2 === 1;
  switch (spec.interlace) {
    case "plain": return (x + y) % 2 === 0;
    case "twill": return (x + y) % 4 < 2;
    case "basket": return (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0;
    case "herringbone": {
      // A twill whose diagonal turns back on itself every eight threads.
      const run = 8;
      const k = x % run;
      const dir = Math.floor(x / run) % 2 === 0 ? k : run - 1 - k;
      return (dir + y) % 4 < 2;
    }
  }
}

/**
 * Draw the cloth as far as it has been woven.
 *
 * `progress` runs 0 → 1. Below 1 the bare warp hangs where no weft has
 * crossed it yet and the current row is part-way across, alternating
 * direction like a shuttle - so the cloth is visibly *being woven*, bottom
 * up, rather than fading in. Ripples displace crossings around a touch and
 * die away; the caller ages them and stops redrawing when none are left.
 */
export function drawWeave(
  ctx: CanvasRenderingContext2D,
  spec: WeaveSpec,
  width: number,
  height: number,
  progress: number,
  ripples: Ripple[] = [],
  ground = "transparent",
): void {
  const cw = width / spec.cols;
  const ch = height / spec.rows;
  ctx.clearRect(0, 0, width, height);
  if (ground !== "transparent") {
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, width, height);
  }

  const woven = Math.max(0, Math.min(1, progress)) * spec.rows;
  const full = Math.floor(woven);
  const part = woven - full;

  // The bare warp, where the weft has not reached.
  const bareRows = spec.rows - Math.ceil(woven);
  if (bareRows > 0) {
    for (let x = 0; x < spec.cols; x++) {
      ctx.fillStyle = spec.warp[x];
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x * cw + cw * 0.32, 0, cw * 0.36, bareRows * ch + ch);
    }
    ctx.globalAlpha = 1;
  }

  const live = ripples.filter((r) => r.age < RIPPLE_MS);
  // Below ~5px a highlight is invisible and a third of the fill cost.
  const fine = Math.min(cw, ch) < 5;

  // Woven from the bottom up: row 0 of the weaving is the last row drawn.
  for (let n = 0; n < Math.ceil(woven); n++) {
    const y = spec.rows - 1 - n;
    const isShuttleRow = n === full;
    const reach = isShuttleRow ? Math.floor(part * spec.cols) : spec.cols;
    const leftToRight = n % 2 === 0;

    for (let i = 0; i < reach; i++) {
      const x = leftToRight ? i : spec.cols - 1 - i;
      let px = x * cw;
      let py = y * ch;

      for (const r of live) {
        const dx = px + cw / 2 - r.x;
        const dy = py + ch / 2 - r.y;
        const d = Math.hypot(dx, dy);
        const life = 1 - r.age / RIPPLE_MS;
        const wave = Math.sin(d * 0.055 - r.age * 0.012) * Math.exp(-d * 0.006) * life * life;
        const push = wave * Math.min(cw, ch) * 0.9;
        if (d > 0.001) {
          px += (dx / d) * push;
          py += (dy / d) * push;
        }
      }

      const over = warpOver(spec, x, y);
      ctx.fillStyle = over ? spec.warp[x] : spec.weft[y];
      // A thread is narrower than its cell across its width and runs the
      // full cell along its length; the gap is what makes it read as woven
      // rather than as pixels.
      if (over) {
        ctx.fillRect(px + cw * 0.1, py - 0.5, cw * 0.8, ch + 1);
        ctx.fillStyle = "rgba(0,0,0,0.16)";
        ctx.fillRect(px + cw * 0.68, py - 0.5, cw * 0.22, ch + 1);
        if (fine) continue;
        ctx.fillStyle = "rgba(255,255,255,0.20)";
        ctx.fillRect(px + cw * 0.1, py - 0.5, cw * 0.18, ch + 1);
      } else {
        ctx.fillRect(px - 0.5, py + ch * 0.1, cw + 1, ch * 0.8);
        ctx.fillStyle = "rgba(0,0,0,0.14)";
        ctx.fillRect(px - 0.5, py + ch * 0.68, cw + 1, ch * 0.22);
        if (fine) continue;
        ctx.fillStyle = "rgba(255,255,255,0.22)";
        ctx.fillRect(px - 0.5, py + ch * 0.1, cw + 1, ch * 0.18);
      }
    }
  }
}

/** True while any ripple is still moving, i.e. while a redraw is owed. */
export function rippling(ripples: Ripple[]): boolean {
  return ripples.some((r) => r.age < RIPPLE_MS);
}

/** What the interlacing is called, for the caption under a piece's weave. */
export const INTERLACE_NAME: Record<Interlace, string> = {
  plain: "Plain weave",
  twill: "Twill",
  basket: "Basket weave",
  herringbone: "Herringbone",
};
