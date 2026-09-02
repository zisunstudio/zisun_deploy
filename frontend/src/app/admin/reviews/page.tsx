"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminApi";
import { Star } from "lucide-react";

type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

type Review = {
  id: string;
  user_id: string;
  product_id: string;
  order_id: string;
  rating: number;
  title: string | null;
  body: string | null;
  is_verified_purchase: boolean;
  status: ReviewStatus;
  created_at: string;
};

const TABS: { key: ReviewStatus; label: string }[] = [
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
];

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`w-4 h-4 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`}
        />
      ))}
    </div>
  );
}

export default function AdminReviewsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<ReviewStatus>("PENDING");

  const { data: reviews, isLoading } = useQuery({
    queryKey: ["admin", "reviews", tab],
    queryFn: async () => {
      const res = await adminApi.get<Review[]>(`/reviews/?status=${tab}&limit=100`);
      return res.data;
    },
  });

  const moderate = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReviewStatus }) =>
      adminApi.patch(`/reviews/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "reviews"] });
    },
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Reviews</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? "border-[#5C3317] text-[#5C3317]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : !reviews || reviews.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-500 text-sm">
          No {tab.toLowerCase()} reviews.
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <Stars rating={r.rating} />
                    {r.is_verified_purchase && (
                      <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-semibold">
                        VERIFIED PURCHASE
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {new Date(r.created_at).toLocaleDateString("en-IN")}
                    </span>
                  </div>
                  {r.title && <p className="font-semibold text-gray-900">{r.title}</p>}
                  {r.body && <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{r.body}</p>}
                  <p className="text-[11px] text-gray-400 mt-2 font-mono">
                    product: {r.product_id.slice(0, 8)}… · order: {r.order_id.slice(0, 8)}…
                  </p>
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  {r.status !== "APPROVED" && (
                    <button
                      onClick={() => moderate.mutate({ id: r.id, status: "APPROVED" })}
                      disabled={moderate.isPending}
                      className="text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-lg font-semibold hover:bg-green-200 disabled:opacity-50"
                    >
                      Approve
                    </button>
                  )}
                  {r.status !== "REJECTED" && (
                    <button
                      onClick={() => moderate.mutate({ id: r.id, status: "REJECTED" })}
                      disabled={moderate.isPending}
                      className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded-lg font-semibold hover:bg-red-200 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
