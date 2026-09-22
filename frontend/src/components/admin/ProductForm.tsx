"use client";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { SizeChart, StylingNote } from "@/lib/queries/catalog";
import StylingNotesEditor from "@/components/admin/StylingNotesEditor";
import SetPiecesEditor from "@/components/admin/SetPiecesEditor";
import SizeChartEditor from "@/components/admin/SizeChartEditor";
import { adminApi } from "@/lib/adminApi";
import { FOUNDER } from "@/lib/brand";
import { PALETTE, swatchStyle } from "@/lib/colours";

/** The price points this label sells at. Edit freely; it is a shortcut, not a rule. */
const PRICE_PRESETS = [799, 999, 1199, 1299, 1499, 1799, 1999, 2499];
const REFINE_TONES: Array<[string, string]> = [["Shorter", "make it shorter, under 60 words"], ["Warmer", "warmer and more personal, still plain"], ["More detail", "add the fabric, cut and care details in one more sentence"], ["Simpler", "simpler English, shorter sentences"]];

export interface ProductFormData {
  name: string;
  description: string;
  base_price_rupees: string; // user input in ₹, converted to paise on submit
  category_id: string;
  is_active: boolean;

  /**
   * Legal Metrology declarations. Optional: the API falls back to the
   * brand-level default. `dimensions` is kept in the shape for the API's
   * sake but no longer has a field — the size chart carries measurements.
   */
  dimensions: string;
  net_quantity: string;
  commodity_name: string;
  country_of_origin: string;
  manufacturer_name: string;
  manufacturer_address: string;
  /**
   * Fabric and care. All strings in the form, including gsm and pockets:
   * an empty input has to stay unknown, and a number or boolean field
   * cannot express that.
   */
  fabric_composition: string;
  fabric_gsm: string;
  weave: string;
  has_pockets: string;
  colourfastness: string;
  wash_care: string;
  /**
   * Garment attributes. Strings for the same reason as above — the two boolean
   * fields have to be able to say "nobody has recorded this yet", which a real
   * boolean cannot.
   */
  colour: string;
  print_type: string;
  pattern: string;
  neck_type: string;
  sleeve_type: string;
  sleeve_attached: string;
  dupatta_included: string;
  fit: string;
  garment_length: string;
  embroidery: string;
  bottom_type: string;
  occasion: string;
  /** The garments in the set, in order. Drives "what you get" and net quantity. */
  set_pieces: string[];
  /** The model in the photographs. */
  model_size: string;
  model_height: string;
  /** Sushmita is wearing it in the photographs. */
  worn_by_founder: boolean;
  /** One line about the woman the piece is named for. */
  named_for: string;
  /**
   * Offer. Rupees in the form, paise on the wire like base_price; empty means
   * no offer. offer_ends_at is a datetime-local string, or "" for open-ended.
   */
  compare_at_rupees: string;
  offer_ends_at: string;
  /** Per-product size chart; null uses the category chart on the storefront. */
  size_chart: SizeChart | null;
  /** Ways to wear it; empty hides the section on the product page. */
  styling_notes: StylingNote[];
}

interface Category {
  id: string;
  name: string;
  is_active: boolean;
}

interface Props {
  data: ProductFormData;
  onChange: (d: ProductFormData) => void;
  categories: Category[];
  /**
   * Create-page mode: everything past name, price, category and variants is
   * folded under a heading she opens when she has the information to hand.
   * The edit page shows it all open — that is where a listing gets completed.
   */
  compact?: boolean;
}

export function emptyProductForm(): ProductFormData {
  return {
    name: "", description: "", base_price_rupees: "", category_id: "", is_active: true,
    dimensions: "", net_quantity: "", commodity_name: "", country_of_origin: "",
    manufacturer_name: "", manufacturer_address: "",
    fabric_composition: "", fabric_gsm: "", weave: "",
    has_pockets: "", colourfastness: "", wash_care: "",
    colour: "", print_type: "", pattern: "", neck_type: "",
    sleeve_type: "", sleeve_attached: "", dupatta_included: "",
    fit: "", garment_length: "", embroidery: "", bottom_type: "", occasion: "", set_pieces: [],
    model_size: "", model_height: "", worn_by_founder: false, named_for: "",
    compare_at_rupees: "", offer_ends_at: "", size_chart: null, styling_notes: [],
  };
}

export function priceToPaise(rupees: string): number {
  const n = parseFloat(rupees);
  return isNaN(n) ? 0 : Math.round(n * 100);
}

