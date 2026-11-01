"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import { Button, Input, Select } from "@/components/admin/ui";
import type { Landing } from "@/lib/influencerLink";

/**
 * Where an influencer's link opens: the home page, one piece, a few pieces
 * picked right here (one reel's three, or every teal piece), a category,
 * or a collection made earlier.
 *
 * "A few pieces" becomes a collection when the link is made
 * (`resolveLanding`), so the visitor lands on a page of exactly those
 * pieces, in the order picked.
 */
export type Choice =
  | { kind: "home" }
  | { kind: "piece"; id: string }
  | { kind: "pieces"; ids: string[] }
  | { kind: "category"; slug: string }
  | { kind: "collection"; slug: string };

type Product = { id: string; name: string; base_price: number; is_active: boolean; category?: { name: string; slug: string } | null;
  media?: { cdn_url?: string | null; url: string }[]; variants?: { color: string | null; stock: number; is_active: boolean }[] };
type Category = { id: string; name: string; slug: string; is_active: boolean };
type Collection = { id: string; name: string; slug: string; is_published: boolean; product_ids: string[] };

const rs = (p: number) => `₹${Math.round(p / 100).toLocaleString("en-IN")}`;
const thumb = (p?: Product) => p?.media?.[0]?.cdn_url ?? p?.media?.[0]?.url ?? null;

export function useLandingData() {
  const products = useQuery<Product[]>({ queryKey: ["admin", "products"], queryFn: async () => (await adminApi.get("/products/?include_inactive=true&limit=200")).data });
  const categories = useQuery<Category[]>({ queryKey: ["admin", "categories"], queryFn: async () => (await adminApi.get("/categories/")).data });
  const collections = useQuery<Collection[]>({ queryKey: ["admin", "collections"], queryFn: async () => (await adminApi.get("/collections")).data });
  return { products: products.data ?? [], categories: categories.data ?? [], collections: collections.data ?? [], loading: products.isLoading };
}

/** A stored landing path, read back into a choice. */
export function choiceFromPath(path: string | null | undefined, collectionSlug?: string | null): Choice {
  const p = path ?? "";
  let m: RegExpMatchArray | null;
  if ((m = p.match(/^\/product\/([0-9a-f-]{36})$/))) return { kind: "piece", id: m[1] };
  if ((m = p.match(/^\/category\/([a-z0-9-]+)$/))) return { kind: "category", slug: m[1] };
  if ((m = p.match(/^\/collections\/([a-z0-9-]+)$/))) return { kind: "collection", slug: m[1] };
  if (!p && collectionSlug) return { kind: "collection", slug: collectionSlug };
  return { kind: "home" };
}

/** Turn a choice into a landing, making the collection for "a few pieces". */
export async function resolveLanding(c: Choice, code: string, influencerName: string, reelName: string): Promise<Landing> {
  if (c.kind !== "pieces") return c;
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const tail = Math.random().toString(36).slice(2, 5);
  const name = reelName.trim() || `${influencerName.split(" ")[0]}'s pieces`;
  const slug = `${code}-${(reelName.trim() || "edit").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "edit"}-${stamp}${tail}`;
  const r = await adminApi.post("/collections", { name, slug, is_published: true, product_ids: c.ids });
  return { kind: "collection", slug: r.data.slug };
}

export function choiceReady(c: Choice): boolean {
  if (c.kind === "piece") return !!c.id;
  if (c.kind === "pieces") return c.ids.length > 0;
  if (c.kind === "category" || c.kind === "collection") return !!c.slug;
  return true;
}

