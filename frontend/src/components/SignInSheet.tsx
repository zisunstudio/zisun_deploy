"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import type { ConfirmationResult } from "firebase/auth";

import { api } from "@/lib/api";
import { FIREBASE_ENABLED } from "@/lib/firebaseEnabled";
import { recallBuyer } from "@/lib/buyNow";
import { trackEvent } from "@/lib/queries/analytics";
import { useAuthStore } from "@/store/useAuthStore";
import { useSignInPrompt } from "@/store/useSignInPrompt";

/**
 * Sign in without leaving the page.
 *
 * The founder's brief: a shopper should never be sent to a separate login
 * page. While she is looking at pieces, a small card rises and she signs in
 * inside it, in as few taps as a website is allowed:
 *
 *   1. Her number. A website cannot read the SIM - browsers forbid it - so
 *      the closest to automatic is: the number she ordered with on this
 *      phone (remembered at checkout), else the browser's own autofill,
 *      which offers the phone's number as one tap.
 *   2. The code. No browser lets a site read an SMS without the owner's
 *      consent, so "silent" is one tap: the field is marked one-time-code,
 *      the keyboard offers the code the moment the SMS lands, and it
 *      verifies itself at six digits. (Android's WebOTP sheet needs an
 *      origin line in the SMS that Firebase, the live sender, does not
 *      write.)
 *
 * SMS is sometimes slow, so the card says it is waiting, counts, offers a
 * resend at 30 s, and records how long each code took to arrive - sent,
 * filled (and whether by the keyboard or by hand), verified, resent - so a
 * slow delivery shows up in the numbers instead of as a shopper who left.
 *
 * It asks once per visit, only on shopping pages, only after she has
 * looked around (12 s and a scroll), and not again for a week if she
 * closes it. On a product page it sits above the Buy bar, never over it.
 * Firebase is loaded only when the card opens.
 */

const DISMISS_KEY = "zisun-signin-dismissed";
const SESSION_KEY = "zisun-signin-asked";
const QUIET_DAYS = 7;
const DELAY_MS = 12_000;
const RESEND_AFTER_S = 30;
const CONTAINER = "recaptcha-sheet";

const SHOP_PATHS = [/^\/$/, /^\/shop/, /^\/category\//, /^\/product\//, /^\/journal/];

function recentlyDismissed(): boolean {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - t < QUIET_DAYS * 86_400_000;
  } catch { return false; }
}

function askedThisVisit(): boolean {
  try { return sessionStorage.getItem(SESSION_KEY) === "1"; } catch { return false; }
}

function masked(phone: string): string {
  return phone.length === 10 ? `${phone.slice(0, 2)}•••••${phone.slice(7)}` : phone;
}

