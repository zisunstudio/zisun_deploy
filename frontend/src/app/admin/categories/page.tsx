"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Tag } from "lucide-react";
import { adminApi } from "@/lib/adminApi";

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
      description: form.description || null,
      image_url: form.image_url || null,
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
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-[#5C3317] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#4a2a12]"
        >
          <Plus className="w-4 h-4" /> New Category
        </button>
      </div>

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
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Name", "Slug", "Products", "Status", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {categories.map((cat) => (
                <tr key={cat.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <div>{cat.name}</div>
                    {cat.description && (
                      <div className="text-xs text-gray-400 truncate max-w-xs">{cat.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{cat.slug}</td>
                  <td className="px-4 py-3 text-gray-600">{cat.product_count}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-semibold ${
                        cat.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {cat.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(cat)}
                        className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-semibold hover:bg-blue-200 flex items-center gap-1"
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                      {cat.is_active && (
                        <button
                          onClick={() => {
                            if (confirm(`Deactivate "${cat.name}"?`))
                              deleteCategory.mutate(cat.id);
                          }}
                          className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded font-semibold hover:bg-red-200 flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" /> Deactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
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
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={handleSubmit}
                disabled={isPending}
                className="flex-1 bg-[#5C3317] text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
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
    </div>
  );
}
