"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import { PALETTE, SIZE_PRESETS, swatchStyle } from "@/lib/colours";

type Variant = { id: string; sku: string; stock: number; size?: string | null; color?: string | null; price_delta: number; is_active: boolean };
type Product = { id: string; name: string; base_price: number; variants: Variant[] };
// Strings on purpose: a controlled number input cannot be emptied. Price is
// the variant's own selling price in rupees; the delta is computed at save.
type Draft = { sku: string; size: string; color: string; stock: string; price_rupees: string; is_active: boolean };

const EMPTY: Draft = { sku: "", size: "", color: "", stock: "", price_rupees: "", is_active: true };

/**
 * Inventory: every size and colour of every product, editable in place.
 *
 * Grouped by product because that is how stock is counted — "the rani pink
 * kurti, how many M left" — and each row can be corrected, switched off or
 * removed without leaving the page. A new size or colour is added under its
 * product. The full listing (photos, fabric, price) is one click away.
 */
export default function AdminInventoryPage() {
  const onlyProduct = useSearchParams().get("product");
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ productId: string; variantId: string | null } | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [err, setErr] = useState<string | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvResult, setCsvResult] = useState<{ updated: number; errors?: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: products, isLoading } = useQuery({
    queryKey: ["admin", "inventory"],
    queryFn: async () => (await adminApi.get<Product[]>("/products/?include_inactive=true&limit=200")).data,
  });
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["admin", "inventory"] }); qc.invalidateQueries({ queryKey: ["admin", "products"] }); };

  const save = useMutation({
    mutationFn: async ({ productId, variantId, d, basePrice }: { productId: string; variantId: string | null; d: Draft; basePrice: number }) => {
      const rupees = d.price_rupees.trim() === "" ? null : Number(d.price_rupees);
      const body = {
        size: d.size || null, color: d.color || null, is_active: d.is_active,
        stock: d.stock.trim() === "" ? 0 : Math.max(0, Math.floor(Number(d.stock) || 0)),
        price_delta: rupees == null || Number.isNaN(rupees) ? 0 : Math.round(rupees * 100) - basePrice,
      };
      if (variantId) return adminApi.put(`/products/${productId}/variants/${variantId}`, body);
      return adminApi.post(`/products/${productId}/variants/`, { sku: d.sku.trim(), ...body });
    },
    onSuccess: () => { invalidate(); setEditing(null); setErr(null); },
    onError: (e: any) => setErr(e?.response?.data?.detail ?? "Could not save"),
  });
  const remove = useMutation({
    mutationFn: ({ productId, variantId }: { productId: string; variantId: string }) => adminApi.delete(`/products/${productId}/variants/${variantId}`),
    onSuccess: invalidate,
    onError: (e: any) => setErr(e?.response?.data?.detail ?? "Could not delete"),
  });
  const uploadCsv = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await adminApi.post("/products/bulk-stock-csv", formData, { headers: { "Content-Type": "multipart/form-data" } });
      return res.data as { updated: number; errors?: string[] };
    },
    onSuccess: (data) => { setCsvResult(data); setCsvFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; invalidate(); },
  });

  function downloadTemplate() {
    const blob = new Blob(["sku,new_stock\nSKU-001,10\nSKU-002,25"], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "inventory_template.csv"; a.click();
    URL.revokeObjectURL(url);
  }
  function startEdit(productId: string, v: Variant, basePrice: number) {
    setEditing({ productId, variantId: v.id });
    setDraft({ sku: v.sku, size: v.size ?? "", color: v.color ?? "", stock: String(v.stock), is_active: v.is_active,
      price_rupees: v.price_delta ? String(Math.round((basePrice + v.price_delta) / 100)) : "" });
    setErr(null);
  }
  function startAdd(productId: string) {
    setEditing({ productId, variantId: null });
    setDraft({ ...EMPTY });
    setErr(null);
  }
  const field = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const el = e.target as HTMLInputElement;
    const val = el.type === "checkbox" ? el.checked : el.value;
    setDraft((d) => ({ ...d, [key]: val }));
  };

  const shown = (products ?? []).filter((p) => !onlyProduct || p.id === onlyProduct);
  const rupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

  function EditRow({ productId, variantId, basePrice }: { productId: string; variantId: string | null; basePrice: number }) {
    return (
      <tr className="bg-rose/60">
        <td className="px-3 py-2">
          <input className="w-32 border rounded px-2 py-1 text-xs font-mono" placeholder="SKU" value={draft.sku} onChange={field("sku")} disabled={!!variantId} autoFocus={!variantId} />
        </td>
        <td className="px-3 py-2">
          <input className="w-20 border rounded px-2 py-1 text-xs" list="inv-sizes" placeholder="M" value={draft.size} onChange={field("size")} />
          <datalist id="inv-sizes">{SIZE_PRESETS.map((s) => <option key={s} value={s} />)}</datalist>
        </td>
        <td className="px-3 py-2">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded-full border border-black/10 shrink-0" style={swatchStyle(draft.color)} />
            <select className="border rounded px-1.5 py-1 text-xs bg-white" value={draft.color} onChange={field("color")}>
              <option value="">— none —</option>
              {draft.color && !PALETTE.some((c) => c.name === draft.color) && <option value={draft.color}>{draft.color}</option>}
              {PALETTE.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </span>
        </td>
        <td className="px-3 py-2">
          <span className="inline-flex items-center gap-1"><span className="text-xs text-gray-500">₹</span>
            <input type="text" inputMode="numeric" className="w-20 border rounded px-2 py-1 text-xs" placeholder={String(Math.round(basePrice / 100))} value={draft.price_rupees} onChange={field("price_rupees")} title="This variant's own price. Blank = base price." />
          </span>
        </td>
        <td className="px-3 py-2"><input type="text" inputMode="numeric" className="w-16 border rounded px-2 py-1 text-xs" placeholder="0" value={draft.stock} onChange={field("stock")} /></td>
        <td className="px-3 py-2"><input type="checkbox" checked={draft.is_active} onChange={field("is_active")} /></td>
        <td className="px-3 py-2">
          <div className="flex gap-1.5">
            <button onClick={() => { if (!variantId && !draft.sku.trim()) { setErr("SKU is required"); return; } save.mutate({ productId, variantId, d: draft, basePrice }); }}
              disabled={save.isPending} className="text-green-700 hover:text-green-900 disabled:opacity-50" aria-label="Save"><Check className="w-4 h-4" /></button>
            <button onClick={() => setEditing(null)} className="text-gray-500 hover:text-gray-700" aria-label="Cancel"><X className="w-4 h-4" /></button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-end justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-xs text-gray-500 mt-0.5">Every size and colour, by product. Edit in place; open the product for photos, price and details.</p>
        </div>
        {onlyProduct && <Link href="/admin/inventory" className="text-xs text-ink underline underline-offset-2">Show all products</Link>}
      </div>
      {err && <p className="mb-3 text-xs text-red-700">{err}</p>}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map((i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}</div>
      ) : (
        <div className="space-y-4">
          {shown.map((p) => {
            const total = p.variants.reduce((s, v) => s + v.stock, 0);
            return (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
                  <div className="min-w-0">
                    <Link href={`/admin/products/${p.id}/edit`} className="font-semibold text-gray-900 hover:text-ink hover:underline underline-offset-2 truncate">{p.name}</Link>
                    <span className="ml-2 text-xs text-gray-500">{rupees(p.base_price)} · {p.variants.length} {p.variants.length === 1 ? "variant" : "variants"} · {total} units</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link href={`/admin/products/${p.id}/edit`} className="text-xs text-gray-700 inline-flex items-center gap-1 hover:underline"><Pencil className="w-3 h-3" /> Edit product</Link>
                    <button onClick={() => startAdd(p.id)} className="text-xs bg-ink text-white px-2.5 py-1 rounded-md font-semibold inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add size/colour</button>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-500">
                    <tr>{["SKU", "Size", "Colour", "Price", "Stock", "On", ""].map((h) => <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {p.variants.map((v) => editing?.productId === p.id && editing.variantId === v.id ? (
                      <EditRow key={v.id} productId={p.id} variantId={v.id} basePrice={p.base_price} />
                    ) : (
                      <tr key={v.id} className={`hover:bg-gray-50 ${!v.is_active ? "opacity-50" : ""}`}>
                        <td className="px-3 py-2 font-mono text-xs text-gray-700">{v.sku}</td>
                        <td className="px-3 py-2 text-gray-700">{v.size || "—"}</td>
                        <td className="px-3 py-2 text-gray-700">
                          {v.color ? <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full border border-black/10" style={swatchStyle(v.color)} />{v.color}</span> : "—"}
                        </td>
                        <td className="px-3 py-2 text-gray-700 text-xs tabular-nums">{rupees(p.base_price + (v.price_delta ?? 0))}</td>
                        <td className="px-3 py-2"><span className={`font-bold ${v.stock === 0 ? "text-red-500" : v.stock <= 5 ? "text-amber-600" : "text-green-700"}`}>{v.stock}</span></td>
                        <td className="px-3 py-2 text-xs">{v.is_active ? "Yes" : "No"}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            <button onClick={() => startEdit(p.id, v, p.base_price)} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded font-semibold hover:bg-gray-200">Edit</button>
                            <button onClick={() => { if (confirm(`Delete ${v.sku}?`)) remove.mutate({ productId: p.id, variantId: v.id }); }} className="text-xs text-red-600 hover:bg-red-50 px-1.5 py-1 rounded" aria-label={`Delete ${v.sku}`}><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {editing?.productId === p.id && editing.variantId === null && <EditRow productId={p.id} variantId={null} basePrice={p.base_price} />}
                    {p.variants.length === 0 && editing?.productId !== p.id && (
                      <tr><td colSpan={7} className="px-3 py-3 text-xs text-gray-500">No sizes or colours yet — add one, or open the product and use Colours × sizes.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })}
          {shown.length === 0 && <p className="text-sm text-gray-500">No products yet.</p>}
        </div>
      )}
      {/* Bulk CSV Upload */}
      <div className="mt-8 bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-1">Bulk Stock Update via CSV</h2>
        <p className="text-xs text-gray-500 mb-4">Upload a CSV with columns: <code className="bg-gray-100 px-1 rounded">sku</code>, <code className="bg-gray-100 px-1 rounded">new_stock</code>. Each row updates the matching variant&#39;s stock level.</p>
        <div className="flex flex-wrap gap-3 items-center">
          <button
            onClick={downloadTemplate}
            className="text-sm border border-gray-300 text-gray-700 px-3 py-2 rounded-lg font-semibold hover:bg-gray-50"
          >
            Download Template
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
            onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={() => { if (csvFile) uploadCsv.mutate(csvFile); }}
            disabled={!csvFile || uploadCsv.isPending}
            className="text-sm bg-ink text-white px-4 py-2 rounded-lg font-semibold disabled:opacity-50 hover:bg-ink/90"
          >
            {uploadCsv.isPending ? "Uploading..." : "Upload"}
          </button>
        </div>
        {uploadCsv.isError && (
          <p className="mt-3 text-sm text-red-600">Upload failed. Ensure the CSV format is correct.</p>
        )}
        {csvResult && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
            <p className="font-semibold text-green-800">{csvResult.updated} variant(s) updated successfully.</p>
            {(csvResult.errors?.length ?? 0) > 0 && (
              <ul className="mt-2 list-disc list-inside text-red-600 space-y-0.5">
                {(csvResult.errors ?? []).map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
