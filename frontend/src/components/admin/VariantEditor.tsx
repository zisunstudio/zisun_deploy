"use client";
import { forwardRef, useImperativeHandle, useState } from "react";
import { Plus, Trash2, Check, X, Grid3X3 } from "lucide-react";
import { PALETTE, SIZE_PRESETS, colourCode, swatchStyle } from "@/lib/colours";

export interface VariantRow {
  id?: string;          // undefined for new (unsaved) rows
  sku: string;
  size: string;
  color: string;
  price_delta: number;  // paise
  stock: number;
  is_active: boolean;
}

interface Props {
  variants: VariantRow[];
  onChange: (variants: VariantRow[]) => void;
  /** When provided, each row save calls the API immediately (edit mode). */
  onSaveRow?: (row: VariantRow) => Promise<VariantRow>;
  onDeleteRow?: (row: VariantRow) => Promise<void>;
  basePricePaise?: number;
  /** Stem for generated SKUs, e.g. "MANG-KURTI". Defaults to "ZS". */
  skuPrefix?: string;
}

/**
 * One row per colour × size, skipping any combination that already exists.
 *
 * "Same product, three colours, five sizes" is fifteen SKUs, and typing
 * fifteen rows is the part of listing a product the founder called tough.
 * The grid is the answer: pick the colours, tick the sizes, one stock number,
 * and the rows are written with SKUs a warehouse can read (ZS-RNI-M).
 */
export function gridVariants(
  colours: string[], sizes: string[], stock: number, prefix: string, existing: VariantRow[],
): VariantRow[] {
  const have = new Set(existing.map((v) => `${(v.color || "").toLowerCase()}|${(v.size || "").toLowerCase()}`));
  const stem = (prefix || "ZS").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "ZS";
  const rows: VariantRow[] = [];
  const cols = colours.length ? colours : [""];
  const szs = sizes.length ? sizes : [""];
  for (const c of cols) for (const s of szs) {
    if (have.has(`${c.toLowerCase()}|${s.toLowerCase()}`)) continue;
    const sku = [stem, c ? colourCode(c) : null, s ? s.toUpperCase().replace(/\s+/g, "") : null].filter(Boolean).join("-");
    rows.push({ sku, size: s, color: c, price_delta: 0, stock, is_active: true });
  }
  return rows;
}

const EMPTY: Omit<VariantRow, "id"> = {
  sku: "",
  size: "",
  color: "",
  price_delta: 0,
  stock: 0,
  is_active: true,
};

export interface VariantEditorHandle {
  /**
   * Commit a row the user filled in but never confirmed with the tick.
   *
   * The founder typed a SKU, size, colour and stock, saw a complete-looking
   * row, and clicked Create Product — which then said "Add at least one
   * variant". The row was a local draft; nothing had told the parent. This
   * lets the parent flush that draft at submit time rather than lose it.
   *
   * Returns the committed row, null if there was nothing pending, and throws
   * with the validation message if the draft is unusable.
   */
  flushDraft: () => VariantRow | null;
}

