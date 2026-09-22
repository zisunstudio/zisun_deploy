"use client";
import { Plus, X } from "lucide-react";

/** The garments people actually sell as a set, offered as one tap each. */
const COMMON = ["Kurta", "Palazzo", "Dupatta", "Straight pants", "Sharara", "Inner", "Top", "Skirt"];

/**
 * What is in the set.
 *
 * The field that retires "Net quantity: 5". A net quantity is what is inside
 * one pack, and typed as a bare number on a garment it reads to a customer
 * as five kurtas — which is exactly what a live ZISUN listing said. Listing
 * the pieces derives that declaration instead ("1 set - 2 pieces"), so the
 * legal box cannot disagree with the product page and nobody has to
 * translate a co-ord set into Legal Metrology wording.
 *
 * It also earns its place commercially: a co-ord set is two garments and the
 * page could not say so anywhere, which is a piece of value the customer was
 * being asked to infer from a photograph.
 *
 * One garment is a legitimate answer — leave it empty, or add the single
 * piece. Empty means the page says nothing, which is right for a plain kurti.
 */
export default function SetPiecesEditor({
  value, onChange,
}: {
  value: string[];
  onChange: (pieces: string[]) => void;
}) {
  const has = (name: string) => value.some((p) => p.trim().toLowerCase() === name.toLowerCase());
  const add = (name: string) => { if (!has(name)) onChange([...value, name]); };

  return (
    <div className="border-t border-gray-100 pt-4">
      <label className="block text-sm font-medium text-gray-700">What is in the set</label>
      <p className="text-[11px] text-gray-500 mt-1 mb-3">
        List each garment, in the order you would say them. Shown to the customer as
        &ldquo;What you get&rdquo;, and it writes the net quantity declaration for you.
        Leave empty for a single piece.
      </p>

      {value.length > 0 && (
        <ol className="flex flex-wrap gap-2 mb-3">
          {value.map((piece, i) => (
            <li key={`${piece}-${i}`} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 pl-3 pr-1.5 py-1.5 text-xs text-gray-800">
              <span className="tabular-nums text-gray-400">{i + 1}</span>
              {piece}
              <button
                type="button" aria-label={`Remove ${piece}`}
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="w-5 h-5 inline-flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-700"
              >
                <X className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap gap-2">
        {COMMON.filter((c) => !has(c)).map((c) => (
          <button
            key={c} type="button" onClick={() => add(c)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            <Plus className="w-3 h-3" /> {c}
          </button>
        ))}
      </div>

      {value.length > 1 && (
        <p className="mt-3 text-[11px] text-gray-500">
          Net quantity will read <span className="font-medium text-gray-700">1 set &mdash; {value.length} pieces</span>.
        </p>
      )}
    </div>
  );
}
