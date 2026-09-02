"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  FIREBASE_ENABLED,
  confirmPhoneOtp,
  resetRecaptcha,
  sendPhoneOtp,
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

  const isValid = /^[6-9]\d{9}$/.test(phone);

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
      router.push("/");
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
    <div className="h-full w-full flex flex-col bg-background">
      {/* Header */}
      <div className="px-6 pt-16 pb-8">
        <h1 className="font-serif text-3xl font-bold text-foreground">ZISUN</h1>
        <p className="text-primary text-[10px] font-semibold tracking-[0.22em] uppercase mt-0.5">
          Wear Your Story.
        </p>
      </div>

      {/* Form */}
      <div className="flex-1 px-6">
        <h2 className="font-serif text-2xl font-bold text-foreground mb-1">Sign in</h2>
        <p className="text-muted text-sm mb-8">Enter your mobile number to continue</p>

        {confirmation ? (
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
  );
}
