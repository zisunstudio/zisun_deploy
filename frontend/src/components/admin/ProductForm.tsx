"use client";

export interface ProductFormData {
  name: string;
  description: string;
  base_price_rupees: string; // user input in ₹, converted to paise on submit
  category_id: string;
  is_active: boolean;
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
  return { name: "", description: "", base_price_rupees: "", category_id: "", is_active: true };
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
