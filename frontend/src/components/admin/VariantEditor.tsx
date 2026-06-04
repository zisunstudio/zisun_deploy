"use client";
import { useState } from "react";
import { Plus, Trash2, Check, X } from "lucide-react";

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
}

const EMPTY: Omit<VariantRow, "id"> = {
  sku: "",
  size: "",
  color: "",
  price_delta: 0,
  stock: 0,
  is_active: true,
};

export default function VariantEditor({
  variants,
  onChange,
  onSaveRow,
  onDeleteRow,
  basePricePaise = 0,
}: Props) {
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

  const effectivePrice = (delta: number) =>
    `₹${((basePricePaise + delta) / 100).toFixed(0)}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">Variants</span>
        {!adding && (
          <button
            type="button"
            onClick={startAdd}
            className="flex items-center gap-1 text-xs text-[#5C3317] font-semibold hover:underline"
          >
            <Plus className="w-3.5 h-3.5" /> Add variant
          </button>
        )}
      </div>

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
                    <td className="px-3 py-2 text-gray-600">{v.color || "—"}</td>
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
}

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
  const field = (key: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement>) => {
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
          value={draft.size}
          onChange={field("size")}
        />
      </td>
      <td className="px-2 py-1">
        <input
          className="w-full border rounded px-2 py-1 text-xs"
          placeholder="Red"
          value={draft.color}
          onChange={field("color")}
        />
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
