"use client";

import { useEffect } from "react";
import { captureReferral } from "@/lib/referral";

/** Reads ?ref= on whatever page a shared link lands on (lib/referral.ts). */
export function ReferralCapture() {
  useEffect(() => { captureReferral(); }, []);
  return null;
}
