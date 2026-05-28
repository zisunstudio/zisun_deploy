"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminApi";

type Variant = { id: string; sku: string; stock: number; size?: string; color?: string; is_active: boolean };
type Product = { id: string; name: string; variants: Variant[] };

export default function AdminInventoryPage() {
  const qc = useQueryClient();
  const [editingVariant, setEditingVariant] = useState<{ productId: string; variantId: string } | null>(null);
  const [newStock, setNewStock] = useState("");

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
    </div>
  );
}
