"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Plus } from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import { BulkProductImport } from "@/components/admin/BulkProductImport";
import { formatPrice } from "@/lib/queries/catalog";
import Image from "next/image";

type Variant = { id: string; sku: string; stock: number; size?: string; color?: string };
type ProductMedia = { url: string; cdn_url?: string | null };
type Product = {
  id: string;
  name: string;
  base_price: number;
  is_active: boolean;
  deleted_at: string | null;
  variants: Variant[];
  media: ProductMedia[];
  category?: { name: string };
};

export default function AdminProductsPage() {
  const qc = useQueryClient();
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editActive, setEditActive] = useState(true);

  const { data: products, isLoading } = useQuery({
    queryKey: ["admin", "products"],
    queryFn: async () => {
      const res = await adminApi.get<Product[]>("/products/?include_inactive=true&limit=200");
      return res.data;
    },
  });

  const softDelete = useMutation({
    mutationFn: (id: string) => adminApi.delete(`/products/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "products"] }),
  });

  const updateProduct = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => adminApi.put(`/products/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "products"] }); setEditId(null); },
  });

  function openEdit(p: Product) {
    setEditId(p.id);
    setEditName(p.name);
    setEditPrice(String(p.base_price));
    setEditActive(p.is_active);
  }

  // Total stock across variants
  function totalStock(variants: Variant[]): number {
    return variants.reduce((sum, v) => sum + v.stock, 0);
  }

  // First image thumbnail URL
  function thumbnailUrl(media: ProductMedia[]): string | null {
    const m = media?.[0];
    if (!m) return null;
    return m.cdn_url ?? m.url ?? null;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Products</h1>
        <Link
          href="/admin/products/new"
          className="flex items-center gap-2 bg-[#5C3317] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#4a2a12]"
        >
          <Plus className="w-4 h-4" /> New Product
        </Link>
      </div>
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["", "Name", "Category", "Base Price", "Variants", "Stock", "Status", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(products ?? []).map((p) => {
                const thumb = thumbnailUrl(p.media ?? []);
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                        {thumb ? (
                          <Image
                            src={thumb}
                            alt={p.name}
                            fill
                            className="object-cover"
                            sizes="40px"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">—</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                    <td className="px-4 py-3 text-gray-600">{p.category?.name ?? "—"}</td>
                    <td className="px-4 py-3 font-semibold">{formatPrice(p.base_price)}</td>
                    <td className="px-4 py-3 text-gray-600">{(p.variants ?? []).length}</td>
                    <td className="px-4 py-3 text-gray-600">{totalStock(p.variants ?? [])}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-semibold ${p.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {p.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link
                          href={`/admin/products/${p.id}/edit`}
                          className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-semibold hover:bg-blue-200"
                        >Edit</Link>
                        <button
                          onClick={() => openEdit(p)}
                          className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded font-semibold hover:bg-gray-200"
                        >Quick</button>
                        {p.is_active && (
                          <button
                            onClick={() => { if (confirm(`Deactivate "${p.name}"?`)) softDelete.mutate(p.id); }}
                            className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded font-semibold hover:bg-red-200"
                          >Deactivate</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit modal */}
      {editId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-80 shadow-xl">
            <h2 className="font-bold text-gray-900 mb-4">Edit Product</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-600">Name</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm mt-1" value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-gray-600">Base Price (₹ paise)</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm mt-1" type="number" min="0" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-600">Active</label>
                <button
                  type="button"
                  onClick={() => setEditActive((v) => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editActive ? "bg-green-500" : "bg-gray-300"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editActive ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => updateProduct.mutate({ id: editId, data: { name: editName, base_price: parseInt(editPrice), is_active: editActive } })}
                disabled={updateProduct.isPending}
                className="flex-1 bg-[#5C3317] text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              >{updateProduct.isPending ? "Saving..." : "Save"}</button>
              <button onClick={() => setEditId(null)} className="flex-1 border py-2 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <BulkProductImport />
    </div>
  );
}
