"use client";

import { Sparkles, Undo2 } from "lucide-react";
import type { Suggestion } from "@/lib/suggest";

/**
 * What the form filled in by itself, and why.
 *
 * Fields that fill themselves are only welcome if she can see which ones,
 * where each value came from, and take any of them back. Each row names the
 * field, the value and the pieces it was read from; "Undo" empties the field
 * and stops it being suggested again; "Keep all" accepts them as her own.
 */
export function SuggestionPanel({ items, onUndo, onKeepAll }: {
  items: Suggestion[]; onUndo: (field: Suggestion["field"]) => void; onKeepAll: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-xl border border-ink/15 bg-rose/40 p-4 sm:p-5" aria-labelledby="suggest-heading">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="suggest-heading" className="text-sm font-semibold text-gray-900 inline-flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-rani" aria-hidden /> Filled in from your earlier pieces
          </h2>
          <p className="text-xs text-gray-600 mt-0.5">Change anything in the form above, or undo it here. Nothing is saved until you press Create.</p>
        </div>
        <button type="button" onClick={onKeepAll} className="shrink-0 h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-800">Keep all</button>
      </div>
      <ul className="mt-3 divide-y divide-gray-100">
        {items.map((s) => (
          <li key={s.field} className="py-2.5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-gray-900"><span className="text-gray-500">{s.label}:</span> <span className="font-semibold break-words">{s.show}</span></p>
              <p className="text-xs text-gray-500 mt-0.5 leading-snug">{s.reason}</p>
            </div>
            <button type="button" onClick={() => onUndo(s.field)} aria-label={`Undo ${s.label}`}
              className="shrink-0 h-9 px-2.5 inline-flex items-center gap-1 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100">
              <Undo2 className="w-3.5 h-3.5" aria-hidden /> Undo
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