export default function LandingPicker({ value, onChange }: { value: Choice; onChange: (c: Choice) => void }) {
  const { products, categories, collections, loading } = useLandingData();
  const live = products.filter((p) => p.is_active !== false);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const [q, setQ] = useState("");
  const colours = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of live) for (const v of p.variants ?? []) if (v.is_active && v.color) {
      const k = v.color.trim(); const list = m.get(k) ?? []; if (!list.includes(p.id)) list.push(p.id); m.set(k, list);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length).slice(0, 10);
  }, [live]);

  const kind = value.kind;
  const ids = value.kind === "pieces" ? value.ids : [];
  const setIds = (next: string[]) => onChange({ kind: "pieces", ids: next });
  const add = (more: string[]) => setIds([...ids, ...more.filter((x) => !ids.includes(x))]);
  const move = (i: number, d: -1 | 1) => { const n = [...ids]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setIds(n); };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Opens">
        {([["pieces", "A few pieces"], ["piece", "One piece"], ["category", "A category"], ["home", "Home page"], ["collection", "Saved collection"]] as const).map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k}
            onClick={() => onChange(k === "home" ? { kind: "home" } : k === "piece" ? { kind: "piece", id: "" } : k === "pieces" ? { kind: "pieces", ids: [] } : k === "category" ? { kind: "category", slug: "" } : { kind: "collection", slug: "" })}
            className={`h-9 px-3 rounded-full text-sm border ${kind === k ? "bg-ink text-white border-ink" : "bg-white text-gray-700 border-gray-300"}`}>{label}</button>
        ))}
      </div>

      {value.kind === "piece" && (
        <Select value={value.id} onChange={(e) => onChange({ kind: "piece", id: e.target.value })}>
          <option value="">Choose the piece…</option>
          {live.map((p) => <option key={p.id} value={p.id}>{p.name} · {rs(p.base_price)}</option>)}
        </Select>
      )}

      {value.kind === "category" && (
        <Select value={value.slug} onChange={(e) => onChange({ kind: "category", slug: e.target.value })}>
          <option value="">Choose the category…</option>
          {categories.filter((c) => c.is_active).map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </Select>
      )}

      {value.kind === "collection" && (
        <Select value={value.slug} onChange={(e) => onChange({ kind: "collection", slug: e.target.value })}>
          <option value="">Choose the collection…</option>
          {collections.map((c) => <option key={c.id} value={c.slug}>{c.name} · {c.product_ids.length} pieces{c.is_published ? "" : " (draft - switch it on in Collections)"}</option>)}
        </Select>
      )}

      {value.kind === "home" && <p className="text-xs text-gray-500">Opens the home page. Use it for a reel about ZISUN rather than particular pieces.</p>}

      {value.kind === "pieces" && (
        <div className="space-y-2">
          {ids.length > 0 && (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {ids.map((id, i) => {
                const p = byId.get(id);
                return (
                  <li key={id} className="px-2 py-1.5 flex items-center gap-2">
                    <span className="w-8 h-10 rounded bg-gray-100 overflow-hidden shrink-0">{thumb(p) && <img src={thumb(p)!} alt="" className="w-full h-full object-cover" />}</span>
                    <span className="min-w-0 flex-1 text-sm text-gray-900 truncate">{p?.name ?? "…"}</span>
                    <span className="flex gap-1 shrink-0">
                      <Button size="sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" aria-label="Move down" disabled={i === ids.length - 1} onClick={() => move(i, 1)}><ArrowDown className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" aria-label="Remove" onClick={() => setIds(ids.filter((x) => x !== id))}><X className="w-3.5 h-3.5" /></Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {(colours.length > 0 || categories.length > 0) && (
            <div>
              <p className="text-[11px] text-gray-500 mb-1">Add all of one colour or one category (for a colour reel):</p>
              <div className="flex flex-wrap gap-1.5">
                {colours.map(([name, list]) => (
                  <button key={name} type="button" onClick={() => add(list)} className="h-8 px-2.5 rounded-full border border-gray-300 bg-white text-xs text-gray-700">+ {name} ({list.length})</button>
                ))}
                {categories.filter((c) => c.is_active).map((c) => {
                  const list = live.filter((p) => p.category?.slug === c.slug).map((p) => p.id);
                  return list.length ? <button key={c.id} type="button" onClick={() => add(list)} className="h-8 px-2.5 rounded-full border border-gray-300 bg-white text-xs text-gray-700">+ {c.name} ({list.length})</button> : null;
                })}
              </div>
            </div>
          )}
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a piece to add" />
          <ul className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {live.filter((p) => !ids.includes(p.id) && p.name.toLowerCase().includes(q.trim().toLowerCase())).map((p) => (
              <li key={p.id} className="py-1.5 flex items-center gap-2">
                <span className="w-8 h-10 rounded bg-gray-100 overflow-hidden shrink-0">{thumb(p) && <img src={thumb(p)!} alt="" className="w-full h-full object-cover" />}</span>
                <span className="min-w-0 flex-1"><span className="block text-sm text-gray-900 truncate">{p.name}</span><span className="block text-xs text-gray-500">{rs(p.base_price)}</span></span>
                <Button size="sm" onClick={() => add([p.id])}>Add</Button>
              </li>
            ))}
            {loading && <li className="py-2 text-xs text-gray-500">Loading pieces…</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
