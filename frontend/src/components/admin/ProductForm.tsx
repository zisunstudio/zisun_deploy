"use client";
import type { SizeChart } from "@/lib/queries/catalog";
import SizeChartEditor from "@/components/admin/SizeChartEditor";

export interface ProductFormData {
  name: string;
  description: string;
  base_price_rupees: string; // user input in ₹, converted to paise on submit
  category_id: string;
  is_active: boolean;

  /**
   * Legal Metrology declarations. Optional: the API falls back to the
   * brand-level default for all of them except `dimensions`, which has no
   * honest brand-wide value — so an apparel listing that leaves it blank goes
   * live without the measurement the Packaged Commodities Rules require.
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
  /**
   * Offer. Rupees in the form, paise on the wire like base_price; empty means
   * no offer. offer_ends_at is a datetime-local string, or "" for open-ended.
   */
  compare_at_rupees: string;
  offer_ends_at: string;
  /** Per-product size chart; null uses the category chart on the storefront. */
  size_chart: SizeChart | null;
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
    compare_at_rupees: "", offer_ends_at: "", size_chart: null,
  };
}

export function priceToPaise(rupees: string): number {
  const n = parseFloat(rupees);
  return isNaN(n) ? 0 : Math.round(n * 100);
}

export default function ProductForm({ data, onChange, categories, compact = false }: Props) {
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
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5C3317]/30"
          placeholder="e.g. Floral Kurta Set"
          value={data.name}
          onChange={f("name")}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5C3317]/30 resize-none"
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
              type="number"
              min="0"
              step="0.01"
              className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5C3317]/30"
              placeholder="999"
              value={data.base_price_rupees}
              onChange={f("base_price_rupees")}
              required
            />
          </div>
          {data.base_price_rupees && (
            <p className="text-xs text-gray-400 mt-1">
              = {priceToPaise(data.base_price_rupees)} paise
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#5C3317]/30"
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
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5C3317]/30"
                placeholder="100% handloom cotton"
                value={data.fabric_composition}
                onChange={f("fabric_composition")}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Weight (GSM)</label>
              <input
                type="number" min="1" max="2000"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5C3317]/30"
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
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5C3317]/30"
                placeholder="Plain handloom"
                value={data.weave}
                onChange={f("weave")}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pockets</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#5C3317]/30"
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
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5C3317]/30"
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
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5C3317]/30"
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
        <p className="text-xs text-gray-400 mt-1 mb-4">
          Shown on the product page. Anything left blank is simply omitted.
        </p>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Colour</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5C3317]/30"
                placeholder="Indigo with off-white border"
                value={data.colour}
                onChange={f("colour")}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Print</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5C3317]/30"
                placeholder="Ajrakh block print"
                value={data.print_type}
                onChange={f("print_type")}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pattern</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5C3317]/30"
                placeholder="Straight cut, side slits"
                value={data.pattern}
                onChange={f("pattern")}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Neck</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5C3317]/30"
                placeholder="V-neck with piping"
                value={data.neck_type}
                onChange={f("neck_type")}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sleeve type</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5C3317]/30"
                placeholder="Three-quarter"
                value={data.sleeve_type}
                onChange={f("sleeve_type")}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sleeve attached</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#5C3317]/30"
                value={data.sleeve_attached}
                onChange={f("sleeve_attached")}
              >
                <option value="">— not recorded —</option>
                <option value="yes">Attached</option>
                <option value="no">Not attached</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dupatta included</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#5C3317]/30"
                value={data.dupatta_included}
                onChange={f("dupatta_included")}
              >
                <option value="">— not recorded —</option>
                <option value="yes">Included</option>
                <option value="no">Not included</option>
              </select>
            </div>
          </div>
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
            <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-[#5C3317]/30">
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
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5C3317]/30"
              value={data.offer_ends_at} onChange={f("offer_ends_at")} />
            <p className="text-xs text-gray-400 mt-1">The storefront counts down to this and stops the offer at it.</p>
          </div>
        </div>
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
        </div>
      </details>

      {/* Legal Metrology declarations.
          These are required on the listing before purchase, not optional
          metadata. Dimensions is marked required in the UI even though the API
          accepts it empty: it is the only one with no brand-level fallback, so
          a blank here is a listing published without a statutory declaration.
          The rest show their fallback as placeholder text, so it is obvious
          that leaving them empty is safe rather than careless. */}
      <details open={!compact} className="group bg-white rounded-xl border border-gray-200">
        <summary className="cursor-pointer select-none list-none px-5 py-4 flex items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-semibold text-gray-900">Product information</span>
          <span className="text-xs text-gray-400 group-open:hidden">statutory declarations · brand defaults apply if blank</span>
          <span className="text-xs text-gray-400 hidden group-open:inline">optional</span>
        </summary>
        <div className="px-5 pb-5">
        <p className="text-xs text-gray-500 mt-0.5 mb-3">
          Shown on the product page before purchase, as the Legal Metrology rules
          require. Blank fields fall back to the brand default — except dimensions.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dimensions <span className="text-red-500">*</span>
            </label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5C3317]/30"
              placeholder="Bust 86-102 cm, Length 114-120 cm (varies by size)"
              value={data.dimensions}
              onChange={f("dimensions")}
            />
            {!data.dimensions.trim() && (
              <p className="text-xs text-amber-600 mt-1">
                Required for apparel. There is no brand default for this one — leave it
                blank and the product page shows no measurements at all.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Net quantity</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5C3317]/30"
                placeholder="1 unit"
                value={data.net_quantity}
                onChange={f("net_quantity")}
              />
              <p className="text-xs text-gray-400 mt-1">A co-ord set is “1 set of 2 pieces”.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Commodity name</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5C3317]/30"
                placeholder="Women&rsquo;s cotton garment"
                value={data.commodity_name}
                onChange={f("commodity_name")}
              />
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
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5C3317]/30"
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
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5C3317]/30"
                    placeholder="ZISUN"
                    value={data.manufacturer_name}
                    onChange={f("manufacturer_name")}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Packer address
                </label>
                <textarea
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5C3317]/30 resize-none"
                  rows={2}
                  placeholder="Falls back to the registered ZISUN address"
                  value={data.manufacturer_address}
                  onChange={f("manufacturer_address")}
                />
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
