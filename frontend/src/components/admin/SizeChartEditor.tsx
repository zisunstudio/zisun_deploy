"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { SizeChart, SizeChartRow, SizeUnit } from "@/lib/queries/catalog";

interface Props {
  value: SizeChart | null;
  onChange: (chart: SizeChart | null) => void;
}

const SIZE_PRESETS = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];
const EMPTY_ROW = (size: string): SizeChartRow => ({ size, chest: 0, waist: 0, hip: 0, top_length: 0, bottom_length: null });

/**
 * A size chart the founder can fill in with a tape measure in the other hand.
 *
 * Numbers only, one row per size, in whichever unit she is measuring in — the
 * unit is saved with the chart and the storefront converts for the customer,
 * so nothing is ever converted at entry (which is how a 91 cm chest becomes a
 * 91 inch one). "Bottom length" is a column she switches on for sets with
 * trousers and leaves off for a kurti, rather than a column of blanks.
 *
 * Preset sizes are one tap each; the row still accepts any label so a
 * free-size piece or a numeric size is not blocked.
 */
export default function SizeChartEditor({ value, onChange }: Props) {
  const chart: SizeChart = value ?? { unit: "cm", rows: [] };
  const [showBottom, setShowBottom] = useState(chart.rows.some((r) => r.bottom_length != null));

  function update(rows: SizeChartRow[], unit: SizeUnit = chart.unit) {
    onChange(rows.length === 0 ? null : { unit, rows });
  }
  function setRow(i: number, patch: Partial<SizeChartRow>) {
    update(chart.rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow(size: string) {
    if (chart.rows.some((r) => r.size.toUpperCase() === size.toUpperCase())) return;
    update([...chart.rows, EMPTY_ROW(size)]);
  }
  const num = (v: string) => (v === "" ? 0 : Math.max(0, parseFloat(v) || 0));
  const inputCls = "w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-[#5C3317]/30";
  const unused = SIZE_PRESETS.filter((s) => !chart.rows.some((r) => r.size.toUpperCase() === s));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-sm" role="radiogroup" aria-label="Measurement unit">
          {(["cm", "in"] as SizeUnit[]).map((u) => (
            <button
              key={u} type="button" role="radio" aria-checked={chart.unit === u}
              onClick={() => update(chart.rows, u)}
              className={`px-3 py-1.5 font-medium ${chart.unit === u ? "bg-[#5C3317] text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
            >
              {u === "cm" ? "Centimetres" : "Inches"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={showBottom} onChange={(e) => {
            setShowBottom(e.target.checked);
            if (!e.target.checked) update(chart.rows.map((r) => ({ ...r, bottom_length: null })));
          }} />
          Has trousers (bottom length)
        </label>
      </div>

      {chart.rows.length > 0 && (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-gray-500 text-xs uppercase tracking-wide">
                <th className="py-2 pr-2 font-medium">Size</th>
                <th className="py-2 pr-2 font-medium text-right">Chest</th>
                <th className="py-2 pr-2 font-medium text-right">Waist</th>
                <th className="py-2 pr-2 font-medium text-right">Hip</th>
                <th className="py-2 pr-2 font-medium text-right">Top length</th>
                {showBottom && <th className="py-2 pr-2 font-medium text-right">Bottom length</th>}
                <th className="py-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {chart.rows.map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1.5 pr-2">
                    <input className={inputCls + " !text-left font-semibold w-20"} value={r.size} maxLength={12}
                      onChange={(e) => setRow(i, { size: e.target.value.toUpperCase() })} aria-label="Size label" />
                  </td>
                  {(["chest", "waist", "hip", "top_length"] as const).map((k) => (
                    <td key={k} className="py-1.5 pr-2">
                      <input type="number" inputMode="decimal" min={0} step={chart.unit === "in" ? 0.5 : 1}
                        className={inputCls} value={r[k] || ""} placeholder="—"
                        onChange={(e) => setRow(i, { [k]: num(e.target.value) } as Partial<SizeChartRow>)} aria-label={k.replace("_", " ")} />
                    </td>
                  ))}
                  {showBottom && (
                    <td className="py-1.5 pr-2">
                      <input type="number" inputMode="decimal" min={0} step={chart.unit === "in" ? 0.5 : 1}
                        className={inputCls} value={r.bottom_length ?? ""} placeholder="—"
                        onChange={(e) => setRow(i, { bottom_length: e.target.value === "" ? null : num(e.target.value) })} aria-label="bottom length" />
                    </td>
                  )}
                  <td className="py-1.5">
                    <button type="button" onClick={() => update(chart.rows.filter((_, idx) => idx !== i))}
                      className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50" aria-label={`Remove ${r.size}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500">Add size:</span>
        {unused.map((s) => (
          <button key={s} type="button" onClick={() => addRow(s)}
            className="px-2.5 py-1 rounded-full border border-gray-300 text-xs font-semibold text-gray-700 hover:border-[#5C3317] hover:text-[#5C3317]">
            + {s}
          </button>
        ))}
        <button type="button" onClick={() => { const s = prompt("Size label (e.g. 38, Free)"); if (s?.trim()) addRow(s.trim().toUpperCase()); }}
          className="px-2.5 py-1 rounded-full border border-dashed border-gray-300 text-xs text-gray-500 hover:border-gray-500 inline-flex items-center gap-1">
          <Plus className="w-3 h-3" /> other
        </button>
      </div>
      <p className="text-xs text-gray-400">
        Body measurements the size is cut to fit. Leave a cell blank if you have not measured it — a wrong number causes an exchange, a blank one causes a question.
      </p>
    </div>
  );
}
