"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  FIREBASE_ENABLED,
  confirmPhoneOtp,
  resetRecaptcha,
  resendEmailVerification,
  sendPhoneOtp,
  signInWithEmail,
} from "@/lib/firebase";
import type { ConfirmationResult } from "firebase/auth";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/components/ui/ToastProvider";
import { ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const setPendingPhone = useAuthStore((s) => s.setPendingPhone);
  const setAuth = useAuthStore((s) => s.setAuth);
  const { showToast } = useToast();

  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Firebase's ConfirmationResult is a live object, not serialisable, so the
  // code step has to stay on this page. The Twilio path keeps its separate
  // /login/verify route, which only needs the phone number carried across.
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [code, setCode] = useState("");

  // Staff sign in with email and password. Customers sign in by phone, because
  // the number is what orders, COD confirmation and delivery all key on - but
  // phone sign-in bills per SMS and needs a handset, which is a poor fit for
  // someone opening the admin twenty times a day. Phone stays the default; the
  // email form is a deliberate detour.
  const [mode, setMode] = useState<"phone" | "email">("phone");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Set when the API answers 403 because the address is not confirmed yet.
  const [needsVerification, setNeedsVerification] = useState(false);

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setError("");
    setNeedsVerification(false);
    setLoading(true);
    try {
      const idToken = await signInWithEmail(email, password);
      const res = await api.post("/auth/firebase", { id_token: idToken });
      setAuth(res.data.user, res.data.access_token);
      router.push(landingFor(res.data.user));
    } catch (err: unknown) {
      // Firebase returns auth/invalid-credential for a wrong password AND for
      // an address that does not exist, deliberately, so that the form cannot
      // be used to discover which accounts are real. Say the same here.
      const code = (err as { code?: string })?.code ?? "";
      const status = (err as { response?: { status?: number } })?.response?.status;
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      // 403 means the password was right and the address is simply unconfirmed,
      // so the page can offer the fix instead of just reporting a failure.
      if (status === 403) setNeedsVerification(true);
      const msg = detail
        ?? (code.startsWith("auth/")
            ? "That email or password is not right."
            : "Could not sign in. Please try again.");
      setError(msg);
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  const isValid = /^[6-9]\d{9}$/.test(phone);

  /** Staff belong in the admin, everyone else on the storefront. */
  function landingFor(u: { role?: string } | null | undefined): string {
    const r = u?.role;
    return r === "admin" || r === "operations" || r === "finance" ? "/admin" : "/";
  }

  async function handleSendOTP(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    setError("");
    setLoading(true);

    try {
      if (FIREBASE_ENABLED) {
        setConfirmation(await sendPhoneOtp(`+91${phone}`));
        showToast("OTP sent", "success");
      } else {
        await api.post("/auth/send-otp", { phone: `+91${phone}` });
        setPendingPhone(`+91${phone}`);
        router.push("/login/verify");
      }
    } catch (err: unknown) {
      // A solved reCAPTCHA cannot be reused, so a failed send leaves the widget
      // spent. Without this reset the retry hangs with no error at all.
      resetRecaptcha();
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to send OTP. Please try again.";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmation || code.length < 6) return;
    setError("");
    setLoading(true);
    try {
      // Firebase proves the number; the backend re-verifies Google's signature
      // before trusting it, so nothing here is taken on the client's word.
      const idToken = await confirmPhoneOtp(confirmation, code);
      const res = await api.post("/auth/firebase", { id_token: idToken });
      setAuth(res.data.user, res.data.access_token);
      router.push(landingFor(res.data.user));
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "That code did not work. Please try again.";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full bg-background">
      {/* On a phone the full-bleed column is right. The same markup on a desktop
          stretched a ten-digit phone field to 1100px and left two thirds of the
          window empty below it, so from lg up this becomes a centred column of
          a readable width. Nothing about the mobile rendering changes. */}
      <div className="w-full lg:max-w-md lg:mx-auto lg:my-auto">
      {/* Header */}
      <div className="px-6 pt-16 lg:pt-8 pb-8">
        <h1 className="font-serif text-3xl font-bold text-foreground">ZISUN</h1>
        <p className="text-primary text-[10px] font-semibold tracking-[0.22em] uppercase mt-0.5">
          Wear Your Story.
        </p>
      </div>

      {/* Form */}
      <div className="px-6 pb-10">
        <h2 className="font-serif text-2xl font-bold text-foreground mb-1">Sign in</h2>
        <p className="text-muted text-sm mb-8">
          {mode === "email" ? "Staff sign-in" : "Enter your mobile number to continue"}
        </p>

        {mode === "email" ? (
          <form onSubmit={handleEmailSignIn} noValidate>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-4 mb-3 text-foreground placeholder-gray-400 text-sm font-medium outline-none bg-white border-2 border-gray-200 rounded-2xl focus:border-primary transition-colors"
              autoFocus
              autoComplete="email"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-4 mb-4 text-foreground placeholder-gray-400 text-sm font-medium outline-none bg-white border-2 border-gray-200 rounded-2xl focus:border-primary transition-colors"
              autoComplete="current-password"
            />
            {error && <p className="text-red-500 text-xs mb-4 px-1">{error}</p>}
            {needsVerification && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await resendEmailVerification();
                    showToast("Confirmation link sent - check your inbox", "success");
                  } catch {
                    showToast("Could not send the link. Try signing in again.", "error");
                  }
                }}
                className="w-full mb-4 text-primary text-xs underline"
              >
                Re-send the confirmation link
              </button>
            )}
            <button
              type="submit"
              disabled={!email.trim() || !password || loading}
              className="w-full bg-[#5C3317] text-white py-4 rounded-full font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#4A2810] transition-colors shadow-md"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Sign in<ChevronRight className="w-4 h-4" /></>}
            </button>
            <button
              type="button"
              onClick={() => { setMode("phone"); setError(""); setPassword(""); }}
              className="w-full text-muted text-xs mt-4 underline"
            >
              Sign in with mobile number instead
            </button>
          </form>
        ) : confirmation ? (
          <form onSubmit={handleVerify} noValidate>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="6-digit code"
              className="w-full px-4 py-4 mb-4 text-foreground placeholder-gray-400 text-sm font-medium outline-none bg-white border-2 border-gray-200 rounded-2xl focus:border-primary transition-colors tracking-[0.3em] text-center"
              autoFocus
              autoComplete="one-time-code"
            />
            {error && <p className="text-red-500 text-xs mb-4 px-1">{error}</p>}
            <button
              type="submit"
              disabled={code.length < 6 || loading}
              className="w-full bg-[#5C3317] text-white py-4 rounded-full font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#4A2810] transition-colors shadow-md"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Verify<ChevronRight className="w-4 h-4" /></>}
            </button>
            <button
              type="button"
              onClick={() => { resetRecaptcha(); setConfirmation(null); setCode(""); setError(""); }}
              className="w-full text-muted text-xs mt-4 underline"
            >
              Change number
            </button>
          </form>
        ) : (
        <form onSubmit={handleSendOTP} noValidate>
          {/* Phone input */}
          <div className="flex items-center bg-white border-2 border-gray-200 rounded-2xl overflow-hidden focus-within:border-primary transition-colors mb-4">
            <span className="px-4 py-4 text-foreground font-semibold text-sm border-r border-gray-200 bg-[#F7F0E8] select-none">
              +91
            </span>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              placeholder="10-digit mobile number"
              className="flex-1 px-4 py-4 text-foreground placeholder-gray-400 text-sm font-medium outline-none bg-white"
              autoFocus
              autoComplete="tel-national"
            />
          </div>

          {error && (
            <p className="text-red-500 text-xs mb-4 px-1">{error}</p>
          )}

          <button
            type="submit"
            disabled={!isValid || loading}
            className="w-full bg-[#5C3317] text-white py-4 rounded-full font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#4A2810] transition-colors shadow-md"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Send OTP
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
        )}

        {mode === "phone" && !confirmation && (
          <button
            type="button"
            onClick={() => { setMode("email"); setError(""); }}
            className="w-full text-muted text-xs mt-5 underline"
          >
            Staff sign-in
          </button>
        )}

        {/* Firebase attaches its invisible reCAPTCHA here; it must exist in the
            DOM before signInWithPhoneNumber is called. */}
        <div id="recaptcha-container" />

        <p className="text-center text-muted text-xs mt-8 leading-relaxed">
          By continuing, you agree to our{" "}
          <Link href="/terms" className="text-primary underline">Terms &amp; Conditions</Link>
          {" "}and{" "}
          <Link href="/privacy" className="text-primary underline">Privacy Policy</Link>
        </p>
      </div>
      </div>
    </div>
  );
}
