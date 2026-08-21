"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/components/ui/ToastProvider";
import { ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const setPendingPhone = useAuthStore((s) => s.setPendingPhone);
  const { showToast } = useToast();

  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isValid = /^[6-9]\d{9}$/.test(phone);

  async function handleSendOTP(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    setError("");
    setLoading(true);

    try {
      await api.post("/auth/send-otp", { phone: `+91${phone}` });
      setPendingPhone(`+91${phone}`);
      router.push("/login/verify");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to send OTP. Please try again.";
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
