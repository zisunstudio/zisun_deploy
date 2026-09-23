"use client";
import { Page, Card, TableScroll } from "@/components/admin/ui";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Tag } from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import { imageUrlProblem } from "@/lib/mediaHost";

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  image_url?: string | null;
  is_active: boolean;
  product_count: number;
}

const EMPTY = { name: "", description: "", image_url: "", slug: "" };

export default function AdminCategoriesPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ["admin", "categories"],
    queryFn: async () => (await adminApi.get("/categories/")).data,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "categories"] });

  const createCategory = useMutation({
    mutationFn: (data: typeof EMPTY) => adminApi.post("/categories/", data),
    onSuccess: () => { invalidate(); closeModal(); },
    onError: (e: any) => setError(e?.response?.data?.detail ?? "Create failed"),
  });

  const updateCategory = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof EMPTY & { is_active: boolean }> }) =>
      adminApi.put(`/categories/${id}`, data),
    onSuccess: () => { invalidate(); closeModal(); },
    onError: (e: any) => setError(e?.response?.data?.detail ?? "Update failed"),
  });

  const deleteCategory = useMutation({
    mutationFn: (id: string) => adminApi.delete(`/categories/${id}`),
    onSuccess: invalidate,
    onError: (e: any) => setError(e?.response?.data?.detail ?? "Delete failed"),
  });

  function openCreate() {
    setForm(EMPTY);
    setEditing(null);
    setError(null);
    setModal("create");
  }

  function openEdit(cat: Category) {
    setForm({
      name: cat.name,
      description: cat.description ?? "",
      image_url: cat.image_url ?? "",
      slug: cat.slug,
    });
    setEditing(cat);
    setError(null);
    setModal("edit");
  }

  function closeModal() {
    setModal(null);
    setEditing(null);
    setForm(EMPTY);
    setError(null);
  }

  function handleSubmit() {
    if (!form.name.trim()) { setError("Name is required"); return; }
    const payload = {
      name: form.name.trim(),
      description: form.description || undefined,
      image_url: form.image_url || undefined,
      slug: form.slug || undefined,
    };
    if (modal === "create") {
      createCategory.mutate(payload as any);
    } else if (editing) {
      updateCategory.mutate({ id: editing.id, data: payload });
    }
  }

  const isPending = createCategory.isPending || updateCategory.isPending;

  return (
    <Page title="Categories" description="Each one is an occasion on the home page; its description is the line under the name." actions={<><button
          onClick={openCreate}
          className="flex items-center gap-2 bg-ink text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-ink/85"
        >
          <Plus className="w-4 h-4" /> New Category
        </button></>}>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Tag className="w-12 h-12 mb-3" />
          <p className="text-sm">No categories yet</p>
        </div>
      ) : (
        // Cards, on every screen: there are a handful of categories, and the
        // description under each name is the line the home page shows - it
        // deserves to be read in full, not truncated into a table cell.
        <ul className="space-y-3">
          {categories.map((cat) => (
            <li key={cat.id} className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{cat.name}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${cat.is_active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>{cat.is_active ? "Live" : "Hidden"}</span>
                  </div>
                  <p className={`mt-1 text-sm ${cat.description ? "text-gray-600" : "text-amber-700"}`}>
                    {cat.description || "No description yet — this line shows under the name on the home page."}
                  </p>
                  <p className="mt-1.5 text-xs text-gray-400"><span className="font-mono">{cat.slug}</span> · {cat.product_count} {cat.product_count === 1 ? "product" : "products"}</p>
                </div>
                <div className="flex gap-2 sm:shrink-0">
                  <button onClick={() => openEdit(cat)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-800 hover:bg-gray-50">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  {cat.is_active && (
                    <button onClick={() => { if (confirm(`Hide "${cat.name}" from the shop?`)) deleteCategory.mutate(cat.id); }}
                      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-red-200 bg-white text-xs font-semibold text-red-700 hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5" /> Hide
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {/* Create / Edit modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-5 sm:p-6 w-[calc(100%-2rem)] max-w-md max-h-[90vh] overflow-y-auto shadow-xl">
            <h2 className="font-bold text-gray-900 mb-4">
              {modal === "create" ? "New Category" : `Edit: ${editing?.name}`}
            </h2>

            {error && (
              <p className="text-xs text-red-600 mb-3">{error}</p>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Name *</label>
                <input
                  autoFocus
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">
                  Slug <span className="text-gray-400">(auto-generated if blank)</span>
                </label>
                <input
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm font-mono"
                  placeholder="e.g. ethnic-wear"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Description</label>
                <input
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Image URL</label>
                <input
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                  placeholder="https://..."
                  value={form.image_url}
                  onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                />
                {/* A URL from any other host returns 400 from the image
                    optimizer and the picture is simply absent - no broken
                    icon, no error. Said here rather than discovered later. */}
                {imageUrlProblem(form.image_url) && (
                  <p className="mt-1 text-xs text-amber-700">{imageUrlProblem(form.image_url)}</p>
                )}
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={handleSubmit}
                disabled={isPending}
                className="flex-1 bg-ink text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {isPending ? "Saving…" : modal === "create" ? "Create" : "Save"}
              </button>
              <button
                onClick={closeModal}
                className="flex-1 border py-2 rounded-lg text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
