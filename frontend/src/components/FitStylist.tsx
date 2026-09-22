"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { trackEvent } from "@/lib/queries/analytics";
import { FOUNDER } from "@/lib/brand";

/**
 * "Find my size" - the fit stylist.
 *
 * Three answers, no typing: her height on a slider, the size she usually
 * wears, and how she likes clothes to sit. The size comes back from the
 * rules engine on the server (app/services/fit.py), compared against
 * Sushmita at 153 cm when it is her in the photographs; when Claude is
 * available a sentence in Sushmita's voice explains it. Either way she gets
 * an answer, and one tap selects it.
 *
 * Her answers are remembered on this device, so on the next piece the page
 * can say "For you: take M" before she asks.
 */
const SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"] as const;
const PREFS: Array<{ id: Pref; label: string }> = [
  { id: "relaxed", label: "Room to move" },
  { id: "as_designed", label: "As designed" },
  { id: "fitted", label: "Close to the body" },
];
type Pref = "relaxed" | "as_designed" | "fitted";

export interface FitProfile { height: number; usual: (typeof SIZES)[number]; pref: Pref }
export interface FitAnswer {
  size: string;
  headline: string;
  reasons: string[];
  confidence: "high" | "medium" | "low";
  reference: string | null;
  note: string | null;
  source: "stylist" | "rules";
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

export async function askFit(productId: string, p: FitProfile): Promise<FitAnswer> {
  const res = await api.post("/stylist/fit", { product_id: productId, height_cm: p.height, usual_size: p.usual, preference: p.pref });
  return res.data;
}

const feetInches = (cm: number) => { const i = Math.round(cm / 2.54); return `${Math.floor(i / 12)}′${i % 12}″`; };

export function FitStylist({ productId, isOpen, onClose, onChoose, initialAnswer }: {
  productId: string;
  isOpen: boolean;
  onClose: () => void;
  /** Select this size on the page. */
  onChoose: (size: string) => void;
  initialAnswer?: FitAnswer | null;
}) {
  const [mounted, setMounted] = useState(false);
  const [profile, setProfile] = useState<FitProfile>({ height: 155, usual: "M", pref: "as_designed" });
  const [answer, setAnswer] = useState<FitAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { setMounted(true); const saved = readFitProfile(); if (saved) setProfile(saved); }, []);
  useEffect(() => { if (isOpen) setAnswer(initialAnswer ?? null); }, [isOpen, initialAnswer]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [isOpen, onClose]);

  async function ask() {
    setBusy(true); setError(null);
    try {
      const a = await askFit(productId, profile);
      saveFitProfile(profile);
      setAnswer(a);
      trackEvent("fit_recommended", { product_id: productId, height_cm: profile.height, usual_size: profile.usual, preference: profile.pref, size: a.size, source: a.source });
    } catch (e: any) {
      setError(e?.response?.status === 409 ? "This piece has just sold out in every size." : "We could not work it out just now. The size guide has every measurement.");
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  const chip = (on: boolean) =>
    `rounded-full border px-3.5 py-2 text-[13px] transition-colors ${on ? "border-ink bg-ink text-porcelain" : "border-line text-ink hover:border-ink/40"}`;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div className="fixed inset-0 z-[60] flex items-end lg:items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
          <motion.div
            role="dialog" aria-modal="true" aria-labelledby="fit-title"
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="relative w-full lg:max-w-md bg-background rounded-t-2xl lg:rounded-2xl max-h-[90vh] overflow-y-auto no-scrollbar"
          >
            <div className="flex items-start justify-between gap-4 px-5 pt-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-burgundy">Find my size</p>
                <h2 id="fit-title" className="mt-1 font-display text-[26px] leading-tight text-ink">
                  {answer ? answer.headline : "Tell us about you."}
                </h2>
              </div>
              <button ref={closeRef} onClick={onClose} aria-label="Close" className="h-10 w-10 -mr-2 flex items-center justify-center rounded-full hover:bg-rose">
                <X className="h-5 w-5" />
              </button>
            </div>

            {answer ? (
              <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
                <div className="flex items-center gap-4">
                  <span className="font-display text-[64px] leading-none text-burgundy">{answer.size}</span>
                  <p className="text-xs text-muted leading-relaxed">
                    For you at {profile.height} cm ({feetInches(profile.height)}), usually {profile.usual}
                    {answer.reference ? <>, compared with {answer.reference}</> : null}.
                  </p>
                </div>
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
                <button onClick={() => { onChoose(answer.size); onClose(); }} className="mt-6 w-full rounded-full bg-burgundy py-4 text-sm font-semibold text-white">
                  Select {answer.size}
                </button>
                <button onClick={() => setAnswer(null)} className="mt-3 w-full text-center text-xs text-muted underline underline-offset-4">Change my answers</button>
              </div>
            ) : (
              <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
                <p className="text-[13px] text-muted">{FOUNDER.name} is {FOUNDER.heightCm} cm and wears the pieces in the photos. Three answers and we will tell you your size.</p>

                <p className="mt-5 text-sm font-semibold text-ink">Your height</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-display text-[34px] leading-none text-ink tabular-nums">{profile.height}</span>
                  <span className="text-sm text-muted">cm · {feetInches(profile.height)}</span>
                </div>
                <input
                  type="range" min={140} max={185} step={1} value={profile.height}
                  onChange={(e) => setProfile({ ...profile, height: Number(e.target.value) })}
                  aria-label="Your height in centimetres"
                  className="mt-3 w-full accent-burgundy"
                />

                <p className="mt-5 text-sm font-semibold text-ink">The size you usually wear</p>
                <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Usual size">
                  {SIZES.map((s) => (
                    <button key={s} role="radio" aria-checked={profile.usual === s} onClick={() => setProfile({ ...profile, usual: s })} className={`${chip(profile.usual === s)} min-w-[48px]`}>{s}</button>
                  ))}
                </div>

                <p className="mt-5 text-sm font-semibold text-ink">How you like it to sit</p>
                <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Fit preference">
                  {PREFS.map((p) => (
                    <button key={p.id} role="radio" aria-checked={profile.pref === p.id} onClick={() => setProfile({ ...profile, pref: p.id })} className={chip(profile.pref === p.id)}>{p.label}</button>
                  ))}
                </div>

                {error && <p className="mt-4 text-xs text-burgundy">{error}</p>}
                <button onClick={ask} disabled={busy} className="mt-6 w-full rounded-full bg-burgundy py-4 text-sm font-semibold text-white disabled:opacity-60">
                  {busy ? "Working it out…" : "Show my size"}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
