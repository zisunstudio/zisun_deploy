"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Copy, X } from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import { Button, Card, CardHeader, Field, Input, Page, Pill, Textarea } from "@/components/admin/ui";

/**
 * One collection: its name and link, its pieces in order, and a preview of
 * what a visitor will see. Nothing is public until "Live" is switched on.
 */
type Collection = { id: string; slug: string; name: string; description: string | null; is_published: boolean; product_ids: string[]; preview?: { products: Product[] } | null };
type Product = { id: string; name: string; base_price: number; is_active: boolean; media?: { cdn_url?: string | null; url: string }[]; variants?: { stock: number; size: string | null; is_active: boolean }[] };

const rs = (p: number) => `₹${Math.round(p / 100).toLocaleString("en-IN")}`;
const errorText = (e: unknown, fallback: string) => {
  const d = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof d === "string" ? d : fallback;
};
const thumb = (p?: Product) => p?.media?.[0]?.cdn_url ?? p?.media?.[0]?.url ?? null;

export default function CollectionEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const col = useQuery<Collection>({ queryKey: ["admin", "collection", id], queryFn: async () => (await adminApi.get(`/collections/${id}`)).data });
  const products = useQuery<Product[]>({ queryKey: ["admin", "products"], queryFn: async () => (await adminApi.get("/products/?include_inactive=true&limit=200")).data });

  const [form, setForm] = useState<{ name: string; slug: string; description: string; is_published: boolean; ids: string[] } | null>(null);
  useEffect(() => {
    if (col.data && !form) setForm({ name: col.data.name, slug: col.data.slug, description: col.data.description ?? "", is_published: col.data.is_published, ids: col.data.product_ids });
  }, [col.data, form]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // The product list first; the collection's own preview fills any piece the
  // list does not carry, so a name never reads as missing when it is not.
  const byId = useMemo(() => new Map([...(col.data?.preview?.products ?? []), ...(products.data ?? [])].map((p) => [p.id, p])), [products.data, col.data]);
  const save = useMutation({
    mutationFn: () => adminApi.put(`/collections/${id}`, { name: form!.name.trim(), slug: form!.slug.trim(), description: form!.description, is_published: form!.is_published, product_ids: form!.ids }),
    onSuccess: (r) => { setMsg("Saved."); qc.setQueryData(["admin", "collection", id], r.data); qc.invalidateQueries({ queryKey: ["admin", "collections"] }); setForm((f) => f && { ...f, slug: r.data.slug }); },
    onError: (e) => setMsg(errorText(e, "Could not save.")),
  });
  const remove = useMutation({
    mutationFn: () => adminApi.delete(`/collections/${id}`),
    onSuccess: () => router.push("/admin/collections"),
  });

  if (!form) return <Page title="Collection"><div className="h-24 bg-gray-100 rounded-xl animate-pulse" /></Page>;
  const link = `https://zisun.in/collections/${col.data?.slug ?? form.slug}`;
  const set = (patch: Partial<typeof form>) => { setMsg(null); setForm({ ...form, ...patch }); };
  const move = (i: number, d: -1 | 1) => { const ids = [...form.ids]; const j = i + d; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; set({ ids }); };
  // Added pieces stay in this list with "✓ Added" - moving them to the list
  // above put them off screen on a phone, and the tap read as doing nothing.
  const choosable = (products.data ?? []).filter((p) => p.is_active !== false && p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const dirty = !!col.data && (form.name !== col.data.name || form.slug !== col.data.slug || form.description !== (col.data.description ?? "") || form.is_published !== col.data.is_published || form.ids.join() !== col.data.product_ids.join());

  return (
    <Page title={form.name || "Collection"} description="Pick the pieces, put them in order, switch it on.">
      <Card className="mb-3">
        <div className="space-y-3">
          <Field label={<>Name <span className="text-red-500">*</span></>}><Input value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Link" hint="Lower-case letters, numbers and dashes. Changing it breaks links already shared.">
            <div className="flex items-center gap-1"><span className="text-sm text-gray-500 shrink-0">/collections/</span><Input value={form.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase() })} /></div>
          </Field>
          <Field label="A line under the name" hint="Optional."><Textarea rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="Three pieces Riya wore this week." /></Field>
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-700">Live <span className="text-xs text-gray-500">— anyone with the link can see it</span></span>
            <input type="checkbox" className="h-5 w-5" checked={form.is_published} onChange={(e) => set({ is_published: e.target.checked })} />
          </label>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button variant="primary" disabled={!dirty || !form.name.trim() || form.ids.length === 0 || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</Button>
            <Button onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}><Copy className="w-4 h-4" /> {copied ? "Copied" : "Copy link"}</Button>
            <Pill tone={col.data?.is_published ? "good" : "neutral"}>{col.data?.is_published ? "Live" : "Draft"}</Pill>
          </div>
          {form.ids.length === 0 && <p className="text-xs text-amber-700">Add at least one piece below to save.</p>}
          {msg && <p className="text-xs text-gray-600">{msg}</p>}
          <p className="text-[11px] text-gray-500 break-all">{link}</p>
        </div>
      </Card>

      <Card className="mb-3">
        <CardHeader title={`In this collection (${form.ids.length})`} meta="The order here is the order on the page." />
        <ul className="divide-y divide-gray-100">
          {form.ids.map((pid, i) => {
            const p = byId.get(pid);
            return (
              <li key={pid} className="py-2 flex items-center gap-3">
                <span className="w-10 h-12 rounded bg-gray-100 overflow-hidden shrink-0">{thumb(p) && <img src={thumb(p)!} alt="" className="w-full h-full object-cover" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-gray-900 truncate">{p?.name ?? "A piece no longer in the catalogue"}</span>
                  <span className="block text-xs text-gray-500">{p ? rs(p.base_price) : ""}{p && !p.is_active ? " · hidden from the shop" : ""}</span>
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  <Button size="sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="w-4 h-4" /></Button>
                  <Button size="sm" aria-label="Move down" disabled={i === form.ids.length - 1} onClick={() => move(i, 1)}><ArrowDown className="w-4 h-4" /></Button>
                  <Button size="sm" aria-label="Remove" onClick={() => set({ ids: form.ids.filter((x) => x !== pid) })}><X className="w-4 h-4" /></Button>
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="mb-3">
        <CardHeader title="Add pieces" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your pieces" className="mb-2" />
        <p className="mb-1 text-xs font-medium text-gray-700" aria-live="polite">{form.ids.length === 0 ? "No pieces picked yet." : `${form.ids.length} ${form.ids.length === 1 ? "piece" : "pieces"} picked - remember to Save`}</p>
        <ul className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
          {choosable.map((p) => (
            <li key={p.id} className="py-2 flex items-center gap-3">
              <span className="w-10 h-12 rounded bg-gray-100 overflow-hidden shrink-0">{thumb(p) && <img src={thumb(p)!} alt="" className="w-full h-full object-cover" />}</span>
              <span className="min-w-0 flex-1"><span className="block text-sm text-gray-900 truncate">{p.name}</span><span className="block text-xs text-gray-500">{rs(p.base_price)}</span></span>
              {form.ids.includes(p.id)
                ? <Button size="sm" variant="primary" aria-pressed onClick={() => set({ ids: form.ids.filter((x) => x !== p.id) })}>✓ Added</Button>
                : <Button size="sm" onClick={() => set({ ids: [...form.ids, p.id] })}>Add</Button>}
            </li>
          ))}
          {choosable.length === 0 && <li className="py-3 text-sm text-gray-500">{products.isLoading ? "Loading…" : "No piece matches."}</li>}
        </ul>
      </Card>

      <Card className="mb-3">
        <CardHeader title="Preview" meta="Photograph, name, price - each opens the piece. Saved or not." />
        <ul className="flex flex-wrap -mx-1.5">
          {form.ids.map((pid) => {
            const p = byId.get(pid);
            if (!p) return null;
            return (
              <li key={pid} className="w-1/2 sm:w-1/3 px-1.5 mb-3">
                <span className="block aspect-[4/5] rounded-lg bg-gray-100 overflow-hidden">{thumb(p) && <img src={thumb(p)!} alt="" className="w-full h-full object-cover object-top" />}</span>
                <span className="block mt-1.5 text-xs text-gray-900 line-clamp-2">{p.name}</span>
                <span className="block text-xs font-medium text-gray-900">{rs(p.base_price)}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Button variant="danger" onClick={() => { if (confirm("Delete this collection? Its link will stop working; influencers pointed at it will land on the home page.")) remove.mutate(); }}>Delete collection</Button>
    </Page>
  );
}
