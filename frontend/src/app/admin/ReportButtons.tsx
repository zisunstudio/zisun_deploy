"use client";

import { useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/admin/ui";
import { buildReport, type ReportInput } from "@/lib/report/build";
import { reportToMarkdown } from "@/lib/report/markdown";

/**
 * Take the board away with her.
 *
 * Two files, made in the browser from the numbers already on screen (no
 * second request, and the range filter above decides the period):
 *
 *  - a PDF, to send to a person;
 *  - a .md file written as a ready-made brief for an AI assistant - she
 *    attaches it to ChatGPT, Claude or Gemini and asks her question.
 *
 * Neither holds a customer's name, number or address; the board is
 * aggregates only.
 */
function save(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function ReportButtons({ data }: { data: ReportInput | undefined }) {
  const [busy, setBusy] = useState<"pdf" | "md" | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!data) return null;
  const name = (r: { stamp: string; days: number }, ext: string) => `zisun-report-${r.stamp}-${r.days}-days.${ext}`;

  async function pdf() {
    setBusy("pdf"); setError(null);
    try {
      const r = buildReport(data!);
      const { reportToPdf } = await import("@/lib/report/pdf");
      save(name(r, "pdf"), await reportToPdf(r));
    } catch { setError("Could not make the PDF. Try again."); }
    finally { setBusy(null); }
  }
  function md() {
    setBusy("md"); setError(null);
    try {
      const r = buildReport(data!);
      save(name(r, "md"), new Blob([reportToMarkdown(r)], { type: "text/markdown;charset=utf-8" }));
    } catch { setError("Could not make the file. Try again."); }
    finally { setBusy(null); }
  }

  return (
    <div className="flex flex-col gap-1.5 sm:items-end">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={pdf} disabled={busy !== null}>
          {busy === "pdf" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} PDF
        </Button>
        <Button size="sm" onClick={md} disabled={busy !== null} title="A file to give to ChatGPT, Claude or Gemini">
          <FileText className="w-3.5 h-3.5" /> File for AI
        </Button>
      </div>
      <p className="text-[11px] text-gray-500 max-w-[36ch] sm:text-right">
        PDF to send to a person. File for AI to attach to ChatGPT, Claude or Gemini and ask a question.
      </p>
      {error && <p role="alert" className="text-[11px] text-red-700">{error}</p>}
    </div>
  );
}
