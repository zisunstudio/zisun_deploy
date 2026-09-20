"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil } from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import { PALETTE, SIZE_PRESETS, swatchStyle } from "@/lib/colours";
import { Page, Card, CardHeader, Button, LinkButton, TableScroll, StockBadge, Swatch, Sku, EmptyState, th, td } from "@/components/admin/ui";

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

  /**
   * The edit form for one variant. The same fields whether it is a new row
   * or an existing one; on a phone they stack two to a line, on a laptop
   * they sit across the table's width.
   */
  function EditForm({ productId, variantId, basePrice }: { productId: string; variantId: string | null; basePrice: number }) {
    const submit = () => { if (!variantId && !draft.sku.trim()) { setErr("SKU is required"); return; } save.mutate({ productId, variantId, d: draft, basePrice }); };
    const lbl = "block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1";
    const inp = "w-full h-10 rounded-lg border border-gray-300 px-3 text-[15px] sm:text-sm bg-white";
    return (
      <div className="px-4 py-3 sm:px-5 bg-rose/50 border-t border-gray-100">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <label className="block sm:col-span-2"><span className={lbl}>SKU</span>
            <input className={`${inp} font-mono`} placeholder="SKU" value={draft.sku} onChange={field("sku")} disabled={!!variantId} autoFocus={!variantId} /></label>
          <label className="block"><span className={lbl}>Size</span>
            <input className={inp} list="inv-sizes" placeholder="M" value={draft.size} onChange={field("size")} />
            <datalist id="inv-sizes">{SIZE_PRESETS.map((s) => <option key={s} value={s} />)}</datalist></label>
          <label className="block"><span className={lbl}>Colour</span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3.5 w-3.5 rounded-full border border-black/10 shrink-0" style={swatchStyle(draft.color)} />
              <select className={`${inp} px-2`} value={draft.color} onChange={field("color")}>
                <option value="">— none —</option>
                {draft.color && !PALETTE.some((c) => c.name === draft.color) && <option value={draft.color}>{draft.color}</option>}
                {PALETTE.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </span></label>
          <label className="block"><span className={lbl}>Price ₹</span>
            <input type="text" inputMode="numeric" className={inp} placeholder={String(Math.round(basePrice / 100))} value={draft.price_rupees} onChange={field("price_rupees")} title="This variant's own price. Blank = base price." /></label>
          <label className="block"><span className={lbl}>Stock</span>
            <input type="text" inputMode="numeric" className={inp} placeholder="0" value={draft.stock} onChange={field("stock")} /></label>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" className="h-4 w-4" checked={draft.is_active} onChange={field("is_active")} /> On sale</label>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setEditing(null)}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={submit} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Page
      title="Inventory"
      description="Every size and colour, by product. Edit in place; open the product for photos, price and details."
      actions={onlyProduct ? <LinkButton href="/admin/inventory" size="sm">Show all products</LinkButton> : undefined}
    >
      {err && <p className="mb-3 text-sm text-red-700">{err}</p>}
      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="space-y-4">
          {shown.map((p) => {
            const total = p.variants.reduce((s, v) => s + v.stock, 0);
            const isEditing = (id: string | null) => editing?.productId === p.id && editing.variantId === id;
            return (
              <Card key={p.id} padded={false}>
                <CardHeader
                  title={p.name}
                  href={`/admin/products/${p.id}/edit`}
                  meta={`${rupees(p.base_price)} · ${p.variants.length} ${p.variants.length === 1 ? "variant" : "variants"} · ${total} units`}
                  actions={<>
                    <LinkButton href={`/admin/products/${p.id}/edit`} size="sm"><Pencil className="w-3.5 h-3.5" /> Edit product</LinkButton>
                    <Button size="sm" variant="primary" onClick={() => startAdd(p.id)}><Plus className="w-3.5 h-3.5" /> Add size/colour</Button>
                  </>}
                />

                {/* Phone: one stacked row per variant. */}
                <ul className="sm:hidden divide-y divide-gray-100">
                  {p.variants.map((v) => isEditing(v.id) ? (
                    <li key={v.id}><EditForm productId={p.id} variantId={v.id} basePrice={p.base_price} /></li>
                  ) : (
                    <li key={v.id} className={`px-4 py-3 ${!v.is_active ? "opacity-50" : ""}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm text-gray-900">
                            <span className="font-semibold">{v.size || "One size"}</span>
                            <Swatch colour={v.color} className="text-gray-700" />
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                            <Sku>{v.sku}</Sku><span>·</span><span className="tabular-nums text-gray-700">{rupees(p.base_price + (v.price_delta ?? 0))}</span>{!v.is_active && <><span>·</span><span>off sale</span></>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <StockBadge n={v.stock} />
                          <Button size="sm" onClick={() => startEdit(p.id, v, p.base_price)}>Edit</Button>
                          <button onClick={() => { if (confirm(`Delete ${v.sku}?`)) remove.mutate({ productId: p.id, variantId: v.id }); }} className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50" aria-label={`Delete ${v.sku}`}><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    </li>
                  ))}
                  {isEditing(null) && <li><EditForm productId={p.id} variantId={null} basePrice={p.base_price} /></li>}
                  {p.variants.length === 0 && !isEditing(null) && (
                    <li><EmptyState title="No sizes or colours yet" body="Add one, or open the product and use Colours × sizes." /></li>
                  )}
                </ul>

                {/* Laptop: the table. */}
                <div className="hidden sm:block">
                  <TableScroll minWidth={620}>
                    <table className="w-full">
                      <thead className="border-b border-gray-100"><tr>{["SKU", "Size", "Colour", "Price", "Stock", "On sale", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {p.variants.map((v) => isEditing(v.id) ? (
                          <tr key={v.id}><td colSpan={7} className="p-0"><EditForm productId={p.id} variantId={v.id} basePrice={p.base_price} /></td></tr>
                        ) : (
                          <tr key={v.id} className={`hover:bg-gray-50 ${!v.is_active ? "opacity-50" : ""}`}>
                            <td className={td}><Sku>{v.sku}</Sku></td>
                            <td className={td}>{v.size || "—"}</td>
                            <td className={td}><Swatch colour={v.color} /></td>
                            <td className={`${td} tabular-nums`}>{rupees(p.base_price + (v.price_delta ?? 0))}</td>
                            <td className={td}><StockBadge n={v.stock} /></td>
                            <td className={`${td} text-xs`}>{v.is_active ? "Yes" : "No"}</td>
                            <td className={`${td} text-right whitespace-nowrap`}>
                              <Button size="sm" onClick={() => startEdit(p.id, v, p.base_price)}>Edit</Button>
                              <button onClick={() => { if (confirm(`Delete ${v.sku}?`)) remove.mutate({ productId: p.id, variantId: v.id }); }} className="ml-1 h-9 w-9 inline-flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50" aria-label={`Delete ${v.sku}`}><Trash2 className="w-4 h-4" /></button>
                            </td>
                          </tr>
                        ))}
                        {isEditing(null) && <tr><td colSpan={7} className="p-0"><EditForm productId={p.id} variantId={null} basePrice={p.base_price} /></td></tr>}
                        {p.variants.length === 0 && !isEditing(null) && (
                          <tr><td colSpan={7}><EmptyState title="No sizes or colours yet" body="Add one, or open the product and use Colours × sizes." /></td></tr>
                        )}
                      </tbody>
                    </table>
                  </TableScroll>
                </div>
              </Card>
            );
          })}
          {shown.length === 0 && <Card><EmptyState title="No products yet" action={<LinkButton href="/admin/products/new" variant="primary">New product</LinkButton>} /></Card>}
        </div>
      )}
      {/* Bulk stock by CSV */}
      <Card className="mt-8">
        <h2 className="font-semibold text-gray-900">Bulk stock update by CSV</h2>
        <p className="text-xs text-gray-500 mt-1 mb-4">Columns <code className="bg-gray-100 px-1 rounded">sku</code> and <code className="bg-gray-100 px-1 rounded">new_stock</code>. Each row sets that variant&apos;s stock.</p>
        <div className="flex flex-wrap gap-3 items-center">
          <Button size="sm" onClick={downloadTemplate}>Download template</Button>
          <input ref={fileInputRef} type="file" accept=".csv" className="text-sm text-gray-600 file:mr-3 file:h-9 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-gray-100 file:text-gray-700" onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)} />
          <Button size="sm" variant="primary" onClick={() => { if (csvFile) uploadCsv.mutate(csvFile); }} disabled={!csvFile || uploadCsv.isPending}>{uploadCsv.isPending ? "Uploading…" : "Upload"}</Button>
        </div>
        {uploadCsv.isError && <p className="mt-3 text-sm text-red-700">Upload failed. Check the file and try again.</p>}
        {csvResult && (
          <div className="mt-3 text-sm">
            <p className="text-green-700 font-medium">{csvResult.updated} variants updated.</p>
            {csvResult.errors?.length ? <ul className="mt-1 text-xs text-amber-700 list-disc pl-4">{csvResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul> : null}
          </div>
        )}
      </Card>
    </Page>
  );
}