export function SignInSheet() {
  const pathname = usePathname() || "/";
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const sessionChecked = useAuthStore((s) => s.sessionChecked);
  const setAuth = useAuthStore((s) => s.setAuth);
  const { open, reason, show, hide } = useSignInPrompt();

  const [phone, setPhone] = useState("");
  const [known, setKnown] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [waited, setWaited] = useState(0);
  const [lift, setLift] = useState(0);
  const sentAt = useRef(0);
  const codeRef = useRef<HTMLInputElement>(null);

  const onShopPage = SHOP_PATHS.some((r) => r.test(pathname));

  // The gentle ask: once a visit, after she has looked around.
  useEffect(() => {
    if (!FIREBASE_ENABLED || !sessionChecked || isAuthenticated || open) return;
    if (!onShopPage || askedThisVisit() || recentlyDismissed()) return;
    let scrolled = false;
    const onScroll = () => { scrolled = true; };
    window.addEventListener("scroll", onScroll, { passive: true, once: true });
    const t = window.setTimeout(() => {
      if (!scrolled || useAuthStore.getState().isAuthenticated()) return;
      try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* asked anyway */ }
      show("browse");
    }, DELAY_MS);
    return () => { window.clearTimeout(t); window.removeEventListener("scroll", onScroll); };
  }, [sessionChecked, isAuthenticated, onShopPage, pathname, open, show]);

  // On open: her number if this phone ordered before, Firebase warmed up,
  // and room made for the product page's Buy bar.
  useEffect(() => {
    if (!open) return;
    trackEvent("signin_prompt_shown", { reason });
    const b = recallBuyer();
    if (b?.phone && /^[6-9]\d{9}$/.test(b.phone)) { setPhone(b.phone); setKnown(true); }
    import("@/lib/firebase").catch(() => { /* loaded on send instead */ });
    const bar = document.querySelector<HTMLElement>("[data-buy-bar]");
    setLift(bar ? Math.round(bar.getBoundingClientRect().height) : 0);
  }, [open, reason]);

  // The wait for the SMS, counted, so a slow one is visible.
  useEffect(() => {
    if (!confirmation || done) return;
    const t = window.setInterval(() => setWaited(Math.floor((Date.now() - sentAt.current) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [confirmation, done]);

  const close = useCallback((dismissed: boolean) => {
    if (dismissed) {
      try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* asks again next visit */ }
      trackEvent("signin_dismissed", { reason, stage: confirmation ? "code" : "phone" });
    }
    hide();
    setConfirmation(null); setCode(""); setError(null); setBusy(false); setDone(false); setWaited(0);
  }, [hide, reason, confirmation]);

  async function sendCode(isResend = false) {
    if (!/^[6-9]\d{9}$/.test(phone)) { setError("Enter a 10-digit mobile number."); return; }
    setBusy(true); setError(null);
    try {
      const fb = await import("@/lib/firebase");
      if (isResend) fb.resetRecaptcha();
      const c = await fb.sendPhoneOtp(`+91${phone}`, CONTAINER);
      trackEvent(isResend ? "signin_otp_resent" : "signin_otp_sent", {
        reason, known_number: known, ...(isResend ? { after_s: waited } : {}),
      });
      sentAt.current = Date.now();
      setWaited(0); setCode(""); setConfirmation(c);
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (e) {
      const fb = await import("@/lib/firebase").catch(() => null);
      fb?.resetRecaptcha();
      const msg = (e as { code?: string })?.code === "auth/too-many-requests"
        ? "Too many tries from this phone. Please wait a few minutes."
        : "We could not send the code. Please try again.";
      setError(msg);
      trackEvent("signin_otp_failed", { reason, code: (e as { code?: string })?.code ?? null });
    } finally {
      setBusy(false);
    }
  }

  async function verify(value: string, via: "keyboard" | "typed") {
    if (!confirmation || value.length !== 6) return;
    setBusy(true); setError(null);
    const ms = Date.now() - sentAt.current;
    trackEvent("signin_code_filled", { ms_since_sent: ms, via });
    try {
      const fb = await import("@/lib/firebase");
      const idToken = await fb.confirmPhoneOtp(confirmation, value);
      const res = await api.post("/auth/firebase", { id_token: idToken });
      fb.rememberDevice();
      setAuth(res.data.user, res.data.access_token);
      trackEvent("signin_verified", { reason, ms_since_sent: Date.now() - sentAt.current, via });
      setDone(true);
      setTimeout(() => close(false), 1400);
    } catch {
      setError("That code didn\u2019t match. Please try once more.");
      setCode("");
      trackEvent("signin_code_rejected", { reason, via });
    } finally {
      setBusy(false);
    }
  }

  if (!open || !FIREBASE_ENABLED || (isAuthenticated && !done)) return null;

  return (
    <div
      role="dialog"
      aria-label="Sign in"
      className="fixed inset-x-3 z-50 mx-auto max-w-md rounded-card border border-line bg-white shadow-[0_12px_40px_rgba(0,0,0,0.16)] p-4 animate-[vt-rise_220ms_ease-out]"
      style={{ bottom: `calc(${lift ? lift + 8 : 12}px + env(safe-area-inset-bottom))` }}
    >
      <button type="button" onClick={() => close(true)} aria-label="Not now"
        className="absolute right-2.5 top-2.5 p-1.5 text-muted hover:text-ink">
        <X className="w-4 h-4" />
      </button>

      {done ? (
        <p className="flex items-center gap-2 text-sm text-ink py-1">
          <Check className="w-4 h-4 text-moss" /> Welcome to ZISUN. Everything you love, kept for you.
        </p>
      ) : !confirmation ? (
        <form onSubmit={(e) => { e.preventDefault(); sendCode(); }} autoComplete="on">
          <p className="font-display text-[19px] leading-tight text-ink pr-7">
            {reason === "wishlist" ? "Keep this piece close" : "Stay a little longer"}
          </p>
          <p className="text-xs text-muted mt-1 mb-3">
            {reason === "wishlist"
              ? "We\u2019ll hold it for you, wherever you shop from next."
              : "Your bag, your size and your address, kept for when you return."}
          </p>
          {known ? (
            <p className="text-sm text-ink mb-3">
              +91 {masked(phone)}{" "}
              <button type="button" onClick={() => { setKnown(false); setPhone(""); }} className="text-xs text-muted underline underline-offset-2">not you?</button>
            </p>
          ) : (
            <div className="flex mb-3">
              <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-line bg-rose text-sm text-ink">+91</span>
              <input
                name="tel" type="tel" inputMode="numeric" autoComplete="tel-national"
                value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(-10))}
                placeholder="Mobile number"
                className="w-full rounded-r-lg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:border-ink"
              />
            </div>
          )}
          {error && <p className="text-[12px] text-burgundy mb-2">{error}</p>}
          <button type="submit" disabled={busy || !/^[6-9]\d{9}$/.test(phone)}
            className="w-full rounded-full bg-burgundy text-white py-3 text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue"}
          </button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); verify(code, "typed"); }} autoComplete="on">
          <p className="font-display text-[19px] leading-tight text-ink pr-7">Almost there</p>
          <p className="text-xs text-muted mt-1 mb-3">Sent to +91 {masked(phone)}</p>
          <input
            ref={codeRef}
            name="one-time-code" inputMode="numeric" autoComplete="one-time-code"
            value={code}
            onChange={(e) => {
              const raw = e.target.value;
              const next = (raw.match(/\d{6}/)?.[0] ?? raw.replace(/\D/g, "")).slice(0, 6);
              // Six digits arriving in one change is the keyboard's suggestion
              // or a paste; one at a time is typing. Recorded, so the share of
              // codes that fill themselves is a number, not a guess.
              const via = next.length === 6 && code.length <= 1 ? "keyboard" : "typed";
              setCode(next);
              if (next.length === 6 && !busy) verify(next, via);
            }}
            placeholder="6-digit code"
            className="w-full rounded-lg border border-line px-3 py-2.5 text-center text-base tracking-[0.35em] text-ink outline-none focus:border-ink"
          />
          {error && <p className="text-[12px] text-burgundy mt-2">{error}</p>}
          <div className="mt-2.5 flex items-center justify-between text-[12px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              {busy ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking…</> : <>On its way… {waited}s</>}
            </span>
            {waited >= RESEND_AFTER_S ? (
              <button type="button" onClick={() => sendCode(true)} disabled={busy} className="underline underline-offset-2 text-ink">Resend code</button>
            ) : (
              <button type="button" onClick={() => { setConfirmation(null); setCode(""); setError(null); }} className="underline underline-offset-2">Change number</button>
            )}
          </div>
        </form>
      )}
      {/* Invisible reCAPTCHA lives here: Firebase needs it in the DOM to send. */}
      <div id={CONTAINER} />
    </div>
  );
}
