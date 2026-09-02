"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminApi";

type CouponType = "FLAT" | "PERCENT";

type Coupon = {
  id: string;
  code: string;
  type: CouponType;
  value: number; // paise for FLAT, integer percent for PERCENT
  min_order_value: number;
  max_discount: number | null;
  usage_limit: number | null;
  per_user_limit: number;
  expires_at: string | null;
  is_active: boolean;
  is_referral: boolean;
  created_at: string;
};

const EMPTY_FORM = {
  code: "",
  type: "PERCENT" as CouponType,
  value: "",
  min_order_value: "",
  max_discount: "",
  usage_limit: "",
  per_user_limit: "1",
  expires_at: "",
  is_active: true,
};

function formatValue(c: Coupon) {
  return c.type === "PERCENT" ? `${c.value}%` : `₹${(c.value / 100).toFixed(0)}`;
}

function rupees(paise: number) {
  return `₹${(paise / 100).toFixed(0)}`;
}

export default function AdminCouponsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: coupons, isLoading } = useQuery({
    queryKey: ["admin", "coupons"],
    queryFn: async () => {
      const res = await adminApi.get<Coupon[]>("/coupons/");
      return res.data;
    },
  });

  const createCoupon = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      adminApi.post("/coupons/", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "coupons"] });
      setForm(EMPTY_FORM);
      setShowForm(false);
      setFormError(null);
    },
    onError: (err: unknown) => {
      const detail =
        (err as { response?: { data?: { detail?: unknown } } })?.response?.data
          ?.detail;
      setFormError(
        typeof detail === "string" ? detail : "Failed to create coupon. Check the fields."
      );
    },
  });

  const deactivateCoupon = useMutation({
    mutationFn: (id: string) => adminApi.delete(`/coupons/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "coupons"] }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!/^[A-Z0-9_-]{3,50}$/.test(form.code)) {
      setFormError("Code must be 3–50 chars, uppercase letters, numbers, _ or - only.");
      return;
    }
    const value = parseInt(form.value);
    if (!value || value <= 0) {
      setFormError("Value must be a positive number.");
      return;
    }
    if (form.type === "PERCENT" && value > 100) {
      setFormError("Percent value cannot exceed 100.");
      return;
    }

    const payload: Record<string, unknown> = {
      code: form.code.toUpperCase(),
      type: form.type,
      // FLAT value entered in rupees → convert to paise; PERCENT is integer percent
      value: form.type === "FLAT" ? value * 100 : value,
      min_order_value: form.min_order_value
        ? parseInt(form.min_order_value) * 100
        : 0,
      per_user_limit: parseInt(form.per_user_limit) || 1,
      is_active: form.is_active,
    };
    if (form.max_discount) payload.max_discount = parseInt(form.max_discount) * 100;
    if (form.usage_limit) payload.usage_limit = parseInt(form.usage_limit);
    if (form.expires_at)
      payload.expires_at = new Date(form.expires_at).toISOString();

    createCoupon.mutate(payload);
  }

  const inputCls =
    "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5C3317]/30";

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Coupons</h1>
        <button
          onClick={() => { setShowForm((s) => !s); setFormError(null); }}
          className="text-sm bg-[#5C3317] text-white px-4 py-2 rounded-lg font-semibold hover:bg-[#4A2810]"
        >
          {showForm ? "Cancel" : "+ New Coupon"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-8 bg-white rounded-xl border border-gray-200 p-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Code</label>
              <input
                className={`${inputCls} font-mono uppercase`}
                placeholder="WELCOME10"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Type</label>
              <select
                className={inputCls}
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as CouponType })}
              >
                <option value="PERCENT">Percent (%)</option>
                <option value="FLAT">Flat (₹)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                {form.type === "PERCENT" ? "Value (%)" : "Value (₹)"}
              </label>
              <input
                type="number" min="1"
                className={inputCls}
                placeholder={form.type === "PERCENT" ? "10" : "200"}
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Min Order (₹)</label>
              <input
                type="number" min="0"
                className={inputCls}
                placeholder="0"
                value={form.min_order_value}
                onChange={(e) => setForm({ ...form, min_order_value: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Max Discount (₹) {form.type === "PERCENT" ? "" : "— n/a"}
              </label>
              <input
                type="number" min="1"
                disabled={form.type === "FLAT"}
                className={`${inputCls} disabled:bg-gray-100`}
                placeholder="Cap for % discounts"
                value={form.max_discount}
                onChange={(e) => setForm({ ...form, max_discount: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Total Usage Limit</label>
              <input
                type="number" min="1"
                className={inputCls}
                placeholder="Unlimited if blank"
                value={form.usage_limit}
                onChange={(e) => setForm({ ...form, usage_limit: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Per-User Limit</label>
              <input
                type="number" min="1"
                className={inputCls}
                value={form.per_user_limit}
                onChange={(e) => setForm({ ...form, per_user_limit: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Expires At</label>
              <input
                type="date"
                className={inputCls}
                value={form.expires_at}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                Active
              </label>
            </div>
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={createCoupon.isPending}
              className="text-sm bg-[#5C3317] text-white px-5 py-2 rounded-lg font-semibold disabled:opacity-50 hover:bg-[#4A2810]"
            >
              {createCoupon.isPending ? "Creating..." : "Create Coupon"}
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}
        </div>
      ) : !coupons || coupons.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-500 text-sm">
          No coupons yet. Create your first one above.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Code", "Type", "Value", "Min Order", "Max Disc.", "Usage Limit", "Per User", "Expires", "Status", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {coupons.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-semibold text-gray-900 whitespace-nowrap">
                    {c.code}
                    {c.is_referral && <span className="ml-2 text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">REF</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.type}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{formatValue(c)}</td>
                  <td className="px-4 py-3 text-gray-600">{c.min_order_value ? rupees(c.min_order_value) : "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{c.max_discount ? rupees(c.max_discount) : "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{c.usage_limit ?? "∞"}</td>
                  <td className="px-4 py-3 text-gray-600">{c.per_user_limit}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {c.expires_at ? new Date(c.expires_at).toLocaleDateString("en-IN") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-1 rounded ${c.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {c.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {c.is_active && (
                      <button
                        onClick={() => {
                          if (confirm(`Deactivate coupon ${c.code}?`)) deactivateCoupon.mutate(c.id);
                        }}
                        className="text-xs text-red-600 font-semibold hover:underline"
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
