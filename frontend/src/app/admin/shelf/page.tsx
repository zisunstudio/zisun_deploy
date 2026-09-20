"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { GripVertical, Pin, PinOff, Sparkles, Save, Loader2 } from "lucide-react";
import { adminApi } from "@/lib/adminApi";

type Product = { id: string; name: string; shelf_rank: number | null; is_active: boolean; media?: { cdn_url?: string | null; url: string }[] };
type Attention = { id: string; impressions: number; views: number; add_to_cart: number; ctr: number | null; attention: number };
type Dash = { attention: { products: Attention[]; ranking?: { half_life_days: number; window_days: number } } };

/**
 * The shelf: what sits where on the storefront.
 *
 * Two sections. "Pinned" is the founder's own order — drag a tile and it
 * stays there. "Arranged by attention" is everything else, shown in the order
 * the algorithm currently has it, with the numbers that put it there, so the
 * ranking is something she can see and argue with rather than a black box.
 * Dragging a tile from the second list into the first pins it; unpinning
 * sends it back to the algorithm.
 */
export default function ShelfPage() {
  const qc = useQueryClient();
  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["admin", "products", "shelf"],
    queryFn: async () => (await adminApi.get<Product[]>("/products/?limit=200")).data,
  });
  const { data: dash } = useQuery<Dash>({
    queryKey: ["admin", "dashboard", 30],
    queryFn: async () => (await adminApi.get("/dashboard")).data,
  });
  const attention = useMemo(() => {
    const m = new Map<string, Attention>();
    dash?.attention.products?.forEach((p) => m.set(p.id, p));
    return m;
  }, [dash]);

  const [pinned, setPinned] = useState<Product[]>([]);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const p = products.filter((x) => x.is_active && x.shelf_rank != null)
      .sort((a, b) => (a.shelf_rank ?? 0) - (b.shelf_rank ?? 0));
    setPinned(p); setDirty(false);
  }, [products]);

  const pinnedIds = new Set(pinned.map((p) => p.id));
  const auto = products.filter((p) => p.is_active && !pinnedIds.has(p.id))
    .sort((a, b) => (attention.get(b.id)?.attention ?? 0) - (attention.get(a.id)?.attention ?? 0));

  const save = useMutation({
    mutationFn: () => adminApi.put("/products/shelf-order", { ids: pinned.map((p) => p.id) }),
    onSuccess: () => { setDirty(false); qc.invalidateQueries({ queryKey: ["admin", "products"] }); },
  });

  // Drag within the pinned list.
  const dragIdx = useRef<number | null>(null);
  function onDragEnter(idx: number) {
    if (dragIdx.current === null || dragIdx.current === idx) return;
    const next = [...pinned];
    const [moved] = next.splice(dragIdx.current, 1);
    next.splice(idx, 0, moved);
    dragIdx.current = idx; setPinned(next); setDirty(true);
  }
  function pin(p: Product) { setPinned([...pinned, p]); setDirty(true); }
  function unpin(id: string) { setPinned(pinned.filter((p) => p.id !== id)); setDirty(true); }
  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir; if (j < 0 || j >= pinned.length) return;
    const next = [...pinned]; [next[idx], next[j]] = [next[j], next[idx]]; setPinned(next); setDirty(true);
  }
  const thumb = (p: Product) => p.media?.[0]?.cdn_url || p.media?.[0]?.url || null;
  const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-[22px] sm:text-2xl font-semibold text-gray-900">Shelf</h1>
          <p className="text-sm text-gray-500 mt-1">
            Drag to choose what sits at the front. Everything you don&apos;t pin is arranged by attention
            {dash?.attention.ranking ? ` — recent activity counts most, halving every ${dash.attention.ranking.half_life_days} days.` : "."}
          </p>
        </div>
        <button onClick={() => save.mutate()} disabled={!dirty || save.isPending}
          className="self-start inline-flex items-center gap-2 h-10 bg-ink text-white px-4 rounded-lg text-sm font-semibold whitespace-nowrap disabled:opacity-40 sm:shrink-0">
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save order
        </button>
      </div>

      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 inline-flex items-center gap-1.5"><Pin className="w-3.5 h-3.5" /> Pinned — your order</h2>
        {pinned.length === 0 ? (
          <p className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl p-6 text-center">Nothing pinned. The whole shelf is arranged by attention. Pin a product below to put it up front.</p>
        ) : (
          <ol className="space-y-2">
            {pinned.map((p, i) => (
              <li key={p.id} draggable onDragStart={() => (dragIdx.current = i)} onDragEnter={() => onDragEnter(i)}
                onDragEnd={() => (dragIdx.current = null)} onDragOver={(e) => e.preventDefault()}
                className="flex items-center gap-3 min-w-0 bg-white border border-gray-200 rounded-xl p-2 pr-3 cursor-grab active:cursor-grabbing">
                <GripVertical className="w-4 h-4 text-gray-300 shrink-0" />
                <span className="w-6 text-center text-xs font-bold text-ink tabular-nums">{i + 1}</span>
                <div className="relative w-12 h-14 rounded-md overflow-hidden bg-gray-100 shrink-0">
                  {thumb(p) && <Image src={thumb(p)!} alt="" fill sizes="48px" className="object-cover" />}
                </div>
                <span className="flex-1 text-sm font-medium text-gray-900 truncate">{p.name}</span>
                <span className="hidden sm:inline text-xs text-gray-400 tabular-nums">{attention.get(p.id)?.views ?? 0} views · ctr {pct(attention.get(p.id)?.ctr)}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => move(i, -1)} className="p-1 text-gray-400 hover:text-gray-700 text-xs" aria-label="Move up">▲</button>
                  <button onClick={() => move(i, 1)} className="p-1 text-gray-400 hover:text-gray-700 text-xs" aria-label="Move down">▼</button>
                  <button onClick={() => unpin(p.id)} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50" aria-label="Unpin"><PinOff className="w-4 h-4" /></button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 inline-flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Arranged by attention</h2>
        {isLoading ? <p className="text-sm text-gray-400">Loading…</p> : (
          <ol className="space-y-2">
            {auto.map((p, i) => {
              const a = attention.get(p.id);
              return (
                <li key={p.id} className="flex items-center gap-3 min-w-0 bg-white border border-gray-100 rounded-xl p-2 pr-3">
                  <span className="w-6 text-center text-xs text-gray-400 tabular-nums">{pinned.length + i + 1}</span>
                  <div className="relative w-12 h-14 rounded-md overflow-hidden bg-gray-100 shrink-0">
                    {thumb(p) && <Image src={thumb(p)!} alt="" fill sizes="48px" className="object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                    <p className="text-xs text-gray-400 tabular-nums">
                      {a ? `${a.impressions} shown · ${a.views} opened · ${a.add_to_cart} bagged · ctr ${pct(a.ctr)} · score ${a.attention}` : "no activity yet"}
                    </p>
                  </div>
                  <button onClick={() => pin(p)} className="shrink-0 inline-flex items-center gap-1 h-9 px-2.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:border-ink hover:text-ink">
                    <Pin className="w-3.5 h-3.5" /> Pin
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