const VariantEditor = forwardRef<VariantEditorHandle, Props>(function VariantEditor({
  variants,
  onChange,
  onSaveRow,
  onDeleteRow,
  basePricePaise = 0,
  skuPrefix = "ZS",
}: Props, ref) {
  const [gridOpen, setGridOpen] = useState(false);
  const [gridColours, setGridColours] = useState<string[]>([]);
  const [gridSizes, setGridSizes] = useState<string[]>(["S", "M", "L", "XL"]);
  const [gridStock, setGridStock] = useState(5);
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  async function commitGrid() {
    const rows = gridVariants(gridColours, gridSizes, gridStock, skuPrefix, variants);
    if (rows.length === 0) { setErr("Every colour and size in that grid already has a row."); return; }
    setSaving(true); setErr(null);
    try {
      const saved: VariantRow[] = [];
      for (const r of rows) saved.push(onSaveRow ? await onSaveRow(r) : r);
      onChange([...variants, ...saved]);
      setGridOpen(false);
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? "Could not save the grid");
    } finally {
      setSaving(false);
    }
  }
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<Omit<VariantRow, "id">>(EMPTY);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function startAdd() {
    setAdding(true);
    setDraft({ ...EMPTY });
    setEditIdx(null);
    setErr(null);
  }

  function startEdit(idx: number) {
    setEditIdx(idx);
    const { id: _id, ...rest } = variants[idx];
    setDraft({ ...rest });
    setAdding(false);
    setErr(null);
  }

  function cancelEdit() {
    setEditIdx(null);
    setAdding(false);
    setErr(null);
  }

  function validate(d: typeof draft): string | null {
    if (!d.sku.trim()) return "SKU is required";
    if (d.stock < 0) return "Stock cannot be negative";
    return null;
  }

  async function commitAdd() {
    const validationError = validate(draft);
    if (validationError) { setErr(validationError); return; }
    setSaving(true);
    setErr(null);
    try {
      const newRow: VariantRow = { ...draft };
      const saved = onSaveRow ? await onSaveRow(newRow) : newRow;
      onChange([...variants, saved]);
      setAdding(false);
      setDraft({ ...EMPTY });
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function commitEdit(idx: number) {
    const validationError = validate(draft);
    if (validationError) { setErr(validationError); return; }
    setSaving(true);
    setErr(null);
    try {
      const updated: VariantRow = { ...variants[idx], ...draft };
      const saved = onSaveRow ? await onSaveRow(updated) : updated;
      const next = [...variants];
      next[idx] = saved;
      onChange(next);
      setEditIdx(null);
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow(idx: number) {
    const row = variants[idx];
    if (!confirm(`Remove variant ${row.sku}?`)) return;
    setSaving(true);
    try {
      if (onDeleteRow) await onDeleteRow(row);
      onChange(variants.filter((_, i) => i !== idx));
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  useImperativeHandle(ref, () => ({
    flushDraft: () => {
      if (!adding) return null;
      // A pristine draft is the "Add variant" button being open, not a row.
      const untouched = !draft.sku.trim() && !draft.size && !draft.color && draft.stock === 0;
      if (untouched) return null;
      const v = validate(draft);
      if (v) throw new Error(`Variant row: ${v}`);
      const row: VariantRow = { ...draft };
      onChange([...variants, row]);
      setAdding(false);
      setDraft({ ...EMPTY });
      return row;
    },
  }), [adding, draft, variants, onChange]);

  const effectivePrice = (delta: number) =>
    `₹${((basePricePaise + delta) / 100).toFixed(0)}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">Variants</span>
        {!adding && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setGridOpen((o) => !o)}
              className="flex items-center gap-1 text-xs text-ink font-semibold hover:underline"
            >
              <Grid3X3 className="w-3.5 h-3.5" /> Colours × sizes
            </button>
            <button
              type="button"
              onClick={startAdd}
              className="flex items-center gap-1 text-xs text-ink font-semibold hover:underline"
            >
              <Plus className="w-3.5 h-3.5" /> Add one
            </button>
          </div>
        )}
      </div>
      {gridOpen && (
        <div className="rounded-lg border border-ink/15 bg-rose/60 p-3 space-y-3">
          <p className="text-xs text-gray-700">Pick every colour this piece comes in, tick the sizes, and one row is written per combination. Photos are pinned to a colour afterwards, on the edit page.</p>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Colours</p>
            <div className="flex flex-wrap gap-1.5">
              {PALETTE.map((c) => {
                const on = gridColours.includes(c.name);
                return (
                  <button key={c.name} type="button" onClick={() => setGridColours(toggle(gridColours, c.name))}
                    aria-pressed={on}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors ${on ? "border-ink bg-ink text-white" : "border-gray-300 bg-white text-gray-700 hover:border-ink"}`}>
                    <span className="inline-block h-3 w-3 rounded-full border border-black/10" style={swatchStyle(c.name)} />
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Sizes</p>
            <div className="flex flex-wrap gap-1.5">
              {SIZE_PRESETS.map((s) => {
                const on = gridSizes.includes(s);
                return (
                  <button key={s} type="button" onClick={() => setGridSizes(toggle(gridSizes, s))} aria-pressed={on}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${on ? "border-ink bg-ink text-white" : "border-gray-300 bg-white text-gray-700 hover:border-ink"}`}>
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs text-gray-700 flex items-center gap-2">Stock per size
              <input type="number" min={0} value={gridStock} onChange={(e) => setGridStock(Math.max(0, Number(e.target.value) || 0))}
                className="w-16 border rounded px-2 py-1 text-xs" />
            </label>
            <span className="text-xs text-gray-500">
              {gridVariants(gridColours, gridSizes, gridStock, skuPrefix, variants).length} new rows · SKUs like {gridVariants(gridColours.slice(0, 1), gridSizes.slice(0, 1), 0, skuPrefix, []).map((r) => r.sku)[0] ?? `${skuPrefix}-…`}
            </span>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => setGridOpen(false)} className="text-xs text-gray-600 px-2 py-1">Cancel</button>
              <button type="button" onClick={commitGrid} disabled={saving || (gridColours.length === 0 && gridSizes.length === 0)}
                className="text-xs bg-ink text-white px-3 py-1.5 rounded-md font-semibold disabled:opacity-50">
                {saving ? "Writing…" : "Write rows"}
              </button>
            </div>
          </div>
        </div>
      )}

      {err && <p className="text-xs text-red-600">{err}</p>}

      {/* Table */}
      {(variants.length > 0 || adding) && (
        <div className="border border-gray-200 rounded-lg overflow-hidden text-sm">
          <table className="w-full">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                {["SKU", "Size", "Colour", "Price", "Stock", ""].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {variants.map((v, idx) =>
                editIdx === idx ? (
                  <VariantInputRow
                    key={idx}
                    draft={draft}
                    onChange={setDraft}
                    onSave={() => commitEdit(idx)}
                    onCancel={cancelEdit}
                    saving={saving}
                  />
                ) : (
                  <tr key={v.id ?? idx} className={`hover:bg-gray-50 ${!v.is_active ? "opacity-40" : ""}`}>
                    <td className="px-3 py-2 font-mono text-xs">{v.sku}</td>
                    <td className="px-3 py-2 text-gray-600">{v.size || "—"}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {v.color ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-block h-3 w-3 rounded-full border border-black/10" style={swatchStyle(v.color)} />
                          {v.color}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2">{effectivePrice(v.price_delta)}</td>
                    <td className="px-3 py-2">{v.stock}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(idx)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteRow(idx)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
              {adding && (
                <VariantInputRow
                  draft={draft}
                  onChange={setDraft}
                  onSave={commitAdd}
                  onCancel={cancelEdit}
                  saving={saving}
                />
              )}
            </tbody>
          </table>
        </div>
      )}

      {variants.length === 0 && !adding && (
        <p className="text-xs text-gray-400 italic">No variants yet. Add at least one.</p>
      )}
    </div>
  );
});

export default VariantEditor;

function VariantInputRow({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  draft: Omit<VariantRow, "id">;
  onChange: (d: Omit<VariantRow, "id">) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const field = (key: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = e.target.type === "number" ? Number(e.target.value) : e.target.value;
    onChange({ ...draft, [key]: val });
  };
  return (
    <tr className="bg-blue-50">
      <td className="px-2 py-1">
        <input
          autoFocus
          className="w-full border rounded px-2 py-1 text-xs font-mono"
          placeholder="SKU-001"
          value={draft.sku}
          onChange={field("sku")}
        />
      </td>
      <td className="px-2 py-1">
        <input
          className="w-full border rounded px-2 py-1 text-xs"
          placeholder="S / M / L"
          list="zisun-size-presets"
          value={draft.size}
          onChange={field("size")}
        />
        <datalist id="zisun-size-presets">
          {SIZE_PRESETS.map((s) => <option key={s} value={s} />)}
        </datalist>
      </td>
      <td className="px-2 py-1">
        {/* A picker, not a text box: one spelling per colour across the
            catalogue, and a swatch the storefront can draw. A value saved
            before the palette existed stays selectable so nothing is lost. */}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-black/10" style={swatchStyle(draft.color)} />
          <select className="w-full border rounded px-1.5 py-1 text-xs bg-white" value={draft.color} onChange={field("color")}>
            <option value="">— no colour —</option>
            {draft.color && !PALETTE.some((c) => c.name === draft.color) && <option value={draft.color}>{draft.color}</option>}
            {PALETTE.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </span>
      </td>
      <td className="px-2 py-1">
        <input
          type="number"
          className="w-20 border rounded px-2 py-1 text-xs"
          placeholder="0"
          value={draft.price_delta}
          onChange={field("price_delta")}
        />
        <span className="text-xs text-gray-400 ml-1">paise</span>
      </td>
      <td className="px-2 py-1">
        <input
          type="number"
          min="0"
          className="w-16 border rounded px-2 py-1 text-xs"
          value={draft.stock}
          onChange={field("stock")}
        />
      </td>
      <td className="px-2 py-1">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="text-green-600 hover:text-green-800 disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
          </button>
          <button type="button" onClick={onCancel} className="text-gray-500 hover:text-gray-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
