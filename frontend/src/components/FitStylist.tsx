"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, Sparkles, Lock, Ruler, Shirt, Tag, MessageCircle } from "lucide-react";
import { api } from "@/lib/api";
import { trackEvent } from "@/lib/queries/analytics";
import { FOUNDER } from "@/lib/brand";
import {
  BAND_WORD, BAND_WORD_VS_KURTA, fitsFor, fromCm, normSize, toCm,
  type Band, type Chart, type FitResult, type Input, type Preference, type Unit,
} from "@/lib/fitMath";

/**
 * "Find my size" - your fit, privately.
 *
 * Women choose by bust and hip, and those are intimate numbers. So she
 * chooses how much to say:
 *
 *   "The size I usually wear"  - no numbers at all (answered by the server's
 *                                 rules engine, which never sees a body).
 *   "A kurta that fits me well" - measure a kurta laid flat, not herself.
 *   "My measurements"          - bust and hip, nothing more.
 *
 * The last two are worked out here, on her phone, against the piece's own
 * chart. They are never sent anywhere, and the sheet says so before she
 * types. The answer is every size described as it would sit *on her* -
 * close, comfortable, relaxed, roomy - at equal weight, so an XS and a 3XL
 * customer see the same calm page. When nothing is comfortable, Sushmita
 * offers to check it for her rather than the page quietly failing.
 */
const SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"] as const;
type Usual = (typeof SIZES)[number];
type Method = "usual" | "kurta" | "body";

const PREFS: Array<{ id: Preference; label: string; vsKurta: string }> = [
  { id: "fitted", label: "Close to the body", vsKurta: "A little closer" },
  { id: "as_designed", label: "As designed", vsKurta: "Just like it" },
  { id: "relaxed", label: "Room to move", vsKurta: "A little roomier" },
];

export interface FitProfile {
  height: number;
  usual: Usual;
  pref: Preference;
  method?: Method;
  unit?: Unit;
  /** Stored in `unit`, only on this device. */
  bust?: number | null;
  hip?: number | null;
  kurtaChest?: number | null; // across, laid flat
  kurtaHip?: number | null;   // across, laid flat
}

export interface FitAnswer {
  size: string;
  headline: string;
  reasons: string[];
  note: string | null;
  source: "stylist" | "rules" | "private";
  fits?: FitResult["fits"];
  vsKurta?: boolean;
  nothingComfortable?: boolean;
}

const PROFILE_KEY = "zisun-fit";

export function readFitProfile(): FitProfile | null {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
    return p && p.height && p.usual && p.pref ? p : null;
  } catch { return null; }
}
function saveFitProfile(p: FitProfile) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* not remembered */ }
}
function forgetFitProfile() {
  try { localStorage.removeItem(PROFILE_KEY); } catch { /* nothing kept */ }
}

/** The no-numbers path: the server's rules engine (and Claude's phrasing). */
export async function askFit(productId: string, p: FitProfile): Promise<FitAnswer> {
  const res = await api.post("/stylist/fit", { product_id: productId, height_cm: p.height, usual_size: p.usual, preference: p.pref });
  return res.data;
}

const feetInches = (cm: number) => { const i = Math.round(cm / 2.54); return `${Math.floor(i / 12)}′${i % 12}″`; };

function lengthLine(height: number | null, wornByFounder: boolean, garmentLength?: string | null): string | null {
  if (!height || !wornByFounder) return null;
  const d = height - FOUNDER.heightCm;
  const what = garmentLength ? `this ${garmentLength.toLowerCase()} piece` : "it";
  if (Math.abs(d) <= 4) return `You are about ${FOUNDER.name}'s height, so ${what} falls as it does in the photos.`;
  return `You are ${Math.abs(d)} cm ${d > 0 ? "taller" : "shorter"} than ${FOUNDER.name}, so ${what} will sit ${Math.abs(d) <= 10 ? "a little" : "noticeably"} ${d > 0 ? "higher" : "lower"} on you than in the photos.`;
}

