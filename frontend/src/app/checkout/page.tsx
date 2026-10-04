"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, MapPin, MessageCircle, ShieldCheck, Tag, Truck } from "lucide-react";
import { api } from "@/lib/api";
import { useCartStore } from "@/store/useCartStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/components/ui/ToastProvider";
import { formatPrice } from "@/lib/queries/catalog";
import { trackEvent } from "@/lib/queries/analytics";
import { useCheckoutPolicy } from "@/lib/queries/policy";
import { attributionFields } from "@/lib/attribution";
import { BROWSE_ONLY, whatsappCartUrl } from "@/lib/launchMode";
import { recordEnquiry } from "@/lib/enquiry";
import { INDIAN_STATES } from "@/lib/india";
import { useAddresses, type Address } from "@/lib/queries/address";
import { POLICY_TERMS } from "@/lib/legal";
import { arrivalDate, clearExpressItem, getExpressItem, recallBuyer, rememberBuyer } from "@/lib/buyNow";
import type { CartItem } from "@/store/useCartStore";
import { ClothWeave } from "@/components/ClothWeave";
import { clearReferral, storedReferral } from "@/lib/referral";
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
  /** What the pincode itself knows — India Post, free and authoritative. */
  city?: string | null;
  state?: string | null;
  localities?: string[];
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
  // Shared only if she taps. Never asked for on load: a permission prompt
  // nobody invited is the fastest way to be refused for good.
  const [coords, setCoords] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [checkingPin, setCheckingPin] = useState(false);
  // What "Use my current location" filled in, so she can see it and check it.
  const [located, setLocated] = useState<{ filled: string[]; attribution: string } | null>(null);
  const line1Ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "", phone: "", email: "", line1: "", line2: "", city: "", state: "Karnataka", pincode: "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const formRef = useRef(form);
  formRef.current = form;

  /**
   * One tap: the phone's position becomes the address, less the door.
   *
   * The server turns the coordinates into pincode, road, area, city and
   * state (services/geocode.py - OpenStreetMap, with the pincode confirmed by
   * India Post). Only blank fields are filled; anything she has typed wins.
   * The house number is never filled, because the nearest mapped building is
   * not her house - the cursor is put at the start of the address line
   * instead, where the flat number goes. Still only on her tap: a permission
   * prompt nobody invited is the fastest way to be refused for good.
   */
  async function fillFromLocation() {
    setLocationError(null); setLocated(null);
    if (!navigator.geolocation) { setLocationError("This browser cannot share a location. Please type the address."); return; }
    setLocating(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }));
      const acc = Math.round(pos.coords.accuracy ?? 0);
      // A fix coarser than a kilometre is a cell tower, not a doorstep.
      if (acc > 1000) { setLocationError("Your phone could not place you accurately. Please type the address."); return; }
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      setCoords({ lat, lng, acc });
      const { data } = await api.get("/checkout/locate", { params: { lat, lng } });
      if (!data?.found) {
        setLocationError("Location saved for the delivery person, but we could not read a street address there. Please type it.");
        return;
      }
      const f = formRef.current;
      const next = { ...f };
      const filled: string[] = [];
      const take = (k: "pincode" | "line1" | "line2" | "city", v: string | null | undefined, label: string) => {
        if (v && !f[k].trim()) { next[k] = v; filled.push(label); }
      };
      take("pincode", data.pincode, "pincode");
      take("line1", data.line1, "street");
      take("line2", data.locality, "area");
      take("city", data.city, "city");
      if (data.state && INDIAN_STATES.includes(data.state) && (!f.pincode || f.pincode === data.pincode) && f.state !== data.state) {
        next.state = data.state; filled.push("state");
      }
      setForm(next);
      setLocated({ filled, attribution: data.attribution });
      trackEvent("address_located", { filled: filled.length, accuracy_m: acc });
      if (!f.line1.trim() && data.line1) {
        setTimeout(() => { const el = line1Ref.current; if (el) { el.focus(); el.setSelectionRange(0, 0); } }, 60);
      }
    } catch (e) {
      // Denied, timed out, or the lookup failed: the form is exactly as it was.
      const denied = typeof e === "object" && e !== null && "code" in e && (e as GeolocationPositionError).code === 1;
      setLocationError(denied ? "Location not shared — please type the address." : "We could not find your location. Please type the address.");
    } finally {
      setLocating(false);
    }
  }

  useEffect(() => {
    const isExpress = new URLSearchParams(window.location.search).get("express") === "1";
    const item = isExpress ? getExpressItem() : null;
    if (item) setExpress(item);
    const buyer = recallBuyer();
    if (buyer) {
      setForm((f) => ({ ...f, ...buyer, email: buyer.email ?? "", line2: buyer.line2 ?? "" }));
      setRemembered(true);
    }
    // The fastest honest path: a returning buyer on Buy now lands on Pay,
    // with the piece, her address and one button. A new buyer on Buy now
    // skips the bag step she has no use for.
    if (item) setStep(buyer ? "pay" : "details");
    setReady(true);
  }, []);

  // Her saved addresses, when she is signed in. The checkout this replaced
  // let her pick one; the rewrite lost that and made a returning customer
  // type her address again. Her default fills the form when nothing else
  // has; any of them is one tap below the heading.
  const { data: savedAddresses } = useAddresses();
  const pickAddress = (a: Address) => setForm((f) => ({
    ...f, line1: a.line1, line2: a.line2 ?? "", city: a.city,
    state: INDIAN_STATES.includes(a.state) ? a.state : f.state, pincode: a.pincode,
  }));
  useEffect(() => {
    if (!savedAddresses?.length) return;
    setForm((f) => {
      if (f.line1.trim()) return f; // typed or remembered - hers wins
      const a = savedAddresses.find((x) => x.is_default) ?? savedAddresses[0];
      return { ...f, line1: a.line1, line2: a.line2 ?? "", city: a.city, state: INDIAN_STATES.includes(a.state) ? a.state : f.state, pincode: a.pincode };
    });
  }, [savedAddresses]);

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
  // Free when she pays online; the COD charge otherwise. The server adds the
  // same charge to the order total (services/pricing.py) - this is the line
  // she sees before choosing, so the choice is made with the number in view.
  const { data: policy } = useCheckoutPolicy();
  // From the API, never a constant. The fee is configuration on the server;
  // a page that keeps its own copy will one day quote a price the invoice
  // does not match. Falls back to the documented default only until the
  // policy call returns.
  const codShippingPaise = policy?.cod_fee_paise ?? POLICY_TERMS.codShippingRupees * 100;
  const shippingPaise = paymentMethod === "COD" ? codShippingPaise : 0;
  const totalPaise = Math.round(totalRupees * 100);

  // A code (a friend's, a creator's, or an advertised coupon) and her own
  // store credit. The code is checked by the server before anything is
  // placed and the answer is shown as a sentence, so a code that does not
  // apply never stops the order - it is simply left off.
  const [code, setCode] = useState("");
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeResult, setCodeResult] = useState<{ ok: boolean; code?: string; discount_paise: number; message: string } | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);
  const [credit, setCredit] = useState(0);
  const [useCredit, setUseCredit] = useState(true);
  useEffect(() => {
    const carried = storedReferral();
    if (carried) { setCode(carried); setCodeOpen(true); }
  }, []);
  useEffect(() => {
    if (!user) { setCredit(0); return; }
    api.get("/referrals/me").then((r) => setCredit(r.data?.credit_paise ?? 0)).catch(() => setCredit(0));
  }, [user]);
  async function checkCode(value = code) {
    const c = value.trim();
    if (!c) { setCodeResult(null); return; }
    setCheckingCode(true);
    try {
      const phone = /^[6-9]\d{9}$/.test(form.phone.trim()) ? `+91${form.phone.trim()}` : undefined;
      const r = await api.post("/checkout/coupon-preview", {
        code: c, subtotal_paise: totalPaise, phone,
        // A friend's code is for a household new to ZISUN, so the address is part of the question.
        line1: form.line1.trim() || undefined, pincode: /^\d{6}$/.test(form.pincode) ? form.pincode : undefined,
      });
      setCodeResult(r.data);
    } catch {
      setCodeResult({ ok: false, discount_paise: 0, message: "Could not check that code just now. You can still place the order." });
    } finally {
      setCheckingCode(false);
    }
  }
  // Checked again whenever the bag or the buyer changes, and the first time
  // the pay step opens with a code carried in from a shared link.
  useEffect(() => {
    if (step === "pay" && code.trim()) void checkCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, totalPaise, form.phone, form.line1, form.pincode]);
  const discountPaise = codeResult?.ok ? codeResult.discount_paise : 0;
  // Mirrors the server: credit never takes the goods below one rupee.
  const creditPaise = user && useCredit ? Math.max(0, Math.min(credit, totalPaise - discountPaise - 100)) : 0;
  const payablePaise = Math.max(0, totalPaise - discountPaise - creditPaise);

  // Reaching checkout with something in the bag is its own step. Until now
  // the first thing recorded here was `checkout_initiated`, which fires only
  // *after* the order POST succeeds - so everyone who arrived, read the
  // total and left was indistinguishable from someone who never came. The
  // gap between this and checkout_initiated is the form itself: shipping
  // cost, the address fields, the COD fee.
  const seenCheckout = useRef(false);
  useEffect(() => {
    if (!ready || seenCheckout.current || items.length === 0) return;
    seenCheckout.current = true;
    trackEvent("checkout_viewed", {
      items: items.length,
      units: items.reduce((s, i) => s + i.quantity, 0),
      amount: totalPaise,
      express,
    });
  }, [ready, items, totalPaise, express]);

  // Serviceability, once the pincode is complete. Fails open by design on the
  // API side, so a Shiprocket outage never blocks a sale.
  useEffect(() => {
    if (form.pincode.length !== 6) { setPin(null); return; }
    let cancelled = false;
    setCheckingPin(true);
    api.get(`/checkout/pincode/${form.pincode}/check`)
      .then((r) => {
        if (cancelled) return;
        setPin(r.data);
        // The pincode is authoritative for city and state, so stop asking
        // her for what it already says. A wrong city for a PIN is a parcel
        // the courier returns - and it is an honest mistake to make from a
        // dropdown. Only ever fills a blank or corrects a mismatch; typing
        // over it afterwards still wins, because she may know better than
        // the district name.
        const { city, state } = r.data ?? {};
        setForm((f) => ({
          ...f,
          city: city && !f.city.trim() ? city : f.city,
          state: state && INDIAN_STATES.includes(state) ? state : f.state,
        }));
      })
      .catch(() => { if (!cancelled) setPin(null); })
      .finally(() => { if (!cancelled) setCheckingPin(false); });
    return () => { cancelled = true; };
  }, [form.pincode]);

  // A courier that will not carry cash to this pincode must not be offered it,
  // and neither must an order above the COD limit - the server refuses both,
  // and the old checkout said so up front. The new one lost that line and let
  // her find out at the last tap.
  const codOverLimit = items.reduce((s, i) => s + i.price * i.quantity, 0) > POLICY_TERMS.codMaxRupees;
  useEffect(() => {
    if (((pin && !pin.cod_available) || codOverLimit) && paymentMethod === "COD") setPaymentMethod("RAZORPAY");
  }, [pin, paymentMethod, codOverLimit]);

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
          ...(coords ? { latitude: coords.lat, longitude: coords.lng, location_accuracy_m: coords.acc } : {}),
          line2: form.line2.trim() || null,
          city: form.city.trim(),
          state: form.state,
          pincode: form.pincode,
        },
        email: form.email.trim() || null,
        payment_method: paymentMethod,
        coupon_code: codeResult?.ok ? codeResult.code : null,
        apply_credit: creditPaise > 0,
        idempotency_key: `zisun-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        // Where she came from, kept on the order itself: events age out of
        // usefulness, an order is permanent, and revenue by channel is the
        // only version of this question worth answering.
        ...attributionFields(),
      });
      const { order_id, razorpay_order_id, razorpay_key_id, total_amount } = res.data;
      if (codeResult?.ok) clearReferral();
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
        // Closing the sheet is a decision, not a failure. Recorded separately
        // so "payment problems" and "changed her mind" never share a number.
        modal: {
          ondismiss: () => {
            setPlacing(false);
            trackEvent("payment_dismissed", { order_id, amount: total_amount });
            showToast("Payment cancelled — your bag is safe", "info");
          },
        },
      });
      // A declined card used to be completely invisible: no handler, no event,
      // and the order simply rested in PAYMENT_PENDING looking identical to an
      // abandoned one. Razorpay's reason codes are the only place the *why*
      // exists, and they are the difference between "our gateway is broken"
      // and "her bank said no".
      rzp.on("payment.failed", (resp: { error?: Record<string, string> }) => {
        const e = resp?.error ?? {};
        trackEvent("payment_failed", {
          order_id,
          amount: total_amount,
          reason: e.reason ?? null,
          code: e.code ?? null,
          step: e.step ?? null,
          // Razorpay's error source (customer, bank, gateway). Not `source`:
          // attribution owns that name and was overwriting this one.
          error_source: e.source ?? null,
          description: e.description ?? null,
        });
      });
      trackEvent("payment_sheet_opened", { order_id, amount: total_amount });
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
                <ClothWeave seed={bought.productId} colours={[bought.color]} label="The ZISUN mark of the piece you just bought" onSpec={setWeave} />
              </div>
              {weave && <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-muted tabular-nums">Mark No. {weave.code} · yours</p>}
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
          {/* The one exchange step that has to happen before it is needed.
              It used to sit in the size guide as a warning; here it is a tip,
              after the purchase, when she can act on it. */}
          <p className="mt-4 text-xs text-muted leading-relaxed">
            When it arrives, take a quick video as you open the parcel — it makes any size swap quick.
          </p>
          {orderId && (
            <>
              <p className="mt-4 text-xs text-muted">Order reference <span className="font-mono text-ink">{orderId.slice(0, 8).toUpperCase()}</span></p>
              {/* The answer to "where is my order", given before she has to
                  ask it. Without this the only way to find out was a WhatsApp
                  message to the founder. Bookmarkable, and no sign-in: a
                  guest who bought in one tap has no account to sign in to. */}
              <button
                onClick={() => router.push(`/order/${orderId}`)}
                className="mt-8 bg-burgundy text-white px-6 py-3 rounded-full text-sm font-semibold"
              >
                Track this order
              </button>
              <p className="mt-2 text-[11px] text-muted">Save this page &mdash; it is how you follow the parcel.</p>
            </>
          )}
          <button onClick={() => router.push("/shop")} className="mt-4 border border-line text-ink px-6 py-3 rounded-full text-sm font-semibold">
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
            <Total total={totalPaise} shipping={null} />
            {/* A buyer this device remembers goes straight to Pay, where her
                details show as a card with "Change" - the same short path
                Buy now already gave her. */}
            <Primary onClick={() => setStep(remembered && detailsValid ? "pay" : "details")}>Continue</Primary>
          </section>
        )}

        {/* 2. Details */}
        {step === "details" && (
          <section>
            {/* A real form, with shipping-section autofill tokens: Chrome and
                Safari then fill every field below from one tap on a saved
                profile - which most phones already carry for their owner. */}
            <form
              autoComplete="on"
              onSubmit={(e) => { e.preventDefault(); if (detailsValid) setStep("pay"); }}
            >
            <h1 className="font-display text-[30px] text-ink mb-1">Where to?</h1>
            <p className="text-sm text-muted mb-5">No account needed. We use your number to confirm the order.</p>
            {savedAddresses && savedAddresses.length > 0 && (
              <div className="mb-5">
                <p className="text-xs text-muted mb-2">Your saved addresses</p>
                <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
                  {savedAddresses.map((a) => {
                    const on = form.line1.trim() === a.line1.trim() && form.pincode === a.pincode;
                    return (
                      <button key={a.id} type="button" onClick={() => pickAddress(a)}
                        className={`shrink-0 max-w-[220px] rounded-card border px-3 py-2.5 text-left text-xs leading-snug ${on ? "border-ink bg-rose" : "border-line hover:border-ink/40"}`}>
                        <span className="block text-ink line-clamp-2">{[a.line1, a.line2].filter(Boolean).join(", ")}</span>
                        <span className="block text-muted mt-0.5">{a.city} {a.pincode}{a.is_default ? " · default" : ""}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Full name" className="col-span-2"><input className={input} name="name" value={form.name} onChange={set("name")} autoComplete="shipping name" /></Field>
              <Field label="Mobile number" className="col-span-2">
                <div className="flex">
                  <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-line bg-rose text-sm text-ink">+91</span>
                  <input className={`${input} rounded-l-none`} name="tel" type="tel" value={form.phone} onChange={set("phone")} inputMode="numeric" maxLength={10} autoComplete="shipping tel-national" />
                </div>
              </Field>
              <Field label="Email (optional)" className="col-span-2">
                <input className={input} type="email" name="email" value={form.email} onChange={set("email")} placeholder="For your receipt" autoComplete="shipping email" inputMode="email" />
              </Field>
              {/* Location first: one tap fills everything below except the door. */}
              <div className="col-span-2">
                <button
                  type="button"
                  disabled={locating}
                  onClick={fillFromLocation}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-ink/25 bg-white px-4 py-3 text-sm font-medium text-ink disabled:opacity-60"
                >
                  {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4 text-burgundy" />}
                  {locating ? "Finding your address…" : coords ? "Update from my location" : "Use my current location"}
                </button>
                {located && located.filled.length > 0 && (
                  <p className="mt-1.5 text-[11px] text-moss">
                    Filled {located.filled.join(", ")} from your location. Please check them, and add your house or flat number.
                    <span className="block text-muted">Map data {located.attribution}</span>
                  </p>
                )}
                {coords && (
                  <p className="mt-1 text-[11px] text-muted flex items-center gap-1">
                    Pin shared with the delivery person
                    <button type="button" onClick={() => { setCoords(null); setLocated(null); }} className="underline underline-offset-2">remove</button>
                  </p>
                )}
                {locationError && <p className="mt-1 text-[11px] text-muted">{locationError}</p>}
              </div>
              <Field label="Address" className="col-span-2"><input ref={line1Ref} className={input} name="address-line1" value={form.line1} onChange={set("line1")} placeholder="House / flat no., street" autoComplete="shipping address-line1" /></Field>
              <Field label="Landmark (optional)" className="col-span-2"><input className={input} name="address-line2" value={form.line2} onChange={set("line2")} autoComplete="shipping address-line2" /></Field>
              <Field label="City"><input className={input} name="address-level2" value={form.city} onChange={set("city")} autoComplete="shipping address-level2" /></Field>
              <Field label="Pincode"><input className={input} name="postal-code" value={form.pincode} onChange={set("pincode")} inputMode="numeric" maxLength={6} autoComplete="shipping postal-code" /></Field>

              {/* The localities under this pincode, as taps. "Indiranagar"
                  spelled three ways is three addresses to a courier; this
                  makes it one, and saves her typing it at all. */}
              {(pin?.localities?.length ?? 0) > 0 && !form.line2.trim() && (
                <div className="col-span-2 -mt-1">
                  <p className="text-[11px] text-muted mb-1.5">Area</p>
                  <div className="flex flex-wrap gap-1.5">
                    {pin!.localities!.slice(0, 6).map((l) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, line2: l.trim() }))}
                        className="px-2.5 py-1 rounded-full border border-line text-xs text-ink bg-white"
                      >
                        {l.trim()}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Field label="State" className="col-span-2">
                <select className={input} name="address-level1" value={form.state} onChange={set("state")} autoComplete="shipping address-level1">
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

            <Primary type="submit" disabled={!detailsValid}>Continue to payment</Primary>
            <BackLink onClick={() => (express ? router.back() : setStep("bag"))} />
            </form>
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
                badge="Free shipping"
                subtitle="UPI, card or netbanking — through Razorpay"
                note="Dispatched the same day it is packed."
              />
              <PayOption
                selected={paymentMethod === "COD"}
                onSelect={() => setPaymentMethod("COD")}
                disabled={(pin ? !pin.cod_available : false) || codOverLimit}
                title="Cash on delivery"
                subtitle={codOverLimit
                  ? `For orders up to ${formatPrice(POLICY_TERMS.codMaxRupees * 100)}`
                  : pin && !pin.cod_available ? "Not available at this pincode" : "Pay the courier at your door"}
                // Said once, plainly, and as a fact about the courier rather
                // than a charge from us. "+Rs 99 shipping" next to a free
                // option reads as a penalty for choosing wrongly, which is
                // not how anyone should feel while handing over money.
                note={codOverLimit || (pin && !pin.cod_available)
                  ? "We will confirm on WhatsApp before packing."
                  : `The courier charges ${formatPrice(codShippingPaise)} to collect cash at the door, and we pass it on at cost. We will confirm on WhatsApp before packing.`}
              />
            </div>
            <div className="mt-6">
              {!codeOpen ? (
                <button type="button" onClick={() => setCodeOpen(true)} className="inline-flex items-center gap-1.5 min-h-[32px] text-sm text-ink underline underline-offset-4 decoration-burgundy/50">
                  <Tag className="w-3.5 h-3.5" aria-hidden /> Have a code?
                </button>
              ) : (
                <div>
                  <label htmlFor="code" className="text-xs text-muted">Code</label>
                  <div className="mt-1 flex gap-2">
                    <input id="code" className={`${input} uppercase`} value={code} autoCapitalize="characters" autoComplete="off"
                      onChange={(e) => { setCode(e.target.value); setCodeResult(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void checkCode(); } }} />
                    <button type="button" onClick={() => void checkCode()} disabled={checkingCode || !code.trim()}
                      className="shrink-0 h-11 px-4 rounded-lg border border-ink text-sm font-semibold text-ink disabled:opacity-40">
                      {checkingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
                    </button>
                  </div>
                  {codeResult && (
                    <p role="status" className={`mt-2 text-xs ${codeResult.ok ? "text-moss" : "text-muted"}`}>
                      {codeResult.ok ? <Check className="inline w-3.5 h-3.5 mr-1 -mt-0.5" aria-hidden /> : null}{codeResult.message}
                    </p>
                  )}
                </div>
              )}
              {user && credit > 0 && (
                <label className="mt-4 flex items-center gap-2.5 min-h-[32px] text-sm text-ink cursor-pointer">
                  <input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} className="w-4 h-4 accent-burgundy" />
                  Use my store credit ({formatPrice(credit)})
                </label>
              )}
            </div>
            <Total total={payablePaise + shippingPaise} shipping={shippingPaise} discount={discountPaise} credit={creditPaise} />
            {paymentMethod === "COD" && (
              // An offer, not a correction. "Pay online instead and save Rs99"
              // tells her she has just made the expensive choice.
              <button type="button" onClick={() => setPaymentMethod("RAZORPAY")} className="mt-2 text-xs text-burgundy underline underline-offset-4">
                Prefer free delivery? Pay online
              </button>
            )}
            <ul className="mt-5 space-y-2 border-t border-line pt-4">
              <Assure Icon={ShieldCheck}>Payments handled by Razorpay. We never see your card or UPI details.</Assure>
              <Assure Icon={Truck}>Dispatched in {POLICY_TERMS.dispatchTimeframe}.</Assure>
            </ul>
            <Primary disabled={placing} onClick={placeOrder}>
              {placing ? <><Loader2 className="w-4 h-4 animate-spin" /> Placing…</> : paymentMethod === "COD" ? `Place order · ${formatPrice(payablePaise + shippingPaise)}` : `Pay ${formatPrice(payablePaise)}`}
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

/**
 * The total, with shipping as its own line. `shipping` is paise, or null
 * before the payment method is chosen (the bag step), when the honest line
 * is the condition itself: free when she pays online.
 */
function Total({ total, shipping, discount = 0, credit = 0 }: { total: number; shipping: number | null; discount?: number; credit?: number }) {
  return (
    <div className="mt-6 border-t border-line pt-4">
      {discount > 0 && (
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="text-muted">Code</span>
          <span className="text-ink font-medium tabular-nums">−{formatPrice(discount)}</span>
        </div>
      )}
      {credit > 0 && (
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="text-muted">Store credit</span>
          <span className="text-ink font-medium tabular-nums">−{formatPrice(credit)}</span>
        </div>
      )}
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted">Shipping</span>
        <span className="text-ink font-medium">
          {shipping === null ? "Free when you pay online" : shipping === 0 ? "Free" : formatPrice(shipping)}
        </span>
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-sm text-muted">Total</span>
        <span className="font-display text-[26px] text-ink tabular-nums">{formatPrice(total)}</span>
      </div>
    </div>
  );
}

function Primary({ children, onClick, disabled, type = "button" }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit" }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className="mt-6 w-full bg-burgundy text-white py-4 rounded-full font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-burgundy-deep transition-colors">
      {children}
    </button>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-3 w-full text-center text-xs text-muted inline-flex items-center justify-center gap-1.5 hover:text-ink">
      <ArrowLeft className="w-3.5 h-3.5" /> Back
    </button>
  );
}

function PayOption({ selected, onSelect, title, subtitle, note, disabled, badge }: {
  selected: boolean; onSelect: () => void; title: string; subtitle: string; note: string; disabled?: boolean; badge?: string;
}) {
  return (
    <button type="button" onClick={onSelect} disabled={disabled}
      className={`w-full text-left rounded-card border p-4 transition-colors disabled:opacity-45 ${selected ? "border-burgundy bg-burgundy/[0.04]" : "border-line bg-white hover:border-ink/30"}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 ${selected ? "border-burgundy bg-burgundy" : "border-ink/25"}`} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            {title}
            {badge && <span className="ml-2 align-middle rounded-full bg-burgundy/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-burgundy">{badge}</span>}
          </p>
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
