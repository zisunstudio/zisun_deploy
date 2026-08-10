"use client";
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminApi";
import { Upload } from "lucide-react";

type ImportResult = {
  created_products: number;
  created_variants: number;
  products: { id: string; name: string; variants: number }[];
  errors?: string[];
};

const TEMPLATE_CSV =
  "name,description,base_price_paise,category_slug,sku,size,color,stock,price_delta_paise,image_url\n" +
  "Indigo Cotton Kurta,Handwoven South Indian cotton. Breathable everyday wear.,149900,,ZSN-KUR-IND-S,S,Indigo,12,0,\n" +
  "Indigo Cotton Kurta,,149900,,ZSN-KUR-IND-M,M,Indigo,18,0,\n" +
  "Indigo Cotton Kurta,,149900,,ZSN-KUR-IND-L,L,Indigo,10,0,\n";

export function BulkProductImport() {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const importCsv = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData();
      fd.append("file", f);
      const res = await adminApi.post<ImportResult>("/products/bulk-import-csv", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data;
    },
    onSuccess: (data) => {
      setResult(data);
      setErrors([]);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
      qc.invalidateQueries({ queryKey: ["admin", "inventory"] });
    },
    onError: (err: unknown) => {
      setResult(null);
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      if (detail && typeof detail === "object" && Array.isArray((detail as { errors?: string[] }).errors)) {
        setErrors((detail as { errors: string[] }).errors);
      } else {
        setErrors([typeof detail === "string" ? detail : "Import failed. Check the CSV format."]);
      }
    },
  });

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "zisun_product_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-8 bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
        <Upload className="w-4 h-4 text-gray-500" />
        Bulk Import Products (CSV)
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        One row per <strong>variant</strong>; rows sharing the same{" "}
        <code className="bg-gray-100 px-1 rounded">name</code> become one product.
        Prices are in <strong>paise</strong> (₹1,499 = <code className="bg-gray-100 px-1 rounded">149900</code>).
        Required: <code className="bg-gray-100 px-1 rounded">name</code>,{" "}
        <code className="bg-gray-100 px-1 rounded">base_price_paise</code>,{" "}
        <code className="bg-gray-100 px-1 rounded">sku</code>,{" "}
        <code className="bg-gray-100 px-1 rounded">stock</code>. All-or-nothing: one bad row rejects the file.
      </p>

      <div className="flex flex-wrap gap-3 items-center">
        <button
          onClick={downloadTemplate}
          className="text-sm border border-gray-300 text-gray-700 px-3 py-2 rounded-lg font-semibold hover:bg-gray-50"
        >
          Download Template
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          onClick={() => { if (file) importCsv.mutate(file); }}
          disabled={!file || importCsv.isPending}
          className="text-sm bg-[#5C3317] text-white px-4 py-2 rounded-lg font-semibold disabled:opacity-50 hover:bg-[#4A2810]"
        >
          {importCsv.isPending ? "Importing..." : "Import"}
        </button>
      </div>

      {result && (
        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
          <p className="font-semibold text-green-800">
            Imported {result.created_products} product(s) and {result.created_variants} variant(s).
          </p>
          <ul className="mt-2 list-disc list-inside text-green-900 space-y-0.5">
            {result.products.map((p) => (
              <li key={p.id}>{p.name} — {p.variants} variant(s)</li>
            ))}
          </ul>
        </div>
      )}

      {errors.length > 0 && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
          <p className="font-semibold text-red-800">Import rejected — nothing was saved.</p>
          <ul className="mt-2 list-disc list-inside text-red-700 space-y-0.5">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
