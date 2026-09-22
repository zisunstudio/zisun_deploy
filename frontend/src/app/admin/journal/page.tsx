"use client";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminApi";
import { Page, Card, CardHeader, Button, Pill } from "@/components/admin/ui";
import { KIND_LABEL, type ArticleKind } from "@/lib/journal";
import { useProducts } from "@/lib/queries/catalog";

/**
 * The Journal, from the founder's phone.
 *
 * The pipeline, in the order she works: an idea (from what people actually
 * searched for, or from what the catalogue can honestly answer) → a brief in
 * her own words → a draft Claude writes from ONLY the facts recorded against
 * the pieces → her edit → approve → publish. Nothing is published by a
 * machine: "Published" is a button she presses.
 *
 * The draft returns `unknowns` - the facts it wanted and did not have. Those
 * are shown as a list, because each one is either a field to fill in on the
 * piece or a sentence the article must not contain.
 */
interface Article {
  id: string; slug: string; title: string; dek: string | null; kind: ArticleKind;
  body_md: string; status: "draft" | "approved" | "published"; product_ids: string[];
  cover_url: string | null; meta_title: string | null; meta_description: string | null;
  brief: string | null; search_intent: string | null; published_at: string | null; updated_at: string;
}
interface Ideas {
  searches: Array<{ query: string; times: number; found_nothing: boolean }>;
  suggestions: Array<{ kind: ArticleKind; title: string; why: string }>;
}

const KINDS: ArticleKind[] = ["style", "fabric", "occasion", "fit", "care", "founder", "collection", "explainer"];
const EMPTY: Omit<Article, "id" | "slug" | "published_at" | "updated_at"> = {
  title: "", dek: "", kind: "style", body_md: "", status: "draft", product_ids: [],
  cover_url: "", meta_title: "", meta_description: "", brief: "", search_intent: "",
};

