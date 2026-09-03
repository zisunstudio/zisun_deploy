"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import ProductForm, {
  priceToPaise,
  type ProductFormData,
} from "@/components/admin/ProductForm";
import VariantEditor, { type VariantRow } from "@/components/admin/VariantEditor";
import MediaUploader, { type MediaItem } from "@/components/admin/MediaUploader";

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const productId = params.id;
  const qc = useQueryClient();

  const [form, setForm] = useState<ProductFormData>({
    name: "",
    description: "",
    base_price_rupees: "",
    category_id: "",
    is_active: true,
    dimensions: "",
    net_quantity: "",
    commodity_name: "",
    country_of_origin: "",
    manufacturer_name: "",
    manufacturer_address: "",
  });
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: async () => (await adminApi.get("/categories/")).data,
  });

  const { data: product, isLoading } = useQuery({
    queryKey: ["admin", "product", productId],
    queryFn: async () => {
      const res = await adminApi.get(`/products/${productId}`);
      return res.data;
    },
    enabled: !!productId,
  });

  // Seed form from loaded product
  useEffect(() => {
    if (!product) return;
    setForm({
      name: product.name ?? "",
      description: product.description ?? "",
      base_price_rupees: String(product.base_price / 100),
      category_id: product.category?.id ?? "",
      is_active: product.is_active ?? true,
      // Read back from the admin detail response, which exposes the stored
      // overrides. Without this the inputs render empty and the next save
      // writes those blanks over real declarations.
      dimensions: product.dimensions ?? "",
      net_quantity: product.net_quantity ?? "",
      commodity_name: product.commodity_name ?? "",
      country_of_origin: product.country_of_origin ?? "",
      manufacturer_name: product.manufacturer_name ?? "",
      manufacturer_address: product.manufacturer_address ?? "",
    });
    setVariants(
      (product.variants ?? []).map((v: any) => ({
        id: v.id,
        sku: v.sku,
        size: v.size ?? "",
        color: v.color ?? "",
        price_delta: v.price_delta ?? 0,
        stock: v.stock ?? 0,
        is_active: v.is_active ?? true,
      }))
    );
    setMedia(product.media ?? []);
  }, [product]);

  const updateProduct = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Product name is required");
      await adminApi.put(`/products/${productId}`, {
        name: form.name.trim(),
        description: form.description || null,
        base_price: priceToPaise(form.base_price_rupees),
        category_id: form.category_id || null,
        is_active: form.is_active,
        dimensions: form.dimensions.trim(),
        net_quantity: form.net_quantity.trim(),
        commodity_name: form.commodity_name.trim(),
        country_of_origin: form.country_of_origin.trim(),
        manufacturer_name: form.manufacturer_name.trim(),
        manufacturer_address: form.manufacturer_address.trim(),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (e: any) =>
      setError(e?.response?.data?.detail ?? e.message ?? "Save failed"),
  });

  // Variant API callbacks (edit mode — each save hits the API immediately)
  async function handleSaveVariant(row: VariantRow): Promise<VariantRow> {
    if (row.id) {
      const res = await adminApi.put(`/products/${productId}/variants/${row.id}`, {
        size: row.size || null,
        color: row.color || null,
        stock: row.stock,
        price_delta: row.price_delta,
        is_active: row.is_active,
      });
      return { ...row, ...res.data };
    } else {
      const res = await adminApi.post(`/products/${productId}/variants/`, {
        sku: row.sku,
        size: row.size || null,
        color: row.color || null,
        stock: row.stock,
        price_delta: row.price_delta,
      });
      return { ...res.data, is_active: true };
    }
  }

  async function handleDeleteVariant(row: VariantRow) {
    if (row.id) {
      await adminApi.delete(`/products/${productId}/variants/${row.id}`);
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 truncate">
          {product?.name ?? "Edit Product"}
        </h1>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}
      {saved && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
          Saved successfully
        </div>
      )}

      <div className="space-y-6">
        {/* Product details */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Product Details</h2>
          <ProductForm data={form} onChange={setForm} categories={categories} />
          <div className="mt-4">
            <button
              type="button"
              onClick={() => updateProduct.mutate()}
              disabled={updateProduct.isPending}
              className="bg-[#5C3317] text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {updateProduct.isPending ? "Saving…" : "Save Details"}
            </button>
          </div>
        </div>

        {/* Media */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Photos & Videos</h2>
          <MediaUploader
            productId={productId}
            media={media}
            onChange={setMedia}
          />
        </div>

        {/* Variants */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Variants</h2>
          <VariantEditor
            variants={variants}
            onChange={setVariants}
            onSaveRow={handleSaveVariant}
            onDeleteRow={handleDeleteVariant}
            basePricePaise={priceToPaise(form.base_price_rupees)}
          />
        </div>
      </div>
    </div>
  );
}
