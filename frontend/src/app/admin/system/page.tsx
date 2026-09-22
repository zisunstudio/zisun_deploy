"use client";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { adminApi } from "@/lib/adminApi";
import { API_ORIGIN } from "@/lib/apiBase";
import { Page, Card, Pill } from "@/components/admin/ui";
import { HAS_WHATSAPP, BROWSE_ONLY } from "@/lib/launchMode";
import type { Truth } from "@/lib/truth";

/**
 * The machinery, on one page, so it never has to appear on the board.
 * "Claude has no credits" is a fact about a provider, not about the shop,
 * and the founder's brief is not the place to read it.
 */
type Health = { status: string; launch_mode: string; checkout_enabled: boolean; components: Record<string, string> };
type AI = { available: boolean; model: string | null };
type Brief = { facts?: { system?: { ai_note?: string | null } } };

function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "good" | "warn" | "bad" | "neutral" }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm text-gray-900 text-right">{tone ? <Pill tone={tone}>{value}</Pill> : value}</span>
    </div>
  );
}

export default function AdminSystemPage() {
  const health = useQuery<Health>({ queryKey: ["system", "health"], queryFn: async () => (await axios.get(`${API_ORIGIN}/health`)).data, retry: 1 });
  const ai = useQuery<AI>({ queryKey: ["admin", "ai", "status"], queryFn: async () => (await adminApi.get("/ai/status")).data, retry: 1 });
  const brief = useQuery<Brief>({ queryKey: ["admin", "dashboard", "brief"], queryFn: async () => (await adminApi.get("/dashboard/brief")).data, staleTime: 15 * 60_000, retry: 1 });
  const h = health.data; const comp = h?.components ?? {};
  const ok = (v?: string) => (v ? (v.startsWith("ok") ? "good" : v.startsWith("not probed") ? "neutral" : "bad") : "neutral");
  const aiNote = brief.data?.facts?.system?.ai_note ?? null;
  const truth = useQuery<Truth>({ queryKey: ["catalog", "truth"], queryFn: async () => (await axios.get(`${API_ORIGIN}/api/v1/catalog/truth`)).data, retry: 1 });
  const tr = truth.data;
  return (
    <Page title="System" description="How the machinery is doing. Nothing here is about the shop's performance.">
      {/* The site's brand claims are computed from the pieces (services/
          truth.py). This card shows which claims the catalogue currently
          earns, and the one fact per piece that would unlock more. */}
      <Card className="mb-3">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">What the site is allowed to say</h2>
        <p className="text-xs text-gray-500 mb-3">Computed from your {tr?.pieces ?? "…"} live pieces. The home page says a fabric, a place or &ldquo;never re-run&rdquo; only when every piece records it.</p>
        {tr && (tr.claims.filter((c) => c.pieces === c.of).length ? (
          <ul className="space-y-1.5 mb-3">
            {tr.claims.filter((c) => c.pieces === c.of).map((c) => (
              <li key={c.key} className="flex items-center gap-2 text-sm text-gray-800"><Pill tone="good">said</Pill>{c.text}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-800 mb-3">Nothing about the cloth yet &mdash; the site says only &ldquo;kurtas and co-ord sets, chosen by Sushmita in Bengaluru&rdquo;.</p>
        ))}
        {tr && tr.claims.filter((c) => c.pieces < c.of).map((c) => (
          <p key={c.key} className="text-xs text-gray-500">Not said: &ldquo;{c.text}&rdquo; &mdash; true of {c.pieces} of {c.of} pieces, so the site stays quiet.</p>
        ))}
        {tr && tr.missing.length > 0 && (
          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5">
            <p className="text-xs font-semibold text-amber-800 mb-1">To say more, record on each piece (Edit &rarr; How and where it was made):</p>
            <ul className="text-xs text-amber-800 list-disc pl-4 space-y-0.5">{tr.missing.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        )}
      </Card>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Shop</h2>
          <Row label="Mode" value={h ? (h.launch_mode === "browse" ? "Browse - orders over WhatsApp" : "Live - checkout open") : "…"} />
          <Row label="Checkout" value={h ? (h.checkout_enabled ? "Open" : "Closed") : "…"} tone={h ? (h.checkout_enabled ? "good" : "neutral") : undefined} />
          <Row label="WhatsApp number" value={HAS_WHATSAPP ? "Set" : "Not set"} tone={HAS_WHATSAPP ? "good" : "bad"} />
          <Row label="Stock on the storefront" value={BROWSE_ONLY ? "Hidden (browse mode)" : "Shown"} />
        </Card>
        <Card>
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Services</h2>
          <Row label="API" value={health.isError ? "Unreachable" : h ? h.status : "…"} tone={health.isError ? "bad" : h ? (h.status === "ok" ? "good" : "warn") : undefined} />
          <Row label="Database" value={comp.database ?? "…"} tone={ok(comp.database)} />
          <Row label="Redis" value={comp.redis ?? "…"} tone={ok(comp.redis)} />
          <Row label="Background jobs" value={comp.celery ?? "…"} tone={ok(comp.celery)} />
        </Card>
        <Card>
          <h2 className="text-sm font-semibold text-gray-900 mb-1">AI</h2>
          <Row label="Provider" value="Anthropic (Claude)" />
          <Row label="Status" value={ai.isError ? "Unknown" : ai.data ? (ai.data.available ? "Configured" : "Key not set") : "…"} tone={ai.data ? (ai.data.available ? "good" : "bad") : undefined} />
          {ai.data?.model && <Row label="Model" value={ai.data.model} />}
          {aiNote && <Row label="Last attempt" value={aiNote} tone="warn" />}
          <p className="mt-3 text-xs text-gray-500">Used only from this console: drafting a listing, rewriting a description, and the morning brief. When it is unavailable, the brief is written from rules instead.</p>
        </Card>
      </div>
    </Page>
  );
}
