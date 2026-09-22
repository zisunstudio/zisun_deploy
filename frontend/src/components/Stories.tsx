"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { formatPrice, type Product } from "@/lib/queries/catalog";
import { FOUNDER } from "@/lib/brand";
import { markOpenSource } from "@/lib/enquiry";
import { trackEvent } from "@/lib/queries/analytics";
import { navigate } from "@/lib/viewTransition";

/**
 * The drop, as stories.
 *
 * A row of circles is the one browsing gesture every customer already has in
 * her thumb - it is how she looks at everything else on her phone. Each
 * circle is one piece; tapping it opens her photographs full-screen, one at
 * a time, the way she would watch a friend's story, and the last frame is
 * the piece itself with its price and a way in. A piece she has not watched
 * keeps its burgundy ring; watched, the ring goes quiet. That small "new"
 * signal is the reason to come back.
 *
 * Tap right for the next frame, left for the last, hold to pause, swipe down
 * or press Escape to close. When one piece ends the next begins. Reduced
 * motion keeps every frame but never advances on its own.
 *
 * Built from the drop the home page already loads - no second request - and
 * it renders nothing until at least one piece has a photograph.
 */
const FRAME_MS = 4200;
const SEEN_KEY = "zisun-stories-seen";

function readSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); } catch { return new Set(); }
}
function writeSeen(seen: Set<string>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen).slice(-200))); } catch { /* not remembered */ }
}

function photos(p: Product): string[] {
  return p.media
    .filter((m) => m.type === "IMAGE")
    .sort((a, b) => a.display_order - b.display_order)
    .map((m) => m.cdn_url ?? m.url)
    .slice(0, 6);
}

/** "Meera — purple rose co-ord set" → "Meera"; otherwise the first two words. */
function shortName(name: string): string {
  const head = name.split(/\s[—–-]\s/)[0];
  const words = head.split(/\s+/);
  return words.length <= 2 ? head : words.slice(0, 2).join(" ");
}

