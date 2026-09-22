"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, MessageCircle, ShieldCheck, Truck } from "lucide-react";
import { api } from "@/lib/api";
import { useCartStore } from "@/store/useCartStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/components/ui/ToastProvider";
import { formatPrice } from "@/lib/queries/catalog";
import { trackEvent } from "@/lib/queries/analytics";
import { BROWSE_ONLY, whatsappCartUrl } from "@/lib/launchMode";
import { recordEnquiry } from "@/lib/enquiry";
import { INDIAN_STATES } from "@/lib/india";
import { POLICY_TERMS } from "@/lib/legal";
import { arrivalDate, clearExpressItem, getExpressItem, recallBuyer, rememberBuyer } from "@/lib/buyNow";
import type { CartItem } from "@/store/useCartStore";
import { Weave } from "@/components/Weave";
import type { WeaveSpec } from "@/lib/weave";

declare global {
  interface Window { Razorpay: any }
}

/**
 * Checkout, without a login wall.
 *
 * A first-time buyer gives a name, a phone and an address and pays. No
 * account is required, because an account was never what protected this
 * shop: an unconfirmed COD order cannot be dispatched, and a prepaid order
 * is proven by the payment. Signed-in details prefill the form, and the
 * order attaches to that phone either way, so it appears in her history.
 *
 * Prepaid is presented first and recommended. That is not a dark pattern -
 * cash on delivery genuinely costs the shop more (a courier COD fee, and a
 * refused parcel is freight paid twice for nothing), and saying so plainly
 * is fairer than burying it. COD stays one tap away.
 *
 * Payment is confirmed by Razorpay's webhook, not by this page. The browser
 * telling us "it worked" is advisory; the signed server-to-server callback
 * is the truth, and it is the only thing that moves an order to PAID.
 */
type Step = "bag" | "details" | "pay" | "done";

const STEPS: Array<[Step, string]> = [["bag", "Bag"], ["details", "Details"], ["pay", "Payment"]];