export default function ProductForm({ data, onChange, categories, compact = false }: Props) {
  const [writing, setWriting] = useState(false);
  const [filling, setFilling] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  // The model only sees what is on the form. It cannot invent a fabric the
  // founder did not enter, which is the whole point of feeding it facts
  // rather than a name.
  async function writeDescription(tone?: string) {
    setWriting(true); setAiNote(null);
    try {
      const category = categories.find((c) => c.id === data.category_id)?.name ?? null;
      const res = await adminApi.post("/ai/describe", {
        name: data.name.trim(),
        facts: {
          category, price_rupees: data.base_price_rupees || null, colour: data.colour,
          fabric_composition: data.fabric_composition, weave: data.weave, fabric_gsm: data.fabric_gsm,
          wash_care: data.wash_care, has_pockets: data.has_pockets, print_type: data.print_type,
          pattern: data.pattern, neck_type: data.neck_type, sleeve_type: data.sleeve_type,
          sleeve_attached: data.sleeve_attached, dupatta_included: data.dupatta_included,
          existing_description: data.description || null,
        },
        tone: tone ?? null,
      });
      onChange({ ...data, description: res.data.description });
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setAiNote(e?.response?.status === 503 ? `AI is unavailable: ${detail ?? "ANTHROPIC_API_KEY is not set"}.` : (detail ?? "Could not write a description right now."));
    } finally {
      setWriting(false);
    }
  }
  /**
   * Read the description back and fill the detail sheet.
   *
   * The founder's note was that what she enters does not reach the product
   * page. Half of that was a read-back bug in the API; the other half is
   * that nobody fills fourteen fields by hand on a phone, so they stayed
   * empty. She has already written the sentence - this turns it into the
   * facts the page renders. Nothing is overwritten: only blanks are filled,
   * so a value she typed always wins over one the model suggested.
   */
  async function fillDetails() {
    setFilling(true); setAiNote(null);
    try {
      const res = await adminApi.post("/ai/attributes", {
        name: data.name.trim(),
        description: data.description || null,
        facts: {
          category: categories.find((c) => c.id === data.category_id)?.name ?? null,
          colour: data.colour, fabric_composition: data.fabric_composition, weave: data.weave,
          print_type: data.print_type, pattern: data.pattern, neck_type: data.neck_type,
          sleeve_type: data.sleeve_type, fit: data.fit, garment_length: data.garment_length,
          embroidery: data.embroidery, bottom_type: data.bottom_type, occasion: data.occasion,
          set_pieces: data.set_pieces,
        },
      });
      const a = res.data.attributes ?? {};
      const next: ProductFormData = { ...data };
      let added = 0;
      const keep = (k: keyof ProductFormData, v: unknown) => {
        if (v === null || v === undefined || v === "") return;
        if (String(next[k] ?? "").trim()) return; // hers wins
        (next[k] as unknown) = typeof v === "boolean" ? (v ? "yes" : "no") : String(v);
        added += 1;
      };
      (["colour","print_type","pattern","neck_type","sleeve_type","fit","garment_length","embroidery","bottom_type","occasion","sleeve_attached","dupatta_included","has_pockets"] as const)
        .forEach((k) => keep(k, (a as Record<string, unknown>)[k]));
      if (Array.isArray(a.set_pieces) && a.set_pieces.length && next.set_pieces.length === 0) {
        next.set_pieces = a.set_pieces.map(String);
        added += 1;
      }
      onChange(next);
      setAiNote(added
        ? `Filled ${added} empty field${added === 1 ? "" : "s"}. Check each one before saving.`
        : "Nothing to add — the description does not say more than you have already entered.");
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setAiNote(e?.response?.status === 503
        ? `AI is unavailable: ${detail ?? "ANTHROPIC_API_KEY is not set"}. Fill these in by hand.`
        : (typeof detail === "string" ? detail : "Could not read the description just now."));
    } finally {
      setFilling(false);
    }
  }

  const f = (key: keyof ProductFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => onChange({ ...data, [key]: e.target.value });

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Product name <span className="text-red-500">*</span>
        </label>
        <input
          className="w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-ink/30"
          placeholder="e.g. Meera — purple rose co-ord set"
          value={data.name}
          onChange={f("name")}
          required
        />
        {/* The tale. Shown under the name on the product page in italic. */}
        <input
          className="mt-2 w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-ink/30"
          placeholder="Named for… e.g. Meera, my grandmother, who wore cotton every day of her life."
          maxLength={160}
          value={data.named_for}
          onChange={f("named_for")}
        />
        <p className="text-[11px] text-gray-500 mt-1">Give each piece a woman&rsquo;s name, and say in one line who she is. Optional.</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-gray-700">Description</label>
          <button
            type="button"
            onClick={() => writeDescription()}
            disabled={writing || !data.name.trim()}
            title={data.name.trim() ? "Draft a description from the facts on this form" : "Give the product a name first"}
            className="inline-flex items-center gap-1 text-xs font-semibold text-ink disabled:opacity-40 hover:underline"
          >
            <Sparkles className="w-3.5 h-3.5" /> {writing ? "Writing…" : data.description ? "Rewrite with AI" : "Write with AI"}
          </button>
        </div>
        {aiNote && <p className="text-[11px] text-amber-700 mb-1">{aiNote}</p>}
        {data.description && (
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-gray-500">Refine:</span>
            {REFINE_TONES.map(([label, note]) => (
              <button key={label} type="button" disabled={writing} onClick={() => writeDescription(note)}
                className="rounded-full border border-gray-300 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700 hover:border-ink disabled:opacity-40">
                {label}
              </button>
            ))}
          </div>
        )}
        <textarea
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[15px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-ink/30 resize-none"
          rows={3}
          placeholder="Describe the product..."
          value={data.description}
          onChange={f("description")}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Base price (₹) <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-2 text-sm text-gray-500">₹</span>
            <input
              type="text"
              inputMode="numeric"
              className="w-full h-10 border border-gray-300 rounded-lg pl-7 pr-3 text-[15px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-ink/30"
              placeholder="1499"
              value={data.base_price_rupees}
              onChange={f("base_price_rupees")}
              required
            />
          </div>
          {/* The prices this label actually uses, one tap each. Typing is
              still there for anything else. */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PRICE_PRESETS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onChange({ ...data, base_price_rupees: String(r) })}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  Number(data.base_price_rupees) === r ? "border-ink bg-ink text-white" : "border-gray-300 bg-white text-gray-700 hover:border-ink"}`}
              >
                ₹{r.toLocaleString("en-IN")}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select
            className="w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ink/30"
            value={data.category_id}
            onChange={f("category_id")}
          >
            <option value="">— No category —</option>
            {categories.filter((c) => c.is_active).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Fabric and care.
          Above the statutory block because it is what the product page argues
          with. Every field here answers something 26 survey respondents named:
          quality doubt was the top reason they will not buy from a small brand,
          and colour bleeding, missing pockets, creasing and heat were the
          specific complaints. Blank stays blank — there is no brand default for
          a measurement, and inventing one puts an unchecked claim on a live
          page. */}
      <details open={!compact} className="group bg-white rounded-xl border border-gray-200">
        <summary className="cursor-pointer select-none list-none px-5 py-4 flex items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-semibold text-gray-900">Fabric &amp; care</span>
          <span className="text-xs text-gray-400 group-open:hidden">composition, weight, pockets, care</span>
          <span className="text-xs text-gray-400 hidden group-open:inline">optional</span>
        </summary>
        <div className="px-5 pb-5">
        <p className="text-xs text-gray-500 mt-0.5 mb-3">
          Shown open on the product page, above the legal declarations. Anything
          left blank is simply not shown — never guessed.
        </p>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fabric</label>
              <input
                className="w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-ink/30"
                placeholder="100% handloom cotton"
                value={data.fabric_composition}
                onChange={f("fabric_composition")}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Weight (GSM)</label>
              <input
                type="number" min="1" max="2000"
                className="w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-ink/30"
                placeholder="120"
                value={data.fabric_gsm}
                onChange={f("fabric_gsm")}
              />
              <p className="text-xs text-gray-400 mt-1">Under 130 reads as light and breathable.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Weave</label>
              <input
                className="w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-ink/30"
                placeholder="Plain handloom"
                value={data.weave}
                onChange={f("weave")}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pockets</label>
              <select
                className="w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ink/30"
                value={data.has_pockets}
                onChange={f("has_pockets")}
              >
                <option value="">— not recorded —</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">7 of 26 named this unprompted.</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Colourfastness</label>
            <input
              className="w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-ink/30"
              placeholder="Colourfast to 30 washes"
              value={data.colourfastness}
              onChange={f("colourfastness")}
            />
            <p className="text-xs text-gray-400 mt-1">
              Fading was the single most common complaint about ethnic wear people already own.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Wash care</label>
            <input
              className="w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-ink/30"
              placeholder="Cold machine wash, dry in shade"
              value={data.wash_care}
              onChange={f("wash_care")}
            />
          </div>
        </div>
        </div>
      </details>

      {/* Garment details.
          The seven questions the founder answers by hand in the WhatsApp group
          every day. Left blank, a field simply does not appear on the product
          page — there are no defaults here, because these are facts about one
          garment and a fallback would print a claim nobody checked. */}
      <details open={!compact} className="group bg-white rounded-xl border border-gray-200">
        <summary className="cursor-pointer select-none list-none px-5 py-4 flex items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-semibold text-gray-900">Product details</span>
          <span className="text-xs text-gray-400 group-open:hidden">colour, print, neck, sleeve, dupatta</span>
          <span className="text-xs text-gray-400 hidden group-open:inline">optional</span>
        </summary>
        <div className="px-5 pb-5">
        <p className="text-xs text-gray-400 mt-1 mb-3">
          Shown on the product page. Anything left blank is simply omitted.
        </p>
        <div className="mb-4">
          <button
            type="button" onClick={fillDetails} disabled={filling || !data.name.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" /> {filling ? "Reading…" : "Fill from the description"}
          </button>
          <p className="text-[11px] text-gray-500 mt-1.5">Reads what you already wrote and fills only the empty boxes. Yours are never overwritten.</p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Colour family</label>
              <span className="flex items-center gap-2">
                <span className="inline-block h-4 w-4 shrink-0 rounded-full border border-black/10" style={swatchStyle(data.colour)} />
                <select
                  className="w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ink/30"
                  value={data.colour}
                  onChange={f("colour")}
                >
                  <option value="">— not set —</option>
                  {data.colour && !PALETTE.some((c) => c.name === data.colour) && <option value={data.colour}>{data.colour}</option>}
                  {PALETTE.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </span>
              <p className="text-[11px] text-gray-500 mt-1">The main colour, for details and search. Each colour you sell is a variant below.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fit</label>
              <input className="w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-ink/30" placeholder="Relaxed" value={data.fit} onChange={f("fit")} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Length</label>
              <input className="w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-ink/30" placeholder="Calf length" value={data.garment_length} onChange={f("garment_length")} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Print</label>
              <input
                className="w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-ink/30"
                placeholder="Ajrakh block print"
                value={data.print_type}
                onChange={f("print_type")}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pattern</label>
              <input
                className="w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-ink/30"
                placeholder="Straight cut, side slits"
                value={data.pattern}
                onChange={f("pattern")}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Neck</label>
              <input
                className="w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-ink/30"
                placeholder="V-neck with piping"
                value={data.neck_type}
                onChange={f("neck_type")}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sleeve type</label>
              <input
                className="w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-ink/30"
                placeholder="Three-quarter"
                value={data.sleeve_type}
                onChange={f("sleeve_type")}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sleeve attached</label>
              <select
                className="w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ink/30"
                value={data.sleeve_attached}
                onChange={f("sleeve_attached")}
              >
                <option value="">— not recorded —</option>
                <option value="yes">Attached</option>
                <option value="no">Not attached</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Embroidery</label>
              <input className="w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-ink/30" placeholder="Hand-embroidered rose motif" value={data.embroidery} onChange={f("embroidery")} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bottom</label>
              <input className="w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-ink/30" placeholder="Palazzo" value={data.bottom_type} onChange={f("bottom_type")} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Wear it for</label>
              <input className="w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-ink/30" placeholder="Everyday and work" value={data.occasion} onChange={f("occasion")} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dupatta included</label>
              <select
                className="w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ink/30"
                value={data.dupatta_included}
                onChange={f("dupatta_included")}
              >
                <option value="">— not recorded —</option>
                <option value="yes">Included</option>
                <option value="no">Not included</option>
              </select>
            </div>
          </div>

          {/* What is in the set. This is the field that retires "net
              quantity: 5": the statutory declaration is derived from it, so
              nobody types a bare number into a legal box again, and the
              product page can finally say a co-ord set is two garments. */}
          <SetPiecesEditor value={data.set_pieces} onChange={(pieces) => onChange({ ...data, set_pieces: pieces })} />
        </div>
        </div>
      </details>

      {/* Offer.
          A markdown is base price (what they pay) plus the price it was —
          compare_at — shown struck through, with the percentage the API works
          out from the two. The timer is optional; with one, the badge and
          countdown switch themselves off at the deadline, so a sale nobody
          remembered to end cannot keep running on the live page. */}
      <details open={!compact} className="group bg-white rounded-xl border border-gray-200">
        <summary className="cursor-pointer select-none list-none px-5 py-4 flex items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-semibold text-gray-900">Offer</span>
          <span className="text-xs text-gray-400 group-open:hidden">was-price and an end time</span>
          <span className="text-xs text-gray-400 hidden group-open:inline">optional</span>
        </summary>
        <div className="px-5 pb-5">
        <p className="text-xs text-gray-400 mt-1 mb-4">
          Leave blank for no offer. The selling price stays the base price above; this is the price it is marked down <em>from</em>.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Was price (₹)</label>
            <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-ink/30">
              <span className="px-3 text-gray-500 text-sm">₹</span>
              <input type="number" inputMode="decimal" min={0} step={1}
                className="flex-1 px-2 py-2 text-sm focus:outline-none"
                placeholder="1999" value={data.compare_at_rupees} onChange={f("compare_at_rupees")} />
            </div>
            {(() => {
              const was = parseFloat(data.compare_at_rupees), now = parseFloat(data.base_price_rupees);
              if (!was || !now) return null;
              if (was <= now) return <p className="text-xs text-red-600 mt-1">Must be higher than the base price.</p>;
              return <p className="text-xs text-green-700 mt-1 font-semibold">Shows as −{Math.round(((was - now) / was) * 100)}% · ₹{now} <span className="line-through text-gray-400 font-normal">₹{was}</span></p>;
            })()}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ends at <span className="text-gray-400 font-normal">(optional)</span></label>
            <input type="datetime-local"
              className="w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-ink/30"
              value={data.offer_ends_at} onChange={f("offer_ends_at")} />
            <p className="text-xs text-gray-400 mt-1">The storefront counts down to this and stops the offer at it.</p>
          </div>
        </div>
        </div>
      </details>

      {/* Ways to wear it. Open on the full form: it is the newest thing she
          can say about a piece and the one Claude is most use for. */}
      <details open={!compact} className="group bg-white rounded-xl border border-gray-200">
        <summary className="cursor-pointer select-none list-none px-5 py-4 flex items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-semibold text-gray-900">Ways to wear it</span>
          <span className="text-xs text-gray-400">{data.styling_notes.length ? `${data.styling_notes.length} written` : "optional"}</span>
        </summary>
        <div className="px-5 pb-5">
          <p className="text-xs text-gray-400 mt-1 mb-4">
            How you would wear this to the office, to lunch, to a function. Shown on the product page under the description, one occasion at a time.
          </p>
          <StylingNotesEditor
            value={data.styling_notes}
            onChange={(n) => onChange({ ...data, styling_notes: n })}
            name={data.name}
            facts={{
              category: categories.find((c) => c.id === data.category_id)?.name ?? null,
              description: data.description || null, colour: data.colour,
              fabric_composition: data.fabric_composition, weave: data.weave,
              print_type: data.print_type, pattern: data.pattern, neck_type: data.neck_type,
              sleeve_type: data.sleeve_type, has_pockets: data.has_pockets, dupatta_included: data.dupatta_included,
            }}
          />
        </div>
      </details>

      {/* Size chart, per product. Overrides the category chart on the storefront. */}
      <details open={!compact} className="group bg-white rounded-xl border border-gray-200">
        <summary className="cursor-pointer select-none list-none px-5 py-4 flex items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-semibold text-gray-900">Size chart</span>
          <span className="text-xs text-gray-400 group-open:hidden">measurements per size</span>
          <span className="text-xs text-gray-400 hidden group-open:inline">optional</span>
        </summary>
        <div className="px-5 pb-5">
        <p className="text-xs text-gray-400 mt-1 mb-4">
          Optional. Without one, the storefront shows the category&apos;s chart. Enter in whichever unit you measured — customers can switch.
        </p>
        <SizeChartEditor value={data.size_chart} onChange={(c) => onChange({ ...data, size_chart: c })} />
        {/* Printed under the size buttons as "Model is 5'4" and wears M" -
            the fit cue a chart cannot give. */}
        <label className="mt-5 border-t border-gray-100 pt-4 flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox" className="mt-0.5 h-5 w-5 accent-burgundy"
            checked={data.worn_by_founder}
            onChange={(e) => onChange({ ...data, worn_by_founder: e.target.checked })}
          />
          <span>
            <span className="block text-sm font-medium text-gray-800">I am wearing it in the photos</span>
            <span className="block text-[11px] text-gray-500 mt-0.5">
              The page says &ldquo;Worn by {FOUNDER.name}, the founder &middot; {FOUNDER.heightCm} cm&rdquo; &mdash; about the height of most Indian women, which makes it the best fit guide on the page.
            </span>
          </span>
        </label>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Size in the photos</label>
            <input className="w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-ink/30" placeholder="M" maxLength={12} value={data.model_size} onChange={f("model_size")} />
          </div>
          <div className={data.worn_by_founder ? "hidden" : ""}>
            <label className="block text-sm font-medium text-gray-700 mb-1">Model height</label>
            <input className="w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-ink/30" placeholder={"5'4\""} maxLength={20} value={data.model_height} onChange={f("model_height")} />
          </div>
          <p className="col-span-2 -mt-2 text-[11px] text-gray-500">Shown under the sizes: &ldquo;Model is 5&prime;4&Prime; and wears M&rdquo;. The strongest sizing hint there is &mdash; leave blank if nobody is wearing it in the photos.</p>
        </div>
        </div>
      </details>

      {/* Legal Metrology declarations.
          Required on the listing before purchase, not optional metadata. Each
          shows its brand-level fallback as placeholder text, so leaving one
          empty is obviously safe rather than careless. "Dimensions" used to be
          a free-text line here; the size chart above is the measurement now,
          so the field is gone from the form and sent blank. */}
      <details open={!compact} className="group bg-white rounded-xl border border-gray-200">
        <summary className="cursor-pointer select-none list-none px-5 py-4 flex items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-semibold text-gray-900">Product information</span>
          <span className="text-xs text-gray-400 group-open:hidden">statutory declarations · brand defaults apply if blank</span>
          <span className="text-xs text-gray-400 hidden group-open:inline">optional</span>
        </summary>
        <div className="px-5 pb-5">
        <p className="text-xs text-gray-500 mt-0.5 mb-3">
          Shown on the product page before purchase, as the Legal Metrology rules
          require. Blank fields fall back to the brand default.
        </p>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Net quantity</label>
              <input
                className="w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-ink/30"
                placeholder={data.set_pieces.length > 1 ? `1 set - ${data.set_pieces.length} pieces` : "1 piece"}
                value={data.net_quantity}
                onChange={f("net_quantity")}
              />
              {/^\s*\d+\s*$/.test(data.net_quantity) ? (
                <p className="text-xs text-amber-700 mt-1">
                  &ldquo;{data.net_quantity.trim()}&rdquo; reads to a customer as {data.net_quantity.trim()} garments in one pack. Clear it and list the pieces under Product details instead &mdash; this fills itself in.
                </p>
              ) : (
                <p className="text-xs text-gray-400 mt-1">Leave blank: it is written from &ldquo;What is in the set&rdquo;. It is what is in one pack, not how many you have in stock.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Commodity name</label>
              <input
                className="w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-ink/30"
                placeholder="Women&rsquo;s cotton garment"
                value={data.commodity_name}
                onChange={f("commodity_name")}
              />
              <p className="text-xs text-gray-400 mt-1">What the item <em>is</em> &mdash; &ldquo;Women&rsquo;s cotton co-ord set&rdquo;. What it is <em>for</em> (office, festive) goes under &ldquo;Wear it for&rdquo; in Product details.</p>
            </div>
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-gray-600 hover:text-gray-900">
              Origin and packer — only for stock we did not pack ourselves
            </summary>
            <div className="mt-3 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Country of origin
                  </label>
                  <input
                    className="w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-ink/30"
                    placeholder="India"
                    value={data.country_of_origin}
                    onChange={f("country_of_origin")}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Marketed and packed by
                  </label>
                  <input
                    className="w-full h-10 border border-gray-300 rounded-lg px-3 text-[15px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-ink/30"
                    placeholder="ZISUN"
                    value={data.manufacturer_name}
                    onChange={f("manufacturer_name")}
                  />
                </div>
              </div>
              
            </div>
          </details>
        </div>
        </div>
      </details>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange({ ...data, is_active: !data.is_active })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            data.is_active ? "bg-green-500" : "bg-gray-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              data.is_active ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
        <label className="text-sm text-gray-700">
          {data.is_active ? "Active — visible on store" : "Inactive — hidden from store"}
        </label>
      </div>
    </div>
  );
}