export default function AdminJournalPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Article | null>(null);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [unknowns, setUnknowns] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const articles = useQuery<Article[]>({ queryKey: ["admin", "journal"], queryFn: async () => (await adminApi.get("/journal")).data });
  const ideas = useQuery<Ideas>({ queryKey: ["admin", "journal", "ideas"], queryFn: async () => (await adminApi.get("/journal/ideas")).data });
  const { data: products } = useProducts({ limit: 60 });
  const pieces = useMemo(() => products?.items ?? [], [products]);

  const say = (e: unknown) => {
    const d = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
    setError(typeof d === "string" ? d : Array.isArray(d) ? d.map((x: { msg?: string }) => x.msg ?? "").join("; ") : "Something went wrong.");
  };

  const save = useMutation({
    mutationFn: async (data: typeof EMPTY) =>
      editing ? (await adminApi.put(`/journal/${editing.id}`, data)).data : (await adminApi.post("/journal", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "journal"] }); setEditing(null); setForm(EMPTY); setUnknowns([]); setError(null); },
    onError: say,
  });

  const draft = useMutation({
    mutationFn: async () => (await adminApi.post("/journal/draft", { brief: form.brief, kind: form.kind, product_ids: form.product_ids })).data,
    onSuccess: (d: { title: string; dek: string; body_md: string; meta_title: string; meta_description: string; search_intent: string; unknowns: string[] }) => {
      setForm((f) => ({ ...f, title: d.title, dek: d.dek, body_md: d.body_md, meta_title: d.meta_title, meta_description: d.meta_description, search_intent: d.search_intent }));
      setUnknowns(d.unknowns ?? []); setError(null);
    },
    onError: say,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await adminApi.delete(`/journal/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "journal"] }),
    onError: say,
  });

  const open = (a: Article) => {
    setEditing(a);
    setForm({ title: a.title, dek: a.dek ?? "", kind: a.kind, body_md: a.body_md, status: a.status, product_ids: a.product_ids ?? [],
      cover_url: a.cover_url ?? "", meta_title: a.meta_title ?? "", meta_description: a.meta_description ?? "", brief: a.brief ?? "", search_intent: a.search_intent ?? "" });
    setUnknowns([]); setError(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const field = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const input = "w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-ink/30";

  return (
    <Page title="Journal" description="What we know about the cloth, written for people who have not heard of us yet.">
      {error && <div className="mb-3 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-800">{error}</div>}

      <Card className="mb-3">
        <CardHeader title={editing ? `Editing: ${editing.title}` : "Write something"} actions={editing ? <Button variant="ghost" onClick={() => { setEditing(null); setForm(EMPTY); setUnknowns([]); }}>New instead</Button> : undefined} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">What should it say? (your words)</label>
            <textarea rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[15px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-ink/30"
              placeholder="A guide to washing dabu cotton so the print stays. Mention that the first wash bleeds and that is normal."
              value={form.brief ?? ""} onChange={field("brief")} />
            <p className="text-[11px] text-gray-500 mt-1">Claude writes from this and from the recorded facts of the pieces you tick. It is told to say what it does not know instead of inventing it.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kind</label>
            <select className={`${input} bg-white`} value={form.kind} onChange={field("kind")}>
              {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select className={`${input} bg-white`} value={form.status} onChange={field("status")}>
              <option value="draft">Draft &mdash; only you see it</option>
              <option value="approved">Approved &mdash; ready, still hidden</option>
              <option value="published">Published &mdash; live on the site</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Pieces it may recommend</label>
            <div className="flex flex-wrap gap-2">
              {pieces.map((p) => {
                const on = form.product_ids.includes(p.id);
                return (
                  <button key={p.id} type="button"
                    onClick={() => setForm({ ...form, product_ids: on ? form.product_ids.filter((i) => i !== p.id) : [...form.product_ids, p.id] })}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${on ? "bg-ink border-ink text-white" : "bg-white border-gray-300 text-gray-700"}`}>
                    {p.name.length > 36 ? p.name.slice(0, 35) + "…" : p.name}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-500 mt-1.5">Their price and stock are read live on the article page &mdash; never written into the text.</p>
          </div>

          <div className="sm:col-span-2">
            <Button variant="primary" disabled={!form.brief || draft.isPending} onClick={() => draft.mutate()}>
              {draft.isPending ? "Writing…" : "Write a draft"}
            </Button>
          </div>
        </div>

        {unknowns.length > 0 && (
          <div className="mt-4 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5">
            <p className="text-xs font-semibold text-amber-800 mb-1">It did not have these facts, so it did not claim them:</p>
            <ul className="text-xs text-amber-800 list-disc pl-4 space-y-0.5">{unknowns.map((u) => <li key={u}>{u}</li>)}</ul>
          </div>
        )}

        <div className="mt-5 grid gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input className={input} value={form.title} onChange={field("title")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">One line under the title</label>
            <input className={input} value={form.dek ?? ""} onChange={field("dek")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">The article</label>
            <textarea rows={16} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[15px] sm:text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-ink/30"
              value={form.body_md} onChange={field("body_md")} placeholder="## A heading&#10;&#10;Your words. **bold**, *italic*, - lists, [links](/shop)." />
            <p className="text-[11px] text-gray-500 mt-1">Your edit wins. Headings with ##, lists with -, links with [text](/shop).</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cover photograph (URL)</label>
              <input className={input} value={form.cover_url ?? ""} onChange={field("cover_url")} placeholder="https://…" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">The question it answers</label>
              <input className={input} value={form.search_intent ?? ""} onChange={field("search_intent")} placeholder="how to wash dabu cotton" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Google title</label>
              <input className={input} value={form.meta_title ?? ""} onChange={field("meta_title")} maxLength={60} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Google description</label>
              <input className={input} value={form.meta_description ?? ""} onChange={field("meta_description")} maxLength={155} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={!form.title || save.isPending} onClick={() => save.mutate(form)}>
              {save.isPending ? "Saving…" : editing ? "Save" : "Create"}
            </Button>
            {editing && <Button variant="ghost" onClick={() => { setEditing(null); setForm(EMPTY); setUnknowns([]); }}>Cancel</Button>}
          </div>
        </div>
      </Card>

      <Card className="mb-3">
        <CardHeader title="Everything written" meta={articles.data ? `${articles.data.length}` : undefined} />
        {articles.isLoading ? <p className="text-sm text-gray-500">Loading…</p>
          : !articles.data?.length ? <p className="text-sm text-gray-500">Nothing yet.</p>
          : (
            <ul className="divide-y divide-gray-100">
              {articles.data.map((a) => (
                <li key={a.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Pill tone={a.status === "published" ? "good" : a.status === "approved" ? "warn" : "neutral"}>{a.status}</Pill>
                      <span className="text-xs text-gray-500">{KIND_LABEL[a.kind] ?? a.kind}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 mt-1 break-words">{a.title}</p>
                    {a.status === "published" && <a href={`/journal/${a.slug}`} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 underline underline-offset-2">/journal/{a.slug}</a>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" onClick={() => open(a)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete "${a.title}"? This cannot be undone.`)) remove.mutate(a.id); }}>Delete</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </Card>

      <Card>
        <CardHeader title="What to write about" meta="from your own shop" />
        {ideas.data?.searches.length ? (
          <>
            <p className="text-xs text-gray-500 mb-2">People searched the shop for these. The red ones found nothing &mdash; those are questions the site could not answer.</p>
            <div className="flex flex-wrap gap-2 mb-5">
              {ideas.data.searches.slice(0, 16).map((s) => (
                <span key={s.query} className={`px-2.5 py-1 rounded-full text-xs border ${s.found_nothing ? "bg-red-50 border-red-100 text-red-800" : "bg-gray-50 border-gray-200 text-gray-700"}`}>
                  {s.query} <span className="opacity-60">×{s.times}</span>
                </span>
              ))}
            </div>
          </>
        ) : <p className="text-xs text-gray-500 mb-4">No one has searched the shop yet. These come from your catalogue instead.</p>}

        <ul className="divide-y divide-gray-100">
          {(ideas.data?.suggestions ?? []).map((s) => (
            <li key={s.title} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-gray-900 break-words">{s.title}</p>
                <p className="text-[11px] text-gray-500">{s.why}</p>
              </div>
              <Button size="sm" onClick={() => { setEditing(null); setForm({ ...EMPTY, kind: s.kind, title: s.title, brief: s.title }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Use this</Button>
            </li>
          ))}
        </ul>
      </Card>
    </Page>
  );
}