/** The private paths, answered on this device. Null when it cannot be. */
export function answerLocally(p: FitProfile, chart: Chart | null, inStock: string[], ctx: { wornByFounder: boolean; garmentLength?: string | null }): FitAnswer | null {
  if (!chart || !p.method || p.method === "usual") return null;
  const unit = p.unit ?? "in";
  let input: Input | null = null;
  if (p.method === "body" && p.bust) input = { method: "body", bust: toCm(p.bust, unit), hip: p.hip ? toCm(p.hip, unit) : null };
  if (p.method === "kurta" && p.kurtaChest) input = { method: "garment", chest: toCm(p.kurtaChest * 2, unit), hip: p.kurtaHip ? toCm(p.kurtaHip * 2, unit) : null };
  if (!input) return null;
  const r = fitsFor(chart, input, p.pref, inStock);
  if (!r.recommended) return null;
  const mine = r.fits.find((f) => f.size === r.recommended);
  const words = r.vsKurta ? BAND_WORD_VS_KURTA : BAND_WORD;
  const reasons: string[] = [];
  // When nothing is comfortable the note below says so, kindly and once.
  const saysItBelow = r.nothingComfortable && p.pref !== "fitted";
  if (mine && !saysItBelow) reasons.push(r.vsKurta ? `In ${mine.size} it measures ${words[mine.band]}.` : `In ${mine.size} it will sit ${words[mine.band]} on you.`);
  if (mine?.decidedBy === "hip") reasons.push("The hip decided it — that is where this cut sits closest.");
  if (r.confidence === "medium") reasons.push("This piece's chart is cut-to-fit, so compare with the size guide too.");
  const len = lengthLine(p.height, ctx.wornByFounder, ctx.garmentLength);
  if (len) reasons.push(len);
  return {
    size: r.recommended, headline: `Yours is ${r.recommended}.`, reasons, note: null, source: "private",
    fits: r.fits, vsKurta: r.vsKurta, nothingComfortable: r.nothingComfortable && p.pref !== "fitted",
  };
}

