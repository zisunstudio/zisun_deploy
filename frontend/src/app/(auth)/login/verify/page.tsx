"use client";

import { useState, useRef, useEffect, KeyboardEvent, ClipboardEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/components/ui/ToastProvider";
import { ChevronLeft, Loader2 } from "lucide-react";

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;

export default function VerifyOTPPage() {
  const router = useRouter();
  const { pendingPhone, setAuth, clearPendingPhone } = useAuthStore();
  const { showToast } = useToast();

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  // Redirect if phone is missing (direct URL access)
  useEffect(() => {
    if (!pendingPhone) router.replace("/login");
  }, [pendingPhone, router]);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  const otp = digits.join("");
  const isComplete = otp.length === OTP_LENGTH;

  function handleDigitChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    const next = Array(OTP_LENGTH).fill("");
    pasted.split("").forEach((d, i) => (next[i] = d));
    setDigits(next);
    inputRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!isComplete || !pendingPhone) return;
    setError("");
    setLoading(true);

    try {
      const { data } = await api.post("/auth/verify-otp", {
        phone: pendingPhone,
        otp,
      });
      setAuth(data.user, data.access_token);
      clearPendingPhone();
      showToast("Welcome to ZISUN!", "success");
      router.replace("/");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Verification failed. Please try again.";
      setError(msg);
      showToast(msg, "error");
      // Clear digits on error so user retypes
      setDigits(Array(OTP_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!pendingPhone || countdown > 0) return;
    setResending(true);
    setError("");
    try {
      await api.post("/auth/send-otp", { phone: pendingPhone });
      setCountdown(RESEND_SECONDS);
      setDigits(Array(OTP_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
      showToast("New OTP sent!", "success");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to resend OTP.";
      setError(msg);
    } finally {
      setResending(false);
    }
  }

  const maskedPhone = pendingPhone
    ? pendingPhone.slice(0, 4) + "****" + pendingPhone.slice(-4)
    : "";

  return (
    <div className="h-full w-full flex flex-col bg-background px-6">
      {/* Back button */}
      <div className="pt-14 pb-6">
        <button
          onClick={() => { clearPendingPhone(); router.back(); }}
          className="flex items-center gap-1 text-primary text-sm font-medium"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
      </div>

      {/* Heading */}
      <h2 className="font-serif text-2xl font-bold text-foreground mb-1">Verify OTP</h2>
      <p className="text-muted text-sm mb-8">
        Enter the 6-digit code sent to{" "}
        <span className="text-foreground font-semibold">{maskedPhone}</span>
      </p>

      <form onSubmit={handleVerify} noValidate>
        {/* OTP boxes */}
        <div className="flex gap-3 justify-between mb-6">
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="tel"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              autoFocus={i === 0}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={i === 0 ? handlePaste : undefined}
              className={`w-12 h-14 text-center text-xl font-bold rounded-2xl border-2 outline-none transition-colors bg-white
                ${digit ? "border-primary text-foreground" : "border-gray-200 text-foreground"}
                focus:border-primary`}
            />
          ))}
        </div>

        {error && (
          <p className="text-red-500 text-xs mb-4 text-center">{error}</p>
        )}

        <button
          type="submit"
          disabled={!isComplete || loading}
          className="w-full bg-[#5C3317] text-white py-4 rounded-full font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#4A2810] transition-colors shadow-md mb-6"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Verify & Continue"}
        </button>

        {/* Resend */}
        <p className="text-center text-sm text-muted">
          Didn&apos;t receive it?{" "}
          {countdown > 0 ? (
            <span className="text-foreground font-medium">
              Resend in {countdown}s
            </span>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="text-primary font-semibold underline disabled:opacity-50"
            >
              {resending ? "Sending..." : "Resend OTP"}
            </button>
          )}
        </p>
      </form>
    </div>
  );
}
