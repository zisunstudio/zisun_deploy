"use client";

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
}

export function emptyProductForm(): ProductFormData {
  return {
    name: "", description: "", base_price_rupees: "", category_id: "", is_active: true,
    dimensions: "", net_quantity: "", commodity_name: "", country_of_origin: "",
    manufacturer_name: "", manufacturer_address: "",
  };
}

export function priceToPaise(rupees: string): number {
  const n = parseFloat(rupees);
  return isNaN(n) ? 0 : Math.round(n * 100);
}

export default function ProductForm({ data, onChange, categories }: Props) {
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

      {/* Legal Metrology declarations.
          These are required on the listing before purchase, not optional
          metadata. Dimensions is marked required in the UI even though the API
          accepts it empty: it is the only one with no brand-level fallback, so
          a blank here is a listing published without a statutory declaration.
          The rest show their fallback as placeholder text, so it is obvious
          that leaving them empty is safe rather than careless. */}
      <div className="border-t border-gray-100 pt-4">
        <h3 className="text-sm font-semibold text-gray-900">Product information</h3>
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
