/**
 * Company details used across all legal pages.
 *
 * ⚠️ EDIT THIS FILE BEFORE LAUNCH. Razorpay checks these against your KYC
 * documents during merchant onboarding — a mismatch delays or fails activation.
 * Every value below marked TODO must be replaced with real, verifiable details.
 */

export const COMPANY = {
  /** Registered legal entity name, exactly as on your GST / registration. */
  legalName: "ZISUN", // TODO: replace with the registered entity name from your GST / registration certificate
  /** Public-facing brand. */
  brandName: "ZISUN",
  /** Full registered address — Razorpay and consumer law both require this. */
    // Empty until the registered address is known. Every page that shows it
  // omits the block rather than printing a placeholder — a policy page is a
  // legal document and a half-filled one is worse than a short one.
  address: "",
  /** Monitored support inbox. */
  email: "zisunstudio@gmail.com",
  /** Support phone, with country code. */
  phone: "",
  /** Leave blank if not GST-registered. */
  gstin: "",
  /** Support hours shown to customers. */
  supportHours: "Monday–Saturday, 10:00–18:00 IST",
  /** Live site URL. */
  websiteUrl: "https://zisun.in",
} as const;

/** Last reviewed date shown on each policy. Update when you change a policy. */
export const POLICY_LAST_UPDATED = "22 August 2026";

/** Windows referenced across the policies — keep these consistent with ops reality. */
export const POLICY_TERMS = {
  returnWindowDays: 7,
  refundProcessingDays: "5–7 business days",
  dispatchTimeframe: "2–3 business days",
  deliveryTimeframe: "4–8 business days",
} as const;

/** True when any placeholder is still unedited — used to warn in dev. */
/** Fields that must be filled before the pages are complete for KYC. */
export const MISSING_DETAILS = (
  [
    ["registered address", COMPANY.address],
    ["support phone", COMPANY.phone],
  ] as const
).filter(([, v]) => !v).map(([label]) => label);

export const HAS_PLACEHOLDERS =
  Object.values(COMPANY).some((v) => typeof v === "string" && v.startsWith("TODO")) ||
  POLICY_LAST_UPDATED.startsWith("TODO") ||
  MISSING_DETAILS.length > 0;
