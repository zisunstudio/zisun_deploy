"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Keep what she is typing, on her phone, until it has been saved.
 *
 * A long console form lived only in React state. A refresh, a tab the phone
 * threw away while she photographed the next piece, a session that expired
 * and sent her to sign in - each one emptied the form, and she typed a
 * listing again from the top.
 *
 * Every change is written to this browser's storage a moment after she
 * stops typing, and at once when the page is hidden or closed. When the
 * form opens again the draft is put back and a line says so, with one tap
 * to discard it. A successful save clears it.
 *
 * Deliberate choices:
 *
 *  - **Only real changes are kept.** A form identical to what the server
 *    holds (`pristine`) stores nothing, so opening a piece and leaving does
 *    not create a draft that later "restores" over a newer save.
 *  - **A draft remembers what it was a draft of** (`base`, the record's
 *    last-saved time). If the record changed elsewhere since, the draft is
 *    still offered but marked stale, so she checks before saving over it.
 *  - **Old shapes are dropped, not half-applied.** `VERSION` changes when a
 *    form's fields change meaning; a draft from another version is ignored.
 *  - **It expires.** A draft older than `MAX_AGE_DAYS` is forgotten.
 *  - **It is local.** Nothing here goes to the server; a draft on her phone
 *    is not on her laptop. Photographs are not drafts - they upload as they
 *    are added.
 */
const PREFIX = "zisun.draft.";
export const VERSION = 1;
export const MAX_AGE_DAYS = 14;

export type Draft<T> = { v: number; at: number; base: string | null; data: T };

function store(): Storage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}

export function readDraft<T>(key: string, now: number = Date.now()): Draft<T> | null {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(PREFIX + key);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft<T>;
    if (!d || d.v !== VERSION || typeof d.at !== "number" || d.data == null || now - d.at > MAX_AGE_DAYS * 86_400_000) {
      s.removeItem(PREFIX + key);
      return null;
    }
    return d;
  } catch {
    return null;
  }
}

/** False when the browser would not keep it (private mode, storage full). */
export function writeDraft<T>(key: string, data: T, base: string | null = null, now: number = Date.now()): boolean {
  const s = store();
  if (!s) return false;
  try {
    s.setItem(PREFIX + key, JSON.stringify({ v: VERSION, at: now, base, data } satisfies Draft<T>));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(key: string): void {
  try { store()?.removeItem(PREFIX + key); } catch { /* nothing kept */ }
}

/** Stable comparison: two forms with the same fields in a different order are the same form. */
export function sameData(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(norm)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, norm((v as Record<string, unknown>)[k])]))
    : v;
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/** "12:40 pm", or "3 Oct, 12:40 pm" when it was not today. */
export function draftTime(at: number, now: number = Date.now()): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return new Date(now).toDateString() === d.toDateString() ? time : `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${time}`;
}

/**
 * Write `data` under `key` whenever it differs from `pristine`; forget the
 * draft when it matches again. Does nothing until `enabled` - the form must
 * be seeded (and any earlier draft restored) first, or the empty form it
 * starts as would overwrite the draft it is about to restore.
 *
 * Returns when it was last kept (for a quiet "kept on this phone" line) and
 * `forget`, to call when the work has been saved or thrown away: it clears
 * the draft and stops the leaving-the-page write from putting it back.
 */
export function useDraftAutosave<T>(key: string | null, data: T, opts: { enabled: boolean; pristine: T | null; base?: string | null; delayMs?: number }): { savedAt: number | null; forget: () => void } {
  const { enabled, pristine, base = null, delayMs = 500 } = opts;
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const latest = useRef({ key, data, enabled, pristine, base });
  latest.current = { key, data, enabled, pristine, base };

  const stopped = useRef(false);
  const persist = useRef(() => {
    const c = latest.current;
    if (stopped.current || !c.key || !c.enabled || c.pristine === null) return;
    if (sameData(c.data, c.pristine)) { clearDraft(c.key); setSavedAt(null); return; }
    if (writeDraft(c.key, c.data, c.base)) setSavedAt(Date.now());
  });

  // Re-checked when the data changes and when `pristine` does: after a save
  // the page moves `pristine` to what was sent, and the draft is then either
  // cleared (nothing typed since) or kept (she typed while it was saving).
  const serialised = enabled ? JSON.stringify(data) + "\u0000" + JSON.stringify(pristine) : "";
  useEffect(() => {
    if (!enabled || !key) return;
    // She has changed something since the last save or discard: keep again.
    stopped.current = false;
    const t = setTimeout(() => persist.current(), delayMs);
    return () => clearTimeout(t);
  }, [serialised, enabled, key, delayMs]);

  // The debounce is no use if the page is going away: write at once.
  useEffect(() => {
    const now = () => persist.current();
    const onVisibility = () => { if (document.visibilityState === "hidden") now(); };
    window.addEventListener("pagehide", now);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      // Leaving the form by a link inside the console unmounts it without
      // hiding the page; keep what is there.
      now();
      window.removeEventListener("pagehide", now);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const forget = useRef(() => {
    stopped.current = true;
    if (latest.current.key) clearDraft(latest.current.key);
    setSavedAt(null);
  });
  return { savedAt, forget: forget.current };
}
