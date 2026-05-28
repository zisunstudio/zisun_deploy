"use client";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminApi";

interface ReconciliationData {
  period_days: number;
  captured_payments_count: number;
  captured_total_paise: number;
  captured_total_inr: number;
}

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

function downloadCSV(data: ReconciliationData) {
  const rows = [
    ["Metric", "Value"],
    ["Period (days)", String(data.period_days)],
    ["Captured Payments Count", String(data.captured_payments_count)],
    ["Captured Total (paise)", String(data.captured_total_paise)],
    ["Captured Total (INR)", formatINR(data.captured_total_inr)],
    ["Razorpay Settlements", "Sync in progress..."],
  ];
  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reconciliation_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReconciliationPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-reconciliation"],
    queryFn: async () => {
      const { data } = await adminApi.get("/reconciliation");
      return data as ReconciliationData;
    },
  });

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Finance Reconciliation</h1>
        {data && (
          <button
            onClick={() => downloadCSV(data)}
            className="bg-[#5C3317] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#4A2810]"
          >
            Export CSV
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          Failed to load reconciliation data. Ensure the backend endpoint is available.
        </div>
      ) : data ? (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Period</p>
              <p className="text-3xl font-bold text-gray-900">{data.period_days}</p>
              <p className="text-sm text-gray-500 mt-0.5">days</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Captured Payments</p>
              <p className="text-3xl font-bold text-gray-900">{data.captured_payments_count}</p>
              <p className="text-sm text-gray-500 mt-0.5">transactions</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Total Captured</p>
              <p className="text-3xl font-bold text-green-700">{formatINR(data.captured_total_inr)}</p>
              <p className="text-sm text-gray-500 mt-0.5">{data.captured_total_paise.toLocaleString("en-IN")} paise</p>
            </div>
          </div>

          {/* Detailed table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Source</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Count</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Amount</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">Platform Payments</td>
                  <td className="px-4 py-3 text-gray-700">{data.captured_payments_count}</td>
                  <td className="px-4 py-3 font-semibold text-green-700">{formatINR(data.captured_total_inr)}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-1 rounded-full font-semibold bg-green-100 text-green-700">Captured</span>
                  </td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">Razorpay Settlements</td>
                  <td className="px-4 py-3 text-gray-400">—</td>
                  <td className="px-4 py-3 text-gray-400">—</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-1 rounded-full font-semibold bg-amber-100 text-amber-700">Sync in progress...</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
