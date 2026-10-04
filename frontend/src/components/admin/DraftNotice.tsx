"use client";

import { RotateCcw, Save } from "lucide-react";
import { draftTime } from "@/lib/formDraft";

/**
 * Says what happened to her typing, in two places a form needs it.
 *
 * `restoredAt`: an earlier draft was put back into the form. She is told,
 * because fields that fill themselves are alarming otherwise, and given one
 * tap to throw it away. `stale` adds a caution when the record was changed
 * somewhere else after the draft was started.
 *
 * `savedAt`: a quiet line that her changes are being kept on this phone, so
 * she can trust a refresh.
 */
export function DraftRestored({ restoredAt, stale, discardLabel = "Discard", onDiscard }: {
  restoredAt: number | null; stale?: boolean; discardLabel?: string; onDiscard: () => void;
}) {
  if (!restoredAt) return null;
  return (
    <div role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2.5 min-w-0">
        <RotateCcw className="w-4 h-4 mt-0.5 shrink-0 text-amber-700" aria-hidden />
        <p className="text-sm text-amber-900 leading-snug">
          What you typed at {draftTime(restoredAt)} is back. It is <strong>not saved yet</strong>.
          {stale && " This piece was changed somewhere else since then, so check it before saving."}
        </p>
      </div>
      <button type="button" onClick={onDiscard} className="shrink-0 self-start sm:self-auto h-9 px-3 rounded-lg border border-amber-300 bg-white text-sm font-medium text-amber-900">
        {discardLabel}
      </button>
    </div>
  );
}

export function DraftKept({ savedAt }: { savedAt: number | null }) {
  if (!savedAt) return null;
  return (
    <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-gray-500">
      <Save className="w-3.5 h-3.5" aria-hidden /> Not saved yet. Kept on this phone at {draftTime(savedAt)}, so a refresh will not lose it.
    </p>
  );
}
