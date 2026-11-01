"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminApi";
import { Button, Card, EmptyState, Field, Input, Page, Pill } from "@/components/admin/ui";

/**
 * Collections: a hand-picked set of pieces with one link, for a campaign or
 * an influencer's post. Make one here, then pick the pieces on its page.
 */
type Collection = { id: string; slug: string; name: string; is_published: boolean; product_ids: string[] };

const errorText = (e: unknown, fallback: string) => {
  const d = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof d === "string" ? d : fallback;
};

export default function CollectionsPage() {
  const router = useRouter();
  const { data, isLoading } = useQuery<Collection[]>({ queryKey: ["admin", "collections"], queryFn: async () => (await adminApi.get("/collections")).data });
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => adminApi.post("/collections", { name: name.trim() }),
    onSuccess: (r) => router.push(`/admin/collections/${r.data.id}`),
    onError: (e) => setMsg(errorText(e, "Could not make that collection.")),
  });
  const rows = data ?? [];
  return (
    <Page title="Collections" description="A set of pieces with one link - for an influencer, a festival, a campaign.">
      <Card className="mb-4">
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(); }}>
          <Field label={<>Name <span className="text-red-500">*</span></>} className="flex-1 min-w-[200px]">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Riya's Diwali edit" />
          </Field>
          <Button variant="primary" type="submit" disabled={!name.trim() || create.isPending}>{create.isPending ? "Making…" : "New collection"}</Button>
        </form>
        {msg && <p className="mt-2 text-xs text-red-700">{msg}</p>}
      </Card>
      {isLoading ? <div className="h-16 bg-gray-100 rounded-xl animate-pulse" /> : rows.length === 0 ? (
        <Card><EmptyState title="No collections yet" body="Name one above, then pick its pieces." /></Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li key={c.id}>
              <Card>
                <button type="button" onClick={() => router.push(`/admin/collections/${c.id}`)} className="w-full text-left flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-semibold text-gray-900 truncate">{c.name}</span>
                    <span className="block text-xs text-gray-500 truncate">zisun.in/collections/{c.slug} · {c.product_ids.length} {c.product_ids.length === 1 ? "piece" : "pieces"}</span>
                  </span>
                  <Pill tone={c.is_published ? "good" : "neutral"}>{c.is_published ? "Live" : "Draft"}</Pill>
                </button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
