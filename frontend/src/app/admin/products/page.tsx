"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Plus } from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import { BulkProductImport } from "@/components/admin/BulkProductImport";
import { formatPrice } from "@/lib/queries/catalog";
import Image from "next/image";
import { Page, Card, LinkButton, Button, TableScroll, StockBadge, Pill, EmptyState, th, td } from "@/components/admin/ui";

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

  const rows = products ?? [];
  const Thumb = ({ src, alt, size = "w-10 h-10" }: { src: string | null; alt: string; size?: string }) => (
    <div className={`relative ${size} rounded-lg overflow-hidden bg-gray-100 flex-shrink-0`}>
      {src ? <Image src={src} alt={alt} fill className="object-cover" sizes="64px" /> : <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">—</div>}
    </div>
  );
  const Actions = ({ p }: { p: Product }) => (
    <>
      <LinkButton href={`/admin/products/${p.id}/edit`} size="sm" variant="primary">Edit</LinkButton>
      <Button size="sm" onClick={() => openEdit(p)}>Quick</Button>
      <Button size="sm" onClick={() => updateProduct.mutate({ id: p.id, data: { is_active: !p.is_active } })}>{p.is_active ? "Hide" : "Show"}</Button>
      <Button size="sm" variant="danger" onClick={() => { if (confirm(`Delete "${p.name}"?\n\nIt disappears from the shop and this list. Its photographs stay in storage.`)) softDelete.mutate(p.id); }}>Delete</Button>
    </>
  );
  return (
    <Page title="Products" description={`${rows.length} in the catalogue.`} actions={<LinkButton href="/admin/products/new" variant="primary"><Plus className="w-4 h-4" /> New product</LinkButton>}>
      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <Card><EmptyState title="No products yet" body="Say the product on the New product page and the form fills itself." action={<LinkButton href="/admin/products/new" variant="primary">New product</LinkButton>} /></Card>
      ) : (
        <>
          {/* Phone: cards */}
          <ul className="sm:hidden space-y-3">
            {rows.map((p) => (
              <li key={p.id}>
                <Card padded={false}>
                  <div className="p-4 flex gap-3">
                    <Thumb src={thumbnailUrl(p.media ?? [])} alt={p.name} size="w-16 h-20" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/products/${p.id}/edit`} className="font-semibold text-gray-900 leading-snug line-clamp-2 hover:underline underline-offset-2">{p.name}</Link>
                      <p className="mt-1 text-xs text-gray-500">{p.category?.name ?? "No category"} · {(p.variants ?? []).length} {(p.variants ?? []).length === 1 ? "variant" : "variants"}</p>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900 tabular-nums">{formatPrice(p.base_price)}</span>
                        <Link href={`/admin/inventory?product=${p.id}`} className="inline-flex items-center gap-1 text-xs text-gray-600 hover:underline">stock <StockBadge n={totalStock(p.variants ?? [])} /></Link>
                        <Pill tone={p.is_active ? "good" : "neutral"}>{p.is_active ? "Live" : "Hidden"}</Pill>
                      </div>
                    </div>
                  </div>
                  <div className="px-4 pb-4 flex flex-wrap gap-2"><Actions p={p} /></div>
                </Card>
              </li>
            ))}
          </ul>

          {/* Laptop: the table */}
          <Card padded={false} className="hidden sm:block">
            <TableScroll minWidth={760}>
              <table className="w-full">
                <thead className="border-b border-gray-100"><tr>{["", "Name", "Category", "Price", "Variants", "Stock", "Status", ""].map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className={td}><Thumb src={thumbnailUrl(p.media ?? [])} alt={p.name} /></td>
                      <td className={`${td} font-medium text-gray-900`}><Link href={`/admin/products/${p.id}/edit`} className="hover:underline underline-offset-2">{p.name}</Link></td>
                      <td className={`${td} text-gray-600`}>{p.category?.name ?? "—"}</td>
                      <td className={`${td} font-semibold tabular-nums`}>{formatPrice(p.base_price)}</td>
                      <td className={`${td} text-gray-600`}>{(p.variants ?? []).length}</td>
                      <td className={td}><Link href={`/admin/inventory?product=${p.id}`} title="Adjust stock" className="inline-flex items-center gap-1 hover:underline underline-offset-2"><StockBadge n={totalStock(p.variants ?? [])} /><span className="text-[10px] text-gray-500">stock ›</span></Link></td>
                      <td className={td}><Pill tone={p.is_active ? "good" : "neutral"}>{p.is_active ? "Live" : "Hidden"}</Pill></td>
                      <td className={`${td} text-right whitespace-nowrap`}><div className="inline-flex gap-1.5"><Actions p={p} /></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </Card>
        </>
      )}
      {/* Edit modal */}
      {editId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-5 sm:p-6 w-[calc(100%-2rem)] max-w-md max-h-[90vh] overflow-y-auto shadow-xl">
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
                className="flex-1 bg-ink text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              >{updateProduct.isPending ? "Saving..." : "Save"}</button>
              <button onClick={() => setEditId(null)} className="flex-1 border py-2 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <BulkProductImport />
    </Page>
  );
}
