"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminApi";
import { Eye, EyeOff, Trash2, PlusCircle } from "lucide-react";
import Image from "next/image";

type ContentTag = { tag_name: string; tag_type: string };
type ContentCard = { id: string; type: string; media_url: string; thumbnail_url?: string; caption?: string; status: string; published_at?: string; tags: ContentTag[]; products: any[] };

export default function AdminContentPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newCard, setNewCard] = useState({ type: "IMAGE", media_url: "", caption: "" });

  const { data: cards, isLoading } = useQuery({
    queryKey: ["admin", "content"],
    queryFn: async () => (await adminApi.get<ContentCard[]>("/content/")).data,
  });

  const createCard = useMutation({
    mutationFn: (data: any) => adminApi.post("/content/", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "content"] }); setShowCreate(false); setNewCard({ type: "IMAGE", media_url: "", caption: "" }); },
  });

  const publishCard = useMutation({
    mutationFn: (id: string) => adminApi.patch(`/content/${id}/publish`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "content"] }),
  });

  const unpublishCard = useMutation({
    mutationFn: (id: string) => adminApi.patch(`/content/${id}/unpublish`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "content"] }),
  });

  const deleteCard = useMutation({
    mutationFn: (id: string) => adminApi.delete(`/content/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "content"] }),
  });

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Content</h1>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-[#5C3317] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#4A2810]">
          <PlusCircle className="w-4 h-4" /> Create Card
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">{[1,2,3].map((i) => <div key={i} className="h-48 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(cards ?? []).map((card) => (
            <div key={card.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="relative aspect-[4/5] bg-gray-100">
                <Image
                  src={card.media_url || card.thumbnail_url || ""}
                  alt={card.caption ?? ""}
                  fill
                  className="object-cover"
                />
                <span className={`absolute top-2 right-2 text-xs px-2 py-1 rounded-full font-semibold ${card.status === "PUBLISHED" ? "bg-green-500 text-white" : "bg-gray-800/70 text-white"}`}>
                  {card.status}
                </span>
              </div>
              <div className="p-3">
                {card.caption && <p className="text-sm text-gray-700 mb-2 line-clamp-2">{card.caption}</p>}
                <p className="text-xs text-gray-400 mb-3">{card.products.length} products linked · {card.tags.length} tags</p>
                <div className="flex gap-2">
                  {card.status === "DRAFT" ? (
                    <button onClick={() => publishCard.mutate(card.id)} className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-semibold">
                      <Eye className="w-3 h-3" /> Publish
                    </button>
                  ) : (
                    <button onClick={() => unpublishCard.mutate(card.id)} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded font-semibold">
                      <EyeOff className="w-3 h-3" /> Unpublish
                    </button>
                  )}
                  <button onClick={() => { if (confirm("Delete this card?")) deleteCard.mutate(card.id); }} className="flex items-center gap-1 text-xs bg-red-100 text-red-600 px-2 py-1 rounded font-semibold">
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
          {(!cards || cards.length === 0) && (
            <div className="col-span-3 py-16 text-center text-gray-400">No content cards yet. Create your first one!</div>
          )}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
            <h2 className="font-bold text-gray-900 mb-4">Create Content Card</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-600">Type</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-white" value={newCard.type} onChange={(e) => setNewCard({ ...newCard, type: e.target.value })}>
                  <option value="IMAGE">Image</option>
                  <option value="VIDEO">Video</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600">Media URL</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm mt-1" placeholder="https://..." value={newCard.media_url} onChange={(e) => setNewCard({ ...newCard, media_url: e.target.value })} />
              </div>
              <div>
                <label className="text-sm text-gray-600">Caption</label>
                <textarea className="w-full border rounded-lg px-3 py-2 text-sm mt-1" rows={2} placeholder="Caption…" value={newCard.caption} onChange={(e) => setNewCard({ ...newCard, caption: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => createCard.mutate(newCard)} disabled={!newCard.media_url} className="flex-1 bg-[#5C3317] text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
                Create
              </button>
              <button onClick={() => setShowCreate(false)} className="flex-1 border py-2 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
