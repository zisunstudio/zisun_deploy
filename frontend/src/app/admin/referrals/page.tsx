"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminApi";
import { Button, Card, CardHeader, EmptyState, Field, Input, Page, Pill, TableScroll, td, th } from "@/components/admin/ui";

/**
 * Referral codes: who has one, what each has sold, and what is owed.
 *
 * Two kinds of owner (services/referral.py). A customer gets her own code
 * the first time her order is delivered and earns store credit - nothing
 * to do here but watch. A creator is someone with an audience; she is
 * added below, earns cash, and is paid by UPI by hand - "To pay" lists
 * exactly who and how much, and "Mark paid" records it.
 */

type Rules = { friend_discount_paise: number; reward_paise: number; min_order_paise: number; hold_days: number };
type Code = {
  code: string; kind: "customer" | "creator"; owner: string; phone: string | null; active: boolean;
  orders: number; pending_paise: number; earned_paise: number; paid_paise: number; owed_back_paise: number;
};
type Reward = {
  id: string; code: string; owner: string | null; phone: string | null; kind: "cash" | "credit";
  status: "pending" | "earned" | "reversed"; amount_paise: number; reason?: string | null; order_id: string; order_total_paise: number;
  order_status: string; created_at: string | null; earned_at: string | null;
};
type Data = { rules: Rules; codes: Code[]; rewards: Reward[] };

const rs = (p: number) => `₹${Math.round(p / 100).toLocaleString("en-IN")}`;
const errorText = (e: unknown, fallback: string) => {
  const d = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof d === "string" ? d : fallback;
};