export function Stories({ products }: { products: Product[] }) {
  const pieces = products.filter((p) => photos(p).length > 0);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => { setSeen(readSeen()); }, []);

  const markSeen = useCallback((id: string) => {
    setSeen((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev); next.add(id); writeSeen(next); return next;
    });
  }, []);

  if (pieces.length === 0) return null;

  return (
    <>
      <div className="px-5 lg:px-8">
        <ul className="max-w-6xl mx-auto flex gap-4 overflow-x-auto no-scrollbar -mx-5 px-5 lg:mx-auto lg:px-0 py-1" aria-label="The drop as stories">
          {pieces.map((p, i) => {
            const fresh = !seen.has(p.id);
            return (
              <li key={p.id} className="shrink-0">
                <button onClick={() => setOpen(i)} className="flex w-[76px] flex-col items-center gap-1.5 text-center" aria-label={`Watch ${p.name}`}>
                  <span className={`rounded-full p-[2.5px] ${fresh ? "bg-gradient-to-tr from-burgundy via-burgundy to-rose" : "bg-line"}`}>
                    <span className="block rounded-full bg-background p-[2.5px]">
                      <span className="relative block h-[64px] w-[64px] overflow-hidden rounded-full bg-rose">
                        <Image src={photos(p)[0]} alt="" fill sizes="64px" className="object-cover object-top" />
                      </span>
                    </span>
                  </span>
                  <span className={`w-full truncate text-[11px] ${fresh ? "text-ink font-medium" : "text-muted"}`}>{shortName(p.name)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {open !== null && (
        <StoryViewer
          pieces={pieces}
          start={open}
          onSeen={markSeen}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

function StoryViewer({ pieces, start, onSeen, onClose }: {
  pieces: Product[];
  start: number;
  onSeen: (id: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [piece, setPiece] = useState(start);
  const [frame, setFrame] = useState(0);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const holdTimer = useRef<number | null>(null);
  const held = useRef(false);
  const touchY = useRef<number | null>(null);

  const p = pieces[piece];
  const shots = photos(p);
  const frames = shots.length + 1; // the photographs, then the piece itself
  const onCard = frame === frames - 1;

  // Opening a story counts as seeing it; the ring goes quiet on the way out.
  useEffect(() => {
    onSeen(p.id);
    trackEvent("story_viewed", { product_id: p.id });
  }, [p.id, onSeen]);

  // No page scroll behind a full-screen story.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const next = useCallback(() => {
    if (frame < frames - 1) { setFrame((f) => f + 1); return; }
    if (piece < pieces.length - 1) { setPiece((i) => i + 1); setFrame(0); return; }
    onClose();
  }, [frame, frames, piece, pieces.length, onClose]);

  const back = useCallback(() => {
    if (frame > 0) { setFrame((f) => f - 1); return; }
    if (piece > 0) { setPiece((i) => i - 1); setFrame(0); }
  }, [frame, piece]);

  // The clock. The last frame waits for her - it is where the decision is.
  // Time lives in a ref and is only mirrored into state for the bar, so the
  // frame advances exactly once, outside any state update.
  const spent = useRef(0);
  useEffect(() => { spent.current = 0; setElapsed(0); }, [frame, piece]);
  useEffect(() => {
    if (reduce || paused || onCard) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      spent.current += now - last;
      last = now;
      if (spent.current >= FRAME_MS) { next(); return; }
      setElapsed(spent.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce, paused, onCard, next, frame, piece]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [next, back, onClose]);

  function down(e: React.PointerEvent) {
    held.current = false;
    touchY.current = e.clientY;
    holdTimer.current = window.setTimeout(() => { held.current = true; setPaused(true); }, 220);
  }
  function up(e: React.PointerEvent) {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    const dy = touchY.current === null ? 0 : e.clientY - touchY.current;
    touchY.current = null;
    if (dy > 90) { onClose(); return; }           // swipe down
    if (held.current) { setPaused(false); return; } // a hold is a pause, not a tap
    // Measured against the story, not the window: on a laptop the story is a
    // centred column and "the left third" means the left third of it.
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (x < 0.3) back(); else next();
  }

  const cardPhoto = useRef<HTMLDivElement>(null);
  function openPiece() {
    markOpenSource("story");
    // The story closes inside the transition, not before it: the photograph
    // has to still be on screen when the browser captures it, so it can grow
    // into the product page's first photograph.
    navigate({ push: (href) => { onClose(); router.push(href); } }, `/product/${p.id}`, { from: cardPhoto.current });
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={`${p.name}, story`} className="fixed inset-0 z-[60] bg-ink text-white select-none">
      <div className="relative mx-auto h-full w-full max-w-md">
        {/* Progress, one bar per frame. */}
        <div className="absolute inset-x-0 top-0 z-20 flex gap-1 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          {Array.from({ length: frames }).map((_, i) => (
            <span key={i} className="h-[2.5px] flex-1 overflow-hidden rounded-full bg-white/30">
              <span
                className="block h-full bg-white"
                style={{ width: i < frame ? "100%" : i > frame ? "0%" : onCard ? "100%" : `${Math.min(100, (elapsed / FRAME_MS) * 100)}%` }}
              />
            </span>
          ))}
        </div>
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-[calc(max(0.75rem,env(safe-area-inset-top))+14px)]">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold drop-shadow">{shortName(p.name)}</p>
            {p.worn_by_founder && <p className="text-[11px] text-white/80 drop-shadow">Worn by {FOUNDER.name} &middot; {FOUNDER.heightCm} cm</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="h-10 w-10 -mr-2 flex items-center justify-center">
            <X className="h-6 w-6 drop-shadow" />
          </button>
        </div>

        {onCard ? (
          /* The last frame: the piece, and the one way in. */
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <div ref={cardPhoto} className="relative h-[46vh] w-full max-w-[280px] overflow-hidden rounded-card">
              <Image src={shots[0]} alt="" fill sizes="280px" className="object-cover object-top" />
            </div>
            <p className="mt-6 font-display text-[30px] leading-tight">{p.name}</p>
            {p.named_for?.trim() && <p className="mt-1 font-display italic text-[16px] text-white/75">{p.named_for.trim()}</p>}
            <p className="mt-3 text-[17px] tabular-nums">{formatPrice(p.base_price)}</p>
            <button onClick={openPiece} className="mt-6 w-full max-w-[280px] rounded-full bg-white py-3.5 text-sm font-semibold text-burgundy">
              See the piece
            </button>
            <button onClick={next} className="mt-3 text-xs text-white/70 underline underline-offset-4">
              {piece < pieces.length - 1 ? "Next piece" : "Close"}
            </button>
          </div>
        ) : (
          <div
            className="absolute inset-0 touch-none"
            onPointerDown={down}
            onPointerUp={up}
            onPointerCancel={() => { setPaused(false); touchY.current = null; }}
          >
            <Image key={shots[frame]} src={shots[frame]} alt={`${p.name}, photograph ${frame + 1}`} fill priority sizes="(max-width: 448px) 100vw, 448px" className="object-cover" />
            <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/50 to-transparent" />
          </div>
        )}
      </div>
    </div>
  );
}
