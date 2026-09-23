"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import ProductForm, {
  emptyProductForm,
  priceToPaise,
  type ProductFormData,
} from "@/components/admin/ProductForm";
import VariantEditor, { gridVariants, type VariantRow, type VariantEditorHandle } from "@/components/admin/VariantEditor";
import AiComposer, { type AiDraft } from "@/components/admin/AiComposer";

export default function NewProductPage() {
  const router = useRouter();
  const [form, setForm] = useState<ProductFormData>(emptyProductForm());
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const variantEditor = useRef<VariantEditorHandle>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: async () => (await adminApi.get("/categories/")).data,
  });

  // The draft lands in the same state the form and the variant table read
  // from. Only fields the model actually filled are written, so a second
  // draft never blanks something she typed by hand in between.
  function applyDraft(d: AiDraft, categoryId: string | null) {
    const yn = (b: boolean | null | undefined) => (b === true ? "yes" : b === false ? "no" : "");
    setForm((f) => ({
      ...f,
      name: d.name || f.name,
      description: d.description || f.description,
      base_price_rupees: d.base_price_rupees ? String(d.base_price_rupees) : f.base_price_rupees,
      compare_at_rupees: d.compare_at_rupees ? String(d.compare_at_rupees) : f.compare_at_rupees,
      category_id: categoryId ?? f.category_id,
      colour: d.colours?.[0] ?? f.colour,
      fabric_composition: d.fabric_composition ?? f.fabric_composition,
      weave: d.weave ?? f.weave,
      fabric_gsm: d.fabric_gsm ? String(d.fabric_gsm) : f.fabric_gsm,
      wash_care: d.wash_care ?? f.wash_care,
      has_pockets: d.has_pockets == null ? f.has_pockets : yn(d.has_pockets),
      print_type: d.print_type ?? f.print_type,
      pattern: d.pattern ?? f.pattern,
      neck_type: d.neck_type ?? f.neck_type,
      sleeve_type: d.sleeve_type ?? f.sleeve_type,
      sleeve_attached: d.sleeve_attached == null ? f.sleeve_attached : yn(d.sleeve_attached),
      dupatta_included: d.dupatta_included == null ? f.dupatta_included : yn(d.dupatta_included),
    }));
    if ((d.colours?.length ?? 0) + (d.sizes?.length ?? 0) > 0) {
      const prefix = (d.name || form.name || "ZS").split(/\s+/).slice(0, 2).join("-");
      setVariants((v) => [...v, ...gridVariants(d.colours ?? [], d.sizes ?? [], d.stock_per_variant ?? 0, prefix, v)]);
    }
  }

  const createProduct = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Product name is required");
      if (!form.base_price_rupees) throw new Error("Base price is required");
      // A row the founder filled in but never ticked is still sitting in the
      // editor as a draft. Commit it now rather than telling her she has no
      // variants while one is visibly on screen.
      const flushed = variantEditor.current?.flushDraft() ?? null;
      const allVariants = flushed ? [...variants, flushed] : variants;
      if (allVariants.length === 0) throw new Error("Add at least one variant");

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
        hsn_code: form.hsn_code.trim(),
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
        model_size: form.model_size.trim(),
        model_height: form.model_height.trim(),
        worn_by_founder: form.worn_by_founder,
        named_for: form.named_for.trim(),
        fit: form.fit.trim(),
        garment_length: form.garment_length.trim(),
        embroidery: form.embroidery.trim(),
        bottom_type: form.bottom_type.trim(),
        occasion: form.occasion.trim(),
        // Cleaned here as well as server-side: a blank chip would make
        // "1 set - 3 pieces" out of two garments.
        set_pieces: form.set_pieces.map((p) => p.trim()).filter(Boolean),
        craft: form.craft.trim(),
        origin: form.origin.trim(),
        lining: form.lining,
        transparency: form.transparency,
        batch_size: form.batch_size.trim() ? Number(form.batch_size) : null,
        will_rerun: form.will_rerun === "" ? null : form.will_rerun === "yes",
        styling_notes: form.styling_notes.map((n) => ({ occasion: n.occasion.trim(), note: n.note.trim() })).filter((n) => n.occasion && n.note),
        variants: allVariants.map((v) => ({
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
    onSuccess: (product) => router.push(`/admin/products/${product.id}/edit#photos`),
    // A 422 detail is a list, not a string; rendering it crashed the page.
    onError: (e: any) => {
      const d = e?.response?.data?.detail;
      setError(
        Array.isArray(d)
          ? d.map((x: any) => String(x?.msg ?? x).replace(/^Value error, /, "")).join(" · ")
          : typeof d === "string" ? d : (e?.message ?? "Failed to create product"),
      );
    },
  });

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8 max-w-2xl">
      <div className="flex items-center gap-2 mb-5">
        <button onClick={() => router.back()} aria-label="Back" className="h-10 w-10 -ml-2 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-[22px] sm:text-2xl font-semibold text-gray-900">New product</h1>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="mb-4">
        <AiComposer onDraft={applyDraft} />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-6">
        <ProductForm data={form} onChange={setForm} categories={categories}  compact />

        <hr className="border-gray-100" />

        <VariantEditor
          ref={variantEditor}
          variants={variants}
          onChange={setVariants}
          basePricePaise={priceToPaise(form.base_price_rupees)}
          skuPrefix={(form.name || "ZS").split(/\s+/).slice(0, 2).join("-")}
        />

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => createProduct.mutate()}
            disabled={createProduct.isPending}
            className="flex-1 h-11 bg-ink text-white rounded-lg font-semibold text-sm disabled:opacity-50"
          >
            {createProduct.isPending ? "Creating…" : "Create product"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 h-11 border border-gray-300 rounded-lg font-semibold text-sm text-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
