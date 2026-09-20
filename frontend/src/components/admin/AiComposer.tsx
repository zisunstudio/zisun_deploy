"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Sparkles, Wand2 } from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import { PALETTE_NAMES, SIZE_PRESETS } from "@/lib/colours";

/**
 * "Say the product, get the form."
 *
 * The founder describes a piece the way she would to a friend — typed, or
 * spoken into the phone — and Claude fills the listing form from it. The
 * speech part is the browser's own recogniser (Chrome, Android, Safari on a
 * phone), so it costs nothing and needs no key; only the drafting step calls
 * the model, and only when she presses the button.
 *
 * Nothing is saved here. The result lands in the same form she would have
 * typed into, with a note of what she did not mention, and Create is still
 * her click.
 */
export interface AiDraft {
  name: string;
  description: string;
  base_price_rupees?: number | null;
  compare_at_rupees?: number | null;
  category?: string | null;
  colours: string[];
  sizes: string[];
  stock_per_variant?: number | null;
  fabric_composition?: string | null;
  weave?: string | null;
  fabric_gsm?: number | null;
  wash_care?: string | null;
  has_pockets?: boolean | null;
  print_type?: string | null;
  pattern?: string | null;
  neck_type?: string | null;
  sleeve_type?: string | null;
  sleeve_attached?: boolean | null;
  dupatta_included?: boolean | null;
  missing: string[];
}

interface Props {
  onDraft: (draft: AiDraft, categoryId: string | null) => void;
}

type Recogniser = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: ((e: any) => void) | null;
  start: () => void; stop: () => void;
};

function makeRecogniser(): Recogniser | null {
  if (typeof window === "undefined") return null;
  const Ctor = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
  if (!Ctor) return null;
  const r: Recogniser = new Ctor();
  r.lang = "en-IN";
  r.continuous = true;
  r.interimResults = true;
  return r;
}

export default function AiComposer({ onDraft }: Props) {
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [canListen, setCanListen] = useState(false);
  const rec = useRef<Recogniser | null>(null);

  useEffect(() => {
    setCanListen(Boolean((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition));
    adminApi.get("/ai/status").then((r) => setAvailable(Boolean(r.data?.available))).catch(() => setAvailable(false));
    return () => { rec.current?.stop(); };
  }, []);

  function toggleListening() {
    if (listening) { rec.current?.stop(); return; }
    const r = makeRecogniser();
    if (!r) { setNote("This browser cannot listen. Chrome on Android or desktop can."); return; }
    r.onresult = (e: any) => {
      let finalText = "", interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += chunk + " "; else interimText += chunk;
      }
      if (finalText) setText((t) => (t + " " + finalText).replace(/\s+/g, " ").trimStart());
      setInterim(interimText);
    };
    r.onerror = (e: any) => { setNote(e?.error === "not-allowed" ? "Microphone permission was refused." : "Listening stopped."); setListening(false); };
    r.onend = () => { setListening(false); setInterim(""); };
    rec.current = r;
    setNote(null);
    r.start();
    setListening(true);
  }

  async function draft() {
    const brief = text.trim();
    if (brief.length < 3) return;
    setBusy(true); setNote(null);
    try {
      const res = await adminApi.post("/ai/product-draft", { text: brief, palette: PALETTE_NAMES, sizes: SIZE_PRESETS });
      onDraft(res.data.draft as AiDraft, res.data.category_id ?? null);
      const missing: string[] = res.data.draft?.missing ?? [];
      setNote(missing.length ? `Filled in. Still needed: ${missing.join(", ")}.` : "Filled in — check it over and press Create.");
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setNote(e?.response?.status === 503
        ? `AI is unavailable: ${detail ?? "ANTHROPIC_API_KEY is not set"}.`
        : (detail ?? "Could not draft the listing right now."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-ink/15 bg-gradient-to-br from-rose to-white p-4 sm:p-5" aria-labelledby="ai-composer-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="ai-composer-heading" className="text-sm font-semibold text-gray-900 inline-flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-rani" /> Say the product
          </h2>
          <p className="text-xs text-gray-600 mt-0.5">
            Talk or type — colours, sizes, price, fabric, stock, anything. The form below fills itself; you check it and press Create.
          </p>
        </div>
        {available === false && <span className="text-[11px] text-amber-700 whitespace-nowrap">AI key not set</span>}
      </div>
      <div className="mt-3 relative">
        <textarea
          value={text + (interim ? (text ? " " : "") + interim : "")}
          onChange={(e) => { setInterim(""); setText(e.target.value); }}
          rows={3}
          placeholder="e.g. Mangalgiri cotton kurti, A-line, three-quarter sleeves, in rani pink, mustard and indigo, sizes S to XL, 1,499 rupees, five of each, machine wash cold"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-ink/30 resize-none"
        />
        {canListen && (
          <button
            type="button"
            onClick={toggleListening}
            aria-pressed={listening}
            aria-label={listening ? "Stop listening" : "Speak the product"}
            className={`absolute right-2 top-2 w-9 h-9 rounded-full flex items-center justify-center transition-colors ${listening ? "bg-rani text-white animate-pulse" : "bg-ink text-white hover:bg-ink/90"}`}
          >
            {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={draft}
          disabled={busy || text.trim().length < 3}
          className="inline-flex items-center gap-1.5 bg-ink text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
        >
          <Wand2 className="w-4 h-4" /> {busy ? "Drafting…" : "Fill the form"}
        </button>
        {listening && <span className="text-xs text-rani font-medium">Listening… tap the mic to stop</span>}
        {note && <span className="text-xs text-gray-700">{note}</span>}
      </div>
    </section>
  );
}
