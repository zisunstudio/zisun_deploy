"use client";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { adminApi } from "@/lib/adminApi";
import { API_ORIGIN } from "@/lib/apiBase";
import { Page, Card, Pill } from "@/components/admin/ui";
import { HAS_WHATSAPP, HAS_WHATSAPP_GROUP, BROWSE_ONLY } from "@/lib/launchMode";

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
  return (
    <Page title="System" description="How the machinery is doing. Nothing here is about the shop's performance.">
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Shop</h2>
          <Row label="Mode" value={h ? (h.launch_mode === "browse" ? "Browse - orders over WhatsApp" : "Live - checkout open") : "…"} />
          <Row label="Checkout" value={h ? (h.checkout_enabled ? "Open" : "Closed") : "…"} tone={h ? (h.checkout_enabled ? "good" : "neutral") : undefined} />
          <Row label="WhatsApp number" value={HAS_WHATSAPP ? "Set" : "Not set"} tone={HAS_WHATSAPP ? "good" : "bad"} />
          <Row label="ZISUN Tales group" value={HAS_WHATSAPP_GROUP ? "Linked" : "Not linked"} tone={HAS_WHATSAPP_GROUP ? "good" : "neutral"} />
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
