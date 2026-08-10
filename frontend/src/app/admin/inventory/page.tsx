"use client";
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminApi";

type Variant = { id: string; sku: string; stock: number; size?: string; color?: string; is_active: boolean };
type Product = { id: string; name: string; variants: Variant[] };

export default function AdminInventoryPage() {
  const qc = useQueryClient();
  const [editingVariant, setEditingVariant] = useState<{ productId: string; variantId: string } | null>(null);
  const [newStock, setNewStock] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvResult, setCsvResult] = useState<{ updated: number; errors?: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: products, isLoading } = useQuery({
    queryKey: ["admin", "inventory"],
    queryFn: async () => {
      const res = await adminApi.get<Product[]>("/products/?include_inactive=true&limit=200");
      return res.data;
    },
  });

  const updateStock = useMutation({
    mutationFn: ({ productId, variantId, stock }: { productId: string; variantId: string; stock: number }) =>
      adminApi.post(`/products/${productId}/variants/${variantId}/stock`, { stock }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "inventory"] }); setEditingVariant(null); },
  });

  const uploadCsv = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await adminApi.post("/products/bulk-stock-csv", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data as { updated: number; errors?: string[] };
    },
    onSuccess: (data) => {
      setCsvResult(data);
      setCsvFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["admin", "inventory"] });
    },
  });

  function downloadTemplate() {
    const csv = "sku,new_stock\nSKU-001,10\nSKU-002,25";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const allVariants = (products ?? []).flatMap((p) =>
    p.variants.map((v) => ({ ...v, productId: p.id, productName: p.name }))
  );

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Inventory</h1>
      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map((i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Product", "SKU", "Size", "Color", "Stock", "Update"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {allVariants.map((v) => (
                <tr key={v.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{(v as any).productName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{v.sku}</td>
                  <td className="px-4 py-3 text-gray-600">{v.size ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{v.color ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`font-bold ${v.stock === 0 ? "text-red-500" : v.stock <= 5 ? "text-amber-600" : "text-green-600"}`}>
                      {v.stock}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {editingVariant?.variantId === v.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number" min="0"
                          className="w-20 border rounded px-2 py-1 text-xs"
                          value={newStock}
                          onChange={(e) => setNewStock(e.target.value)}
                          autoFocus
                        />
                        <button
                          onClick={() => updateStock.mutate({ productId: (v as any).productId, variantId: v.id, stock: parseInt(newStock) })}
                          className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-semibold"
                        >Save</button>
                        <button onClick={() => setEditingVariant(null)} className="text-xs text-gray-500 px-1">✕</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingVariant({ productId: (v as any).productId, variantId: v.id }); setNewStock(String(v.stock)); }}
                        className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded font-semibold hover:bg-gray-200"
                      >Update</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
            className="text-sm bg-[#5C3317] text-white px-4 py-2 rounded-lg font-semibold disabled:opacity-50 hover:bg-[#4A2810]"
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
