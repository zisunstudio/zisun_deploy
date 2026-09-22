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
     fabric_composition: "",
    fabric_gsm: "",
    weave: "",
    has_pockets: "",
    colourfastness: "",
    wash_care: "",
    colour: "",
    print_type: "",
    pattern: "",
    neck_type: "",
    sleeve_type: "",
    sleeve_attached: "",
    dupatta_included: "",
    compare_at_rupees: "",
    offer_ends_at: "",
    size_chart: null,
    fit: "",
    garment_length: "",
    embroidery: "",
    bottom_type: "",
    occasion: "",
    set_pieces: [],
    styling_notes: [],
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
      // Numbers and booleans become strings here: an empty input has to mean
      // "not recorded", which neither type can express.
      fabric_composition: product.fabric_composition ?? "",
      fabric_gsm: product.fabric_gsm == null ? "" : String(product.fabric_gsm),
      weave: product.weave ?? "",
      has_pockets:
        product.has_pockets == null ? "" : product.has_pockets ? "yes" : "no",
      colourfastness: product.colourfastness ?? "",
      wash_care: product.wash_care ?? "",
      colour: product.colour ?? "",
      print_type: product.print_type ?? "",
      pattern: product.pattern ?? "",
      neck_type: product.neck_type ?? "",
      sleeve_type: product.sleeve_type ?? "",
      sleeve_attached:
        product.sleeve_attached == null ? "" : product.sleeve_attached ? "yes" : "no",
      dupatta_included:
        product.dupatta_included == null ? "" : product.dupatta_included ? "yes" : "no",
      compare_at_rupees: product.compare_at_price == null ? "" : String(product.compare_at_price / 100),
      // datetime-local wants local wall-clock time without the zone suffix.
      offer_ends_at: product.offer_ends_at
        ? new Date(new Date(product.offer_ends_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
        : "",
      size_chart: product.size_chart ?? null,
      fit: product.fit ?? "",
      garment_length: product.garment_length ?? "",
      embroidery: product.embroidery ?? "",
      bottom_type: product.bottom_type ?? "",
      occasion: product.occasion ?? "",
      set_pieces: product.set_pieces ?? [],
      styling_notes: product.styling_notes ?? [],
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
        fabric_composition: form.fabric_composition.trim(),
        fabric_gsm: form.fabric_gsm ? Number(form.fabric_gsm) : null,
        weave: form.weave.trim(),
        has_pockets: form.has_pockets === "" ? null : form.has_pockets === "yes",
        colourfastness: form.colourfastness.trim(),
        wash_care: form.wash_care.trim(),
        colour: form.colour.trim(),
        print_type: form.print_type.trim(),
        pattern: form.pattern.trim(),
        neck_type: form.neck_type.trim(),
        sleeve_type: form.sleeve_type.trim(),
        sleeve_attached:
          form.sleeve_attached === "" ? null : form.sleeve_attached === "yes",
        dupatta_included:
          form.dupatta_included === "" ? null : form.dupatta_included === "yes",
        // Offer: rupees -> paise, "" -> null (clears the offer on update).
        compare_at_price: form.compare_at_rupees ? priceToPaise(form.compare_at_rupees) : null,
        offer_ends_at: form.offer_ends_at ? new Date(form.offer_ends_at).toISOString() : null,
        size_chart: form.size_chart,
        fit: form.fit.trim() || null,
        garment_length: form.garment_length.trim() || null,
        embroidery: form.embroidery.trim() || null,
        bottom_type: form.bottom_type.trim() || null,
        occasion: form.occasion.trim() || null,
        // Cleaned here as well as server-side: a blank chip would make
        // "1 set - 3 pieces" out of two garments.
        set_pieces: form.set_pieces.map((p) => p.trim()).filter(Boolean),
        styling_notes: form.styling_notes.map((n) => ({ occasion: n.occasion.trim(), note: n.note.trim() })).filter((n) => n.occasion && n.note),
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
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8 max-w-2xl">
      <div className="flex items-center gap-2 mb-5">
        <button onClick={() => router.back()} aria-label="Back" className="h-10 w-10 -ml-2 shrink-0 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-[22px] sm:text-2xl font-semibold text-gray-900 truncate">
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
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Product details</h2>
          <ProductForm data={form} onChange={setForm} categories={categories} />
          <div className="mt-4">
            <button
              type="button"
              onClick={() => updateProduct.mutate()}
              disabled={updateProduct.isPending}
              className="h-11 bg-ink text-white px-5 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {updateProduct.isPending ? "Saving…" : "Save details"}
            </button>
          </div>
        </div>

        {/* Media */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <h2 id="photos" className="font-semibold text-gray-900 mb-4 scroll-mt-24">Photos &amp; videos</h2>
          <MediaUploader
            variants={variants.map((v) => ({ id: v.id, color: v.color, size: v.size }))}
            productId={productId}
            media={media}
            onChange={setMedia}
          />
        </div>

        {/* Variants */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
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