interface Serviceability {
  serviceable: boolean;
  cod_available: boolean;
  estimated_days: number | null;
  source: string;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const user = useAuthStore((s) => s.user);
  const bagItems = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clearCart);

  // Buy now arrives with one piece in session storage and ?express=1. Read
  // after mount: the server cannot see either, and useSearchParams would
  // force this page out of static rendering for one flag.
  const [express, setExpress] = useState<CartItem | null>(null);
  const [ready, setReady] = useState(false);
  const items = express ? [express] : bagItems;
  // What she bought, kept for the confirmation after the bag is cleared.
  const [bought, setBought] = useState<CartItem | null>(null);
  const [weave, setWeave] = useState<WeaveSpec | null>(null);
  // True when her details came from a previous order on this device, so the
  // pay screen can show them as a card rather than a form.
  const [remembered, setRemembered] = useState(false);

  const [step, setStep] = useState<Step>("bag");
  const [placing, setPlacing] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"RAZORPAY" | "COD">("RAZORPAY");
  const [pin, setPin] = useState<Serviceability | null>(null);
  const [checkingPin, setCheckingPin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "", phone: "", line1: "", line2: "", city: "", state: "Karnataka", pincode: "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    const isExpress = new URLSearchParams(window.location.search).get("express") === "1";
    const item = isExpress ? getExpressItem() : null;
    if (item) setExpress(item);
    const buyer = recallBuyer();
    if (buyer) {
      setForm({ ...buyer, line2: buyer.line2 ?? "" });
      setRemembered(true);
    }
    // The fastest honest path: a returning buyer on Buy now lands on Pay,
    // with the piece, her address and one button. A new buyer on Buy now
    // skips the bag step she has no use for.
    if (item) setStep(buyer ? "pay" : "details");
    setReady(true);
  }, []);

  // Prefill from the account when there is one. Never overwrite typing.
  useEffect(() => {
    if (!user) return;
    setForm((f) => ({
      ...f,
      name: f.name || user.name || "",
      phone: f.phone || (user.phone ?? "").replace(/^\+91/, ""),
    }));
  }, [user]);

  const totalRupees = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const arrives = arrivalDate(pin?.serviceable ? pin.estimated_days : null);
  const totalPaise = Math.round(totalRupees * 100);

  // Serviceability, once the pincode is complete. Fails open by design on the
  // API side, so a Shiprocket outage never blocks a sale.
  useEffect(() => {
    if (form.pincode.length !== 6) { setPin(null); return; }
    let cancelled = false;
    setCheckingPin(true);
    api.get(`/checkout/pincode/${form.pincode}/check`)
      .then((r) => { if (!cancelled) setPin(r.data); })
      .catch(() => { if (!cancelled) setPin(null); })
      .finally(() => { if (!cancelled) setCheckingPin(false); });
    return () => { cancelled = true; };
  }, [form.pincode]);

  // A courier that will not carry cash to this pincode must not be offered it.
  useEffect(() => {
    if (pin && !pin.cod_available && paymentMethod === "COD") setPaymentMethod("RAZORPAY");
  }, [pin, paymentMethod]);

  const detailsValid = useMemo(() => (
    form.name.trim().length >= 2 &&
    /^[6-9]\d{9}$/.test(form.phone.trim()) &&
    form.line1.trim().length >= 4 &&
    form.city.trim().length >= 2 &&
    INDIAN_STATES.includes(form.state) &&
    /^\d{6}$/.test(form.pincode)
  ), [form]);

  async function placeOrder() {
    setPlacing(true); setError(null);
    try {
      const res = await api.post("/checkout/guest", {
        name: form.name.trim(),
        phone: `+91${form.phone.trim()}`,
        items: items.map((i) => ({ variant_id: i.id, quantity: i.quantity })),
        address: {
          line1: form.line1.trim(),
          line2: form.line2.trim() || null,
          city: form.city.trim(),
          state: form.state,
          pincode: form.pincode,
        },
        payment_method: paymentMethod,
        idempotency_key: `zisun-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      });
      const { order_id, razorpay_order_id, razorpay_key_id, total_amount } = res.data;
      trackEvent("checkout_initiated", { order_id, payment_method: paymentMethod, amount: total_amount });

      if (paymentMethod === "COD" || !razorpay_order_id) {
        finish(order_id);
        return;
      }
      if (!window.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://checkout.razorpay.com/v1/checkout.js";
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Could not reach Razorpay"));
          document.body.appendChild(s);
        });
      }
      const rzp = new window.Razorpay({
        key: razorpay_key_id,
        amount: total_amount,
        currency: "INR",
        order_id: razorpay_order_id,
        name: "ZISUN",
        description: `${items.length} ${items.length === 1 ? "piece" : "pieces"}`,
        prefill: { name: form.name.trim(), contact: form.phone.trim() },
        theme: { color: "#7A1F3A" },
        // The webhook is what marks this order PAID. This handler only moves
        // the customer along; if the tab dies here the order still completes.
        handler: () => finish(order_id),
        modal: { ondismiss: () => { setPlacing(false); showToast("Payment cancelled — your bag is safe", "info"); } },
      });
      rzp.open();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "We could not place that order. Please try again.");
      setPlacing(false);
    }
  }

  function finish(id: string) {
    setOrderId(id);
    setBought(items[0] ?? null);
    setStep("done");
    setPlacing(false);
    // Remembered only once an order has actually been placed, so an abandoned
    // form leaves nothing behind on her device.
    rememberBuyer({ ...form, name: form.name.trim(), phone: form.phone.trim() });
    // Buy now empties its own lane and nothing else; the bag she was
    // building is still there when she comes back.
    if (express) clearExpressItem(); else clearCart();
    try { navigator.vibrate?.([10, 60, 20]); } catch { /* unsupported */ }
  }

  // Nothing is decided until storage has been read, or a Buy now arrival
  // would flash "Your bag is empty" before its piece loads.
  if (!ready) return <Shell><div className="py-24" /></Shell>;

  // ── Empty bag ─────────────────────────────────────────────────────────────
  if (items.length === 0 && step !== "done") {
    return (
      <Shell>
        <div className="px-5 py-20 text-center">
          <p className="font-display text-2xl text-ink">Your bag is empty.</p>
          <button onClick={() => router.push("/shop")} className="mt-5 bg-burgundy text-white px-6 py-3 rounded-full text-sm font-semibold">
            See the collection
          </button>
        </div>
      </Shell>
    );
  }

  // ── Confirmation ──────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <Shell>
        <div className="px-5 py-12 text-center max-w-md mx-auto">
          {/* The reward. Her piece's own cloth weaves itself in front of her -
              the same weave, with the same number, as on its product page -
              so the moment of buying ends on something that is hers, not on
              a receipt. Falls back to the tick when there is no piece. */}
          {bought?.productId ? (
            <div className="mx-auto w-full max-w-[280px]">
              <div className="aspect-[4/3] rounded-lg overflow-hidden bg-rose">
                <Weave seed={bought.productId} colours={[bought.color]} mode="enter" label="The weave of the piece you just bought" onSpec={setWeave} />
              </div>
              {weave && <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-muted tabular-nums">Weave No. {weave.code} · yours</p>}
            </div>
          ) : (
            <div className="w-14 h-14 rounded-full bg-burgundy/10 flex items-center justify-center mx-auto">
              <Check className="w-7 h-7 text-burgundy" />
            </div>
          )}
          <h1 className="mt-6 font-display text-[34px] leading-tight text-ink">It&rsquo;s yours.</h1>
          {bought && <p className="mt-2 text-sm text-ink">{bought.name}{bought.size ? ` · ${bought.size}` : ""}</p>}
          {arrives && <p className="mt-1 text-sm text-ink">Usually with you by <span className="font-semibold">{arrives}</span></p>}
          <p className="mt-3 text-sm text-muted leading-relaxed">
            {paymentMethod === "COD"
              ? "We will message you on WhatsApp shortly to confirm the order before it is packed."
              : "Your payment is being confirmed. We will message you on WhatsApp once it is packed."}
          </p>
          {orderId && <p className="mt-4 text-xs text-muted">Order reference <span className="font-mono text-ink">{orderId.slice(0, 8).toUpperCase()}</span></p>}
          <button onClick={() => router.push("/shop")} className="mt-8 border border-line text-ink px-6 py-3 rounded-full text-sm font-semibold">
            Keep looking
          </button>
        </div>
      </Shell>
    );
  }

  // ── Browse mode: the API refuses orders, so do not pretend otherwise ──────
  if (BROWSE_ONLY) {
    const href = whatsappCartUrl(items, totalRupees, typeof window !== "undefined" ? window.location.origin : undefined);
    return (
      <Shell>
        <div className="px-5 py-16 text-center max-w-md mx-auto">
          <h1 className="font-display text-[28px] text-ink">Orders are on WhatsApp for now</h1>
          <p className="mt-3 text-sm text-muted">Online checkout opens shortly. Send your bag over and we will confirm everything there.</p>
          {href && (
            <a href={href} target="_blank" rel="noopener noreferrer"
               onClick={() => recordEnquiry({ source: "bag", quantity: items.reduce((s, i) => s + i.quantity, 0), total_paise: totalPaise })}
               className="mt-6 inline-flex items-center gap-2 bg-burgundy text-white px-6 py-3.5 rounded-full text-sm font-semibold">
              <MessageCircle className="w-4 h-4" /> Order on WhatsApp
            </a>
          )}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="px-5 lg:px-8 max-w-2xl mx-auto pb-32">
        <Steps current={step} express={Boolean(express)} />

        {error && <p className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-sm text-red-800">{error}</p>}

        {/* 1. Bag */}
        {step === "bag" && (
          <section>
            <h1 className="font-display text-[30px] text-ink mb-5">Your bag</h1>
            <ul className="space-y-4">
              {items.map((i) => (
                <li key={i.id} className="flex gap-3.5">
                  <div className="relative w-16 h-20 rounded-card overflow-hidden bg-rose shrink-0">
                    {i.image && <Image src={i.image} alt="" fill sizes="64px" className="object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink leading-snug">{i.name}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {[i.size && `Size ${i.size}`, i.color].filter(Boolean).join(" · ")}{i.quantity > 1 ? ` · ×${i.quantity}` : ""}
                    </p>
                  </div>
                  <p className="text-sm text-ink tabular-nums">{formatPrice(Math.round(i.price * 100) * i.quantity)}</p>
                </li>
              ))}
            </ul>
            <Total total={totalPaise} />
            <Primary onClick={() => setStep("details")}>Continue</Primary>
          </section>
        )}

        {/* 2. Details */}
        {step === "details" && (
          <section>
            <h1 className="font-display text-[30px] text-ink mb-1">Where to?</h1>
            <p className="text-sm text-muted mb-5">No account needed. We use your number to confirm the order.</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Full name" className="col-span-2"><input className={input} value={form.name} onChange={set("name")} autoComplete="name" /></Field>
              <Field label="Mobile number" className="col-span-2">
                <div className="flex">
                  <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-line bg-rose text-sm text-ink">+91</span>
                  <input className={`${input} rounded-l-none`} value={form.phone} onChange={set("phone")} inputMode="numeric" maxLength={10} autoComplete="tel-national" />
                </div>
              </Field>
              <Field label="Address" className="col-span-2"><input className={input} value={form.line1} onChange={set("line1")} placeholder="House / flat, street" autoComplete="address-line1" /></Field>
              <Field label="Landmark (optional)" className="col-span-2"><input className={input} value={form.line2} onChange={set("line2")} autoComplete="address-line2" /></Field>
              <Field label="City"><input className={input} value={form.city} onChange={set("city")} autoComplete="address-level2" /></Field>
              <Field label="Pincode"><input className={input} value={form.pincode} onChange={set("pincode")} inputMode="numeric" maxLength={6} autoComplete="postal-code" /></Field>
              <Field label="State" className="col-span-2">
                <select className={input} value={form.state} onChange={set("state")}>
                  {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>

            {checkingPin && <p className="mt-3 text-xs text-muted">Checking delivery…</p>}
            {pin && (
              <p className="mt-3 flex items-start gap-2 text-xs text-muted">
                <Truck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {pin.serviceable
                  ? <span>We deliver here{pin.estimated_days ? `, usually in ${pin.estimated_days} days` : ""}.{!pin.cod_available && " Cash on delivery is not available at this pincode."}</span>
                  : <span>We could not confirm delivery to this pincode. Place the order and we will check before dispatch.</span>}
              </p>
            )}

            <Primary disabled={!detailsValid} onClick={() => setStep("pay")}>Continue to payment</Primary>
            <BackLink onClick={() => (express ? router.back() : setStep("bag"))} />
          </section>
        )}

        {/* 3. Payment */}
        {step === "pay" && (
          <section>
            {/* On Buy now this is the first screen she sees, so it has to
                carry the whole decision: the piece, where it is going, when
                it arrives, and one button. */}
            {express && (
              <div className="mb-5 flex gap-3.5 items-center">
                <div className="relative w-14 h-[70px] rounded-card overflow-hidden bg-rose shrink-0">
                  {express.image && <Image src={express.image} alt="" fill sizes="56px" className="object-cover" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-ink leading-snug">{express.name}</p>
                  <p className="mt-0.5 text-xs text-muted">{[express.size && `Size ${express.size}`, express.color].filter(Boolean).join(" · ")}</p>
                </div>
              </div>
            )}
            {detailsValid && (
              <div className="mb-5 rounded-card border border-line px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <p className="text-xs text-muted">Delivering to</p>
                  <p className="text-ink mt-0.5">{form.name}, +91 {form.phone}</p>
                  <p className="text-muted text-xs mt-0.5 leading-relaxed">{[form.line1, form.line2, form.city, form.pincode].filter(Boolean).join(", ")}</p>
                  {arrives && <p className="text-xs text-ink mt-1.5">Usually with you by <span className="font-semibold">{arrives}</span></p>}
                </div>
                <button onClick={() => { setRemembered(false); setStep("details"); }} className="shrink-0 text-xs text-ink underline underline-offset-4 decoration-burgundy/50">Change</button>
              </div>
            )}
            <h1 className="font-display text-[26px] text-ink mb-4">How would you like to pay?</h1>
            <div className="space-y-3">
              <PayOption
                selected={paymentMethod === "RAZORPAY"}
                onSelect={() => setPaymentMethod("RAZORPAY")}
                title="Pay now"
                subtitle="UPI, card or netbanking — through Razorpay"
                note="Recommended. It is the fastest to dispatch and costs the shop least, which is how a small label keeps prices where they are."
              />
              <PayOption
                selected={paymentMethod === "COD"}
                onSelect={() => setPaymentMethod("COD")}
                disabled={pin ? !pin.cod_available : false}
                title="Cash on delivery"
                subtitle={pin && !pin.cod_available ? "Not available at this pincode" : "Pay the courier when it arrives"}
                note="We will confirm on WhatsApp before packing."
              />
            </div>
            <Total total={totalPaise} />
            <ul className="mt-5 space-y-2 border-t border-line pt-4">
              <Assure Icon={ShieldCheck}>Payments handled by Razorpay. We never see your card or UPI details.</Assure>
              <Assure Icon={Truck}>Free shipping. Dispatched in {POLICY_TERMS.dispatchTimeframe}.</Assure>
              <Assure Icon={MessageCircle}>{POLICY_TERMS.exchangeRaiseWindowHours}h size exchange — message us and we sort it.</Assure>
            </ul>
            <Primary disabled={placing} onClick={placeOrder}>
              {placing ? <><Loader2 className="w-4 h-4 animate-spin" /> Placing…</> : paymentMethod === "COD" ? "Place order" : `Pay ${formatPrice(totalPaise)}`}
            </Primary>
            {!remembered && <BackLink onClick={() => setStep("details")} />}
            {/* The fallback, kept deliberately quiet. Some customers would
                rather talk to a person before paying a label they have not
                bought from; sending them to WhatsApp is better than losing
                them at the last step. */}
            {(() => {
              const href = whatsappCartUrl(items, totalRupees, typeof window !== "undefined" ? window.location.origin : undefined);
              return href ? (
                <a href={href} target="_blank" rel="noopener noreferrer"
                   onClick={() => recordEnquiry({ source: "bag", quantity: items.reduce((s, i) => s + i.quantity, 0), total_paise: totalPaise })}
                   className="mt-4 block text-center text-xs text-muted underline underline-offset-4 decoration-line hover:text-ink">
                  or send this bag to us on WhatsApp instead
                </a>
              ) : null;
            })()}
          </section>
        )}
      </div>
    </Shell>
  );
}

// ── pieces ──────────────────────────────────────────────────────────────────

const input = "w-full h-11 rounded-lg border border-line bg-white px-3 text-[15px] text-ink focus:outline-none focus:ring-2 focus:ring-burgundy/25 focus:border-burgundy";

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="w-full bg-background min-h-screen pt-6">{children}</div>;
}

function Steps({ current, express = false }: { current: Step; express?: boolean }) {
  // Buy now never visits the bag, so it is not shown as a step she skipped.
  const steps = express ? STEPS.filter(([s]) => s !== "bag") : STEPS;
  const idx = steps.findIndex(([s]) => s === current);
  return (
    <ol className="flex items-center gap-2 mb-7 text-[11px] uppercase tracking-[0.16em]">
      {steps.map(([s, label], i) => (
        <li key={s} className="flex items-center gap-2">
          <span className={i <= idx ? "text-burgundy font-semibold" : "text-muted"}>{label}</span>
          {i < steps.length - 1 && <span className="text-ink/20">—</span>}
        </li>
      ))}
    </ol>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs text-muted mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function Total({ total }: { total: number }) {
  return (
    <div className="mt-6 border-t border-line pt-4">
      {/* A zero line she can see. "Free" beside shipping is the one moment
          in checkout where the total gets no bigger than the price she
          already accepted, and it is worth showing rather than implying. */}
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted">Shipping</span>
        <span className="text-ink font-medium">Free</span>
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-sm text-muted">Total</span>
        <span className="font-display text-[26px] text-ink tabular-nums">{formatPrice(total)}</span>
      </div>
    </div>
  );
}

function Primary({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="mt-6 w-full bg-burgundy text-white py-4 rounded-full font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-burgundy-deep transition-colors">
      {children}
    </button>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mt-3 w-full text-center text-xs text-muted inline-flex items-center justify-center gap-1.5 hover:text-ink">
      <ArrowLeft className="w-3.5 h-3.5" /> Back
    </button>
  );
}

function PayOption({ selected, onSelect, title, subtitle, note, disabled }: {
  selected: boolean; onSelect: () => void; title: string; subtitle: string; note: string; disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onSelect} disabled={disabled}
      className={`w-full text-left rounded-card border p-4 transition-colors disabled:opacity-45 ${selected ? "border-burgundy bg-burgundy/[0.04]" : "border-line bg-white hover:border-ink/30"}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 ${selected ? "border-burgundy bg-burgundy" : "border-ink/25"}`} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="text-xs text-muted mt-0.5">{subtitle}</p>
          <p className="text-[11px] text-muted mt-1.5 leading-relaxed">{note}</p>
        </div>
      </div>
    </button>
  );
}

function Assure({ Icon, children }: { Icon: typeof Truck; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-xs text-muted">
      <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-ink/50" strokeWidth={1.8} />
      <span>{children}</span>
    </li>
  );
}