export function FitStylist({ productId, isOpen, onClose, onChoose, initialAnswer, chart, inStock, wornByFounder, garmentLength, helpHref }: {
  productId: string;
  isOpen: boolean;
  onClose: () => void;
  onChoose: (size: string) => void;
  initialAnswer?: FitAnswer | null;
  /** The piece's own chart, or its category's; null disables the private paths. */
  chart: Chart | null;
  inStock: string[];
  wornByFounder: boolean;
  garmentLength?: string | null;
  /** Where "message me" goes when nothing is comfortable. */
  helpHref: string | null;
}) {
  const [mounted, setMounted] = useState(false);
  const [p, setP] = useState<FitProfile>({ height: 155, usual: "M", pref: "as_designed", unit: "in" });
  const [method, setMethod] = useState<Method | null>(null);
  const [answer, setAnswer] = useState<FitAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { setMounted(true); const saved = readFitProfile(); if (saved) setP({ unit: "in", ...saved }); }, []);
  useEffect(() => { if (isOpen) { setAnswer(initialAnswer ?? null); setMethod(null); setError(null); } }, [isOpen, initialAnswer]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [isOpen, onClose]);

  const unit: Unit = p.unit ?? "in";
  const privateOk = Boolean(chart?.rows?.length);

  async function show() {
    if (!method) return;
    setBusy(true); setError(null);
    const profile: FitProfile = { ...p, method };
    try {
      if (method === "usual") {
        const a = await askFit(productId, profile);
        setAnswer(a);
      } else {
        const a = answerLocally(profile, chart, inStock, { wornByFounder, garmentLength });
        if (!a) { setError("Add the measurement above and we will match it."); return; }
        setAnswer(a);
      }
      saveFitProfile(profile);
      // Only the method and the result are counted - never a measurement.
      trackEvent("fit_recommended", { product_id: productId, method, preference: p.pref });
    } catch (e: any) {
      setError(e?.response?.status === 409 ? "This piece has just sold out in every size." : "We could not work it out just now. The size guide has every measurement.");
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  const chip = (on: boolean) =>
    `rounded-full border px-3.5 py-2 text-[13px] transition-colors ${on ? "border-ink bg-ink text-porcelain" : "border-line text-ink hover:border-ink/40"}`;
  const num = "w-full h-12 rounded-lg border border-line bg-white px-3 text-[17px] text-ink tabular-nums focus:outline-none focus:ring-2 focus:ring-burgundy/25";
  const setNum = (k: keyof FitProfile) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.trim();
    setP({ ...p, [k]: v === "" ? null : Number(v) });
  };
  const switchUnit = (u: Unit) => {
    if (u === unit) return;
    // Convert what she has typed rather than leave inches in a cm box.
    const conv = (v?: number | null) => (v ? Math.round(fromCm(toCm(v, unit), u) * 2) / 2 : v);
    setP({ ...p, unit: u, bust: conv(p.bust), hip: conv(p.hip), kurtaChest: conv(p.kurtaChest), kurtaHip: conv(p.kurtaHip) });
  };

  // Render functions, not components: a component defined inside render is a
  // new type every render, so React would remount the slider mid-drag.
  const privacy = () => (
    <p className="mt-3 flex items-start gap-2 rounded-lg bg-rose px-3 py-2.5 text-[12px] leading-relaxed text-ink/80">
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-burgundy" aria-hidden />
      These stay on this phone. They are never sent to us — not even to {FOUNDER.name}. Change or forget them any time.
    </p>
  );

  const unitToggle = () => (
    <div className="inline-flex rounded-full border border-line p-0.5 text-[12px]" role="radiogroup" aria-label="Unit">
      {(["in", "cm"] as Unit[]).map((u) => (
        <button key={u} role="radio" aria-checked={unit === u} onClick={() => switchUnit(u)} className={`rounded-full px-3 py-1 ${unit === u ? "bg-ink text-porcelain" : "text-ink"}`}>{u === "in" ? "inches" : "cm"}</button>
      ))}
    </div>
  );

  const height = (optional?: boolean) => (
    <div className="mt-5">
      <p className="text-sm font-semibold text-ink">Your height{optional ? <span className="font-normal text-muted"> — for length</span> : null}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-display text-[30px] leading-none text-ink tabular-nums">{p.height}</span>
        <span className="text-sm text-muted">cm · {feetInches(p.height)}</span>
      </div>
      <input type="range" min={140} max={185} step={1} value={p.height} onChange={(e) => setP({ ...p, height: Number(e.target.value) })} aria-label="Your height in centimetres" className="mt-2 w-full accent-burgundy" />
    </div>
  );

  const prefs = (vsKurta?: boolean) => (
    <>
      <p className="mt-5 text-sm font-semibold text-ink">{vsKurta ? "Compared with that kurta, you would like this one" : "How you like it to sit"}</p>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Fit preference">
        {PREFS.map((x) => (
          <button key={x.id} role="radio" aria-checked={p.pref === x.id} onClick={() => setP({ ...p, pref: x.id })} className={chip(p.pref === x.id)}>{vsKurta ? x.vsKurta : x.label}</button>
        ))}
      </div>
    </>
  );

  const words = answer?.vsKurta ? BAND_WORD_VS_KURTA : BAND_WORD;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div className="fixed inset-0 z-[60] flex items-end lg:items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
          <motion.div
            role="dialog" aria-modal="true" aria-labelledby="fit-title"
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="relative w-full lg:max-w-md bg-background rounded-t-2xl lg:rounded-2xl max-h-[92vh] overflow-y-auto no-scrollbar"
          >
            <div className="flex items-start justify-between gap-4 px-5 pt-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-burgundy">Your fit, privately</p>
                <h2 id="fit-title" className="mt-1 font-display text-[26px] leading-tight text-ink">
                  {answer ? answer.headline : method ? "Tell me a little." : "How would you like to tell me?"}
                </h2>
              </div>
              <button ref={closeRef} onClick={onClose} aria-label="Close" className="h-10 w-10 -mr-2 flex items-center justify-center rounded-full hover:bg-rose">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
              {answer ? (
                <>
                  {/* The sizes that could work for her, as each would sit, at
                      equal weight. Sizes that would not fit are left out rather
                      than listed as "too close" - four boxes saying no, in a
                      row, is exactly the moment this is built to spare her. */}
                  {answer.fits && answer.fits.length > 0 && (
                    <ul className="mt-3 flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5" aria-label="How each size would sit on you">
                      {answer.fits.filter((f) => f.band !== "tight" || f.size === answer.size).map((f) => {
                        const mine = f.size === answer.size;
                        return (
                          <li key={f.size} className={`shrink-0 w-[84px] rounded-card border px-2 py-2.5 text-center ${mine ? "border-burgundy bg-burgundy-soft" : "border-line"}`}>
                            <p className={`font-display text-[22px] leading-none ${mine ? "text-burgundy" : "text-ink"}`}>{f.size}</p>
                            <p className="mt-1.5 text-[10.5px] leading-tight text-muted">{words[f.band as Band]}</p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {answer.note && (
                    <p className="mt-4 font-display italic text-[18px] leading-snug text-ink">
                      <Sparkles className="inline h-4 w-4 mr-1 -mt-1 text-burgundy" aria-hidden />&ldquo;{answer.note}&rdquo;
                    </p>
                  )}
                  <ul className="mt-4 space-y-2">
                    {answer.reasons.map((r) => (
                      <li key={r} className="flex gap-2 text-[13px] leading-relaxed text-ink/85"><span aria-hidden className="text-burgundy">·</span>{r}</li>
                    ))}
                  </ul>
                  {/* Nothing comfortable: said warmly, about the cut, with her
                      offering to help - never a dead end, never about a body. */}
                  {answer.nothingComfortable && (
                    <div className="mt-4 rounded-card bg-rose px-4 py-3 text-[13px] leading-relaxed text-ink">
                      This piece is cut close, and even in {answer.size} it will sit close to the body. I would rather tell you now than have you wait for a parcel that does not feel right.
                      {helpHref && (
                        <a href={helpHref} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-1.5 font-semibold text-burgundy">
                          <MessageCircle className="h-4 w-4" /> Message me — I will check it for you
                        </a>
                      )}
                      <span className="mt-1 block text-right font-hand text-lg text-ink/80">{FOUNDER.name}</span>
                    </div>
                  )}
                  <button onClick={() => { onChoose(answer.size); onClose(); }} className="mt-6 w-full rounded-full bg-burgundy py-4 text-sm font-semibold text-white">
                    Select {answer.size}
                  </button>
                  <div className="mt-3 flex items-center justify-center gap-4 text-xs text-muted">
                    <button onClick={() => { setAnswer(null); setMethod(null); }} className="underline underline-offset-4">Change my answers</button>
                    {answer.source === "private" && (
                      <button onClick={() => { forgetFitProfile(); setP({ height: 155, usual: "M", pref: "as_designed", unit: "in" }); setAnswer(null); setMethod(null); }} className="underline underline-offset-4">Forget my measurements</button>
                    )}
                  </div>
                </>
              ) : !method ? (
                <>
                  <p className="text-[13px] text-muted">I measure every piece myself. Tell me however you are comfortable, and I will match it. — {FOUNDER.name}</p>
                  <div className="mt-4 space-y-2.5">
                    {[
                      { id: "usual" as Method, Icon: Tag, title: "The size I usually wear", sub: "Quickest. No measuring at all.", ok: true },
                      { id: "kurta" as Method, Icon: Shirt, title: "A kurta that fits me well", sub: "Lay it flat and measure the kurta, not yourself.", ok: privateOk },
                      { id: "body" as Method, Icon: Ruler, title: "My measurements", sub: "Bust and hip. The most exact.", ok: privateOk },
                    ].filter((o) => o.ok).map(({ id, Icon, title, sub }) => (
                      <button key={id} onClick={() => setMethod(id)} className="w-full flex items-center gap-3.5 rounded-card border border-line px-4 py-3.5 text-left hover:border-ink/40">
                        <Icon className="h-5 w-5 shrink-0 text-burgundy" aria-hidden />
                        <span>
                          <span className="block text-[15px] text-ink">{title}</span>
                          <span className="block text-xs text-muted mt-0.5">{sub}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                  {privateOk && privacy()}
                </>
              ) : method === "usual" ? (
                <>
                  <p className="text-sm font-semibold text-ink">The size you usually wear</p>
                  <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Usual size">
                    {SIZES.map((s) => (
                      <button key={s} role="radio" aria-checked={p.usual === s} onClick={() => setP({ ...p, usual: s })} className={`${chip(p.usual === s)} min-w-[48px]`}>{s}</button>
                    ))}
                  </div>
                  {prefs()}
                  {height()}
                </>
              ) : method === "kurta" ? (
                <>
                  <div className="flex items-start gap-4">
                    {/* How to measure, drawn: across the chest just under the
                        arms, and across the widest part lower down. */}
                    <svg viewBox="0 0 80 100" className="h-24 w-20 shrink-0 text-ink/70" aria-hidden>
                      <path d="M28 6 L40 14 L52 6 L70 16 L64 34 L58 30 L60 94 L20 94 L22 30 L16 34 L10 16 Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                      <line x1="22" y1="34" x2="58" y2="34" className="text-burgundy" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" />
                      <line x1="21" y1="66" x2="59" y2="66" className="text-burgundy" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" />
                    </svg>
                    <p className="text-[13px] leading-relaxed text-muted">Lay a kurta that fits you well flat on a bed. Measure straight across, just under the arms. Then across the widest part below the waist, if you like.</p>
                  </div>
                  <div className="mt-4 flex items-center justify-between"><p className="text-sm font-semibold text-ink">Across, laid flat</p>{unitToggle()}</div>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <label className="block text-xs text-muted">Under the arms<input className={num} inputMode="decimal" value={p.kurtaChest ?? ""} onChange={setNum("kurtaChest")} placeholder={unit === "in" ? "19" : "48"} /></label>
                    <label className="block text-xs text-muted">Widest, lower down <span className="text-muted/70">(optional)</span><input className={num} inputMode="decimal" value={p.kurtaHip ?? ""} onChange={setNum("kurtaHip")} placeholder={unit === "in" ? "23" : "58"} /></label>
                  </div>
                  {privacy()}
                  {prefs(true)}
                  {height(true)}
                </>
              ) : (
                <>
                  {/* How to measure, for someone who does not know her numbers
                      and is doing it now. Drawn, two lines, and what to use
                      when there is no tape in the house. */}
                  <div className="flex items-start gap-4">
                    <svg viewBox="0 0 80 110" className="h-28 w-20 shrink-0 text-ink/70" aria-hidden>
                      <path d="M30 8 Q40 2 50 8 L54 20 Q66 26 64 40 L60 58 Q70 76 62 104 L18 104 Q10 76 20 58 L16 40 Q14 26 26 20 Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                      <ellipse cx="40" cy="38" rx="25" ry="4.5" fill="none" className="text-burgundy" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" />
                      <ellipse cx="40" cy="74" rx="24" ry="4.5" fill="none" className="text-burgundy" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" />
                    </svg>
                    <div className="text-[13px] leading-relaxed text-muted space-y-1.5">
                      <p><span className="text-ink font-medium">Bust:</span> round the fullest part, tape level all the way round.</p>
                      <p><span className="text-ink font-medium">Hip:</span> round the widest part, lower down.</p>
                      <p>Snug, not tight, over light clothing. No tape? A dupatta or a phone cable works — mark it, then lay it along a ruler.</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between"><p className="text-sm font-semibold text-ink">Your measurements</p>{unitToggle()}</div>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <label className="block text-xs text-muted">Bust<input className={num} inputMode="decimal" value={p.bust ?? ""} onChange={setNum("bust")} placeholder={unit === "in" ? "36" : "91"} /></label>
                    <label className="block text-xs text-muted">Hip <span className="text-muted/70">(optional)</span><input className={num} inputMode="decimal" value={p.hip ?? ""} onChange={setNum("hip")} placeholder={unit === "in" ? "40" : "102"} /></label>
                  </div>
                  <p className="mt-2 text-[12px] text-muted">That is all — no waist, no weight.</p>
                  {privacy()}
                  {prefs()}
                  {height(true)}
                </>
              )}

              {!answer && method && (
                <>
                  {error && <p className="mt-4 text-xs text-burgundy">{error}</p>}
                  <button onClick={show} disabled={busy} className="mt-6 w-full rounded-full bg-burgundy py-4 text-sm font-semibold text-white disabled:opacity-60">
                    {busy ? "Working it out…" : "Show my fit"}
                  </button>
                  <button onClick={() => setMethod(null)} className="mt-3 w-full text-center text-xs text-muted underline underline-offset-4">Tell you another way</button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** For the product page: in-stock sizes, normalised the same way as the chart. */
export const stockSizes = (variants: Array<{ size: string | null; stock: number; is_active: boolean }>) =>
  Array.from(new Set(variants.filter((v) => v.is_active && v.stock > 0 && v.size).map((v) => normSize(v.size as string))));
