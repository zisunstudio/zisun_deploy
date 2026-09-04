"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import ProductForm, {
  emptyProductForm,
  priceToPaise,
  type ProductFormData,
} from "@/components/admin/ProductForm";
import VariantEditor, { type VariantRow } from "@/components/admin/VariantEditor";

export default function NewProductPage() {
  const router = useRouter();
  const [form, setForm] = useState<ProductFormData>(emptyProductForm());
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: async () => (await adminApi.get("/categories/")).data,
  });

  const createProduct = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Product name is required");
      if (!form.base_price_rupees) throw new Error("Base price is required");
      if (variants.length === 0) throw new Error("Add at least one variant");

      const payload = {
        name: form.name.trim(),
        description: form.description || null,
        base_price: priceToPaise(form.base_price_rupees),
        category_id: form.category_id || null,
        is_active: form.is_active,
        // Sent as an empty string, not null: the API drops nulls (so an
        // omitted field is never blanked by accident) but stores "", and the
        // resolver reads "" as "fall back to the brand default". That makes
        // clearing a wrong value in the UI actually work.
        dimensions: form.dimensions.trim(),
        net_quantity: form.net_quantity.trim(),
        commodity_name: form.commodity_name.trim(),
        country_of_origin: form.country_of_origin.trim(),
        manufacturer_name: form.manufacturer_name.trim(),
        manufacturer_address: form.manufacturer_address.trim(),
        // Blank stays out of the payload entirely, so an unfilled field is
        // 'not recorded' rather than an empty claim.
        fabric_composition: form.fabric_composition.trim(),
        fabric_gsm: form.fabric_gsm ? Number(form.fabric_gsm) : null,
        weave: form.weave.trim(),
        has_pockets: form.has_pockets === "" ? null : form.has_pockets === "yes",
        colourfastness: form.colourfastness.trim(),
        wash_care: form.wash_care.trim(),
        variants: variants.map((v) => ({
          sku: v.sku,
          size: v.size || null,
          color: v.color || null,
          stock: v.stock,
          price_delta: v.price_delta,
        })),
      };
      const res = await adminApi.post("/products/", payload);
      return res.data;
    },
    onSuccess: (product) => router.push(`/admin/products/${product.id}/edit`),
    onError: (e: any) =>
      setError(e?.response?.data?.detail ?? e.message ?? "Failed to create product"),
  });

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">New Product</h1>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <ProductForm data={form} onChange={setForm} categories={categories} />

        <hr className="border-gray-100" />

        <VariantEditor
          variants={variants}
          onChange={setVariants}
          basePricePaise={priceToPaise(form.base_price_rupees)}
        />

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => createProduct.mutate()}
            disabled={createProduct.isPending}
            className="flex-1 bg-[#5C3317] text-white py-2.5 rounded-lg font-semibold text-sm disabled:opacity-50"
          >
            {createProduct.isPending ? "Creating…" : "Create Product"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 border border-gray-300 py-2.5 rounded-lg font-semibold text-sm text-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