export default function ReferralsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery<Data>({
    queryKey: ["admin", "referrals"],
    queryFn: async () => (await adminApi.get("/referrals/")).data,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "referrals"] });

  const [form, setForm] = useState({ name: "", phone: "", code: "" });
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => adminApi.post("/referrals/creators", {
      name: form.name.trim(), phone: `+91${form.phone.trim()}`, code: form.code.trim() || null,
    }),
    onSuccess: (r) => { setFormMsg(`Made ${r.data.code}. Send it to ${form.name.trim().split(" ")[0]}.`); setForm({ name: "", phone: "", code: "" }); refresh(); },
    onError: (e) => setFormMsg(errorText(e, "Could not make that code.")),
  });
  const pay = useMutation({
    mutationFn: (ids: string[]) => adminApi.post("/referrals/rewards/paid", { reward_ids: ids }),
    onSuccess: refresh,
  });
  const recovered = useMutation({
    mutationFn: (ids: string[]) => adminApi.post("/referrals/rewards/recovered", { reward_ids: ids }),
    onSuccess: refresh,
  });
  const toggle = useMutation({
    mutationFn: (c: Code) => adminApi.patch(`/referrals/codes/${c.code}`, { active: !c.active }),
    onSuccess: refresh,
  });

  const rules = data?.rules;
  const toPay = (data?.rewards ?? []).filter((r) => r.kind === "cash" && r.status === "earned");
  const waiting = (data?.rewards ?? []).filter((r) => r.status === "pending");
  // Cash that was paid, and then the order came back: to take off her next payment.
  const owedBack = (data?.rewards ?? []).filter((r) => r.status === "reversed");
  // One payment per creator: the rows grouped by phone.
  const byCreator = Object.values(toPay.reduce<Record<string, { owner: string; phone: string; total: number; ids: string[] }>>((acc, r) => {
    const k = r.phone ?? r.owner ?? r.code;
    acc[k] ??= { owner: r.owner ?? r.code, phone: r.phone ?? "", total: 0, ids: [] };
    acc[k].total += r.amount_paise;
    acc[k].ids.push(r.id);
    return acc;
  }, {}));
  const phoneOk = /^[6-9]\d{9}$/.test(form.phone.trim());

  return (
    <Page
      title="Referrals"
      description={rules
        ? `A friend takes ${rs(rules.friend_discount_paise)} off a first order of ${rs(rules.min_order_paise)} or more. The person who shared earns ${rs(rules.reward_paise)} once the parcel is delivered and ${rules.hold_days} days have passed - store credit for a customer, cash for a creator.`
        : "Codes that earn for the person who shares them."}
    >
      <div className="space-y-4">
      {error ? <Card><p className="text-sm text-red-700">{errorText(error, "Could not load referrals.")}</p></Card> : null}

      <Card padded={false}>
        <CardHeader title="To pay" meta="Creators whose codes have earned. Pay by UPI, then mark paid." />
        <div className="p-4 sm:p-5">
          {byCreator.length === 0 ? (
            <p className="text-sm text-gray-500">Nothing owed.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {byCreator.map((c) => (
                <li key={c.phone || c.owner} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{c.owner} · {rs(c.total)}</p>
                    <p className="text-xs text-gray-500">{c.phone} · {c.ids.length} {c.ids.length === 1 ? "order" : "orders"}</p>
                  </div>
                  <Button size="sm" variant="primary" disabled={pay.isPending} onClick={() => pay.mutate(c.ids)}>Mark paid</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {owedBack.length > 0 && (
        <Card padded={false}>
          <CardHeader title="To take back" meta="You paid these, and then the order came back. Deduct each from that creator's next payment, then mark it deducted." />
          <ul className="p-4 sm:p-5 divide-y divide-gray-100">
            {owedBack.map((r) => (
              <li key={r.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{r.owner} · {rs(r.amount_paise)}</p>
                  <p className="text-xs text-gray-500">{r.phone} · code <span className="font-mono">{r.code}</span> · {r.reason ?? "The order came back"}</p>
                </div>
                <Button size="sm" disabled={recovered.isPending} onClick={() => recovered.mutate([r.id])}>Mark deducted</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card padded={false}>
        <CardHeader title="Add a creator" meta="Someone with an audience who is not a friend. She earns cash for every delivered order her code brings." />
        <form className="p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
          onSubmit={(e) => { e.preventDefault(); setFormMsg(null); create.mutate(); }}>
          <Field label="Name" className="sm:w-56"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Priya Rao" /></Field>
          <Field label="Mobile (for UPI)" className="sm:w-44"><Input value={form.phone} inputMode="numeric" maxLength={10} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "") })} placeholder="98xxxxxxxx" /></Field>
          <Field label="Code" hint="Optional - made from her name if blank" className="sm:w-44"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="PRIYA100" /></Field>
          <Button type="submit" variant="primary" disabled={create.isPending || form.name.trim().length < 2 || !phoneOk}>Make code</Button>
        </form>
        {formMsg && <p className="px-4 sm:px-5 pb-4 text-sm text-gray-700">{formMsg}</p>}
      </Card>

      <Card padded={false}>
        <CardHeader title="Codes" meta="Customers get theirs automatically once an order is delivered." />
        {isLoading ? <p className="p-5 text-sm text-gray-500">Loading…</p> : (data?.codes.length ?? 0) === 0 ? (
          <EmptyState title="No codes yet" body="A customer's code appears after her first delivered order. Add a creator above to start." />
        ) : (
          <TableScroll minWidth={720}>
            <table className="w-full">
              <thead className="border-b border-gray-100">
                <tr><th className={th}>Code</th><th className={th}>Owner</th><th className={th}>Orders</th><th className={th}>Waiting</th><th className={th}>Earned</th><th className={th}>Paid</th><th className={th}></th></tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data!.codes.map((c) => (
                  <tr key={c.code}>
                    <td className={`${td} font-mono`}>{c.code}</td>
                    <td className={td}>
                      <span className="block">{c.owner}</span>
                      <span className="text-xs text-gray-500">{c.kind === "creator" ? "Creator · cash" : "Customer · store credit"}</span>
                    </td>
                    <td className={`${td} tabular-nums`}>{c.orders}</td>
                    <td className={`${td} tabular-nums`}>{rs(c.pending_paise)}</td>
                    <td className={`${td} tabular-nums`}>{rs(c.earned_paise)}</td>
                    <td className={`${td} tabular-nums`}>{rs(c.paid_paise)}</td>
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        {c.active ? <Pill tone="good">On</Pill> : <Pill>Off</Pill>}
                        <Button size="sm" variant="ghost" onClick={() => toggle.mutate(c)}>{c.active ? "Switch off" : "Switch on"}</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>

      {waiting.length > 0 && (
        <Card padded={false}>
          <CardHeader title="Waiting" meta={`Orders placed with a code. Each is earned only when the order is delivered and ${rules?.hold_days ?? 14} days have passed; a cancelled, refused or returned order earns nothing.`} />
          <ul className="p-4 sm:p-5 divide-y divide-gray-100">
            {waiting.map((r) => (
              <li key={r.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="min-w-0"><span className="font-mono">{r.code}</span> · {r.owner}</span>
                <span className="text-gray-500 text-xs">order {rs(r.order_total_paise)} · {r.order_status.toLowerCase().replace("_", " ")} · {rs(r.amount_paise)} {r.kind === "cash" ? "cash" : "credit"}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      </div>
    </Page>
  );
}
