"use client";
import { useState } from "react";
import { Plus, Sparkles, X } from "lucide-react";
import type { StylingNote } from "@/lib/queries/catalog";
import { adminApi } from "@/lib/adminApi";

const MAX = 4;
const STARTERS = ["The office", "A long lunch", "A family function", "Travel day"];

/**
 * Ways to wear it.
 *
 * Claude drafts, she edits, and only what she saves reaches a customer - the
 * draft lands in these fields like anything else she typed. Works entirely
 * without Claude too: the starters fill in an occasion and she writes the
 * note herself, which is why an unavailable model is a line of text here and
 * not a dead end.
 */
export default function StylingNotesEditor({
  value, onChange, name, facts,
}: {
  value: StylingNote[];
  onChange: (notes: StylingNote[]) => void;
  name: string;
  facts: Record<string, unknown>;
}) {
  const [drafting, setDrafting] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  async function draft() {
    setDrafting(true); setAiNote(null);
    try {
      const res = await adminApi.post("/ai/styling", { name: name.trim(), facts });
      if (res.data.notes?.length) onChange(res.data.notes);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setAiNote(e?.response?.status === 503
        ? `AI is unavailable: ${detail ?? "ANTHROPIC_API_KEY is not set"}. You can still write these yourself.`
        : (typeof detail === "string" ? detail : "Could not draft these right now."));
    } finally {
      setDrafting(false);
    }
  }

  const set = (i: number, patch: Partial<StylingNote>) => onChange(value.map((n, j) => (j === i ? { ...n, ...patch } : n)));
  const unused = STARTERS.filter((s) => !value.some((n) => n.occasion.trim().toLowerCase() === s.toLowerCase()));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          type="button" onClick={draft} disabled={drafting || !name.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5" /> {drafting ? "Drafting…" : value.length ? "Redraft with AI" : "Draft with AI"}
        </button>
        {!name.trim() && <span className="text-xs text-gray-400">Name the product first.</span>}
      </div>
      {aiNote && <p className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">{aiNote}</p>}

      <div className="space-y-3">
        {value.map((n, i) => (
          <div key={i} className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-center gap-2">
              <input
                value={n.occasion} maxLength={40} placeholder="Where to"
                onChange={(e) => set(i, { occasion: e.target.value })}
                className="min-w-0 flex-1 rounded-md border border-gray-200 px-2.5 py-2 text-[15px] sm:text-sm font-medium"
              />
              <button type="button" aria-label="Remove" onClick={() => onChange(value.filter((_, j) => j !== i))} className="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-50 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              value={n.note} maxLength={360} rows={3} placeholder="How you would wear it there: shoes, jewellery, hair, a bag."
              onChange={(e) => set(i, { note: e.target.value })}
              className="mt-2 w-full rounded-md border border-gray-200 px-2.5 py-2 text-[15px] sm:text-sm leading-relaxed"
            />
            <p className="mt-1 text-[11px] text-gray-400 text-right tabular-nums">{n.note.length}/360</p>
          </div>
        ))}
      </div>

      {value.length < MAX && (
        <div className="mt-3 flex flex-wrap gap-2">
          {unused.slice(0, MAX - value.length).map((s) => (
            <button key={s} type="button" onClick={() => onChange([...value, { occasion: s, note: "" }])} className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
              <Plus className="w-3 h-3" /> {s}
            </button>
          ))}
          <button type="button" onClick={() => onChange([...value, { occasion: "", note: "" }])} className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
            <Plus className="w-3 h-3" /> Another
          </button>
        </div>
      )}
    </div>
  );
}
