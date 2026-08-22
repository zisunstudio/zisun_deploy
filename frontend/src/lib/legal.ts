/**
 * Company details used across all legal pages.
 *
 * ⚠️ EDIT THIS FILE BEFORE LAUNCH. Razorpay checks these against your KYC
 * documents during merchant onboarding — a mismatch delays or fails activation.
 * Values marked TODO are still outstanding. Anything left empty is hidden by
 * the pages rather than rendered as a placeholder.
 */

/**
 * Fields are typed as plain strings, not literals. An `as const` object makes
 * `phone: ""` the literal type `""`, so `COMPANY.phone ? ... : null` narrows the
 * truthy branch to `never` and every method call on it fails to compile.
 */
type CompanyDetails = {
  /** Registered legal entity name, exactly as on your GST / registration. */
  legalName: string;
  /** Public-facing brand. */
  brandName: string;
  /**
   * Full registered address — Razorpay and consumer law both require this.
   * Empty until it is known: every page that shows it omits the block rather
   * than printing a placeholder. A policy page is a legal document, and a short
   * one is better than a half-filled one.
   */
  address: string;
  /** Monitored support inbox. */
  email: string;
  /** Support phone with country code. Empty hides the row; see address. */
  phone: string;
  /** Leave blank if not GST-registered. */
  gstin: string;
  /** Support hours shown to customers. */
  supportHours: string;
  /** Live site URL. */
  websiteUrl: string;
};

export const COMPANY: CompanyDetails = {
  legalName: "ZISUN", // TODO: the registered entity name from your GST / registration certificate
  brandName: "ZISUN",
  address: "", // TODO: full registered address, city, state, PIN
  email: "zisunstudio@gmail.com",
  phone: "", // TODO: support number with country code
  gstin: "",
  supportHours: "Monday–Saturday, 10:00–18:00 IST",
  websiteUrl: "https://zisun.in",
};

/** Last reviewed date shown on each policy. Update when you change a policy. */
export const POLICY_LAST_UPDATED = "22 August 2026";

/** Windows referenced across the policies — keep these consistent with ops reality. */
export const POLICY_TERMS = {
  returnWindowDays: 7,
  refundProcessingDays: "5–7 business days",
  dispatchTimeframe: "2–3 business days",
  deliveryTimeframe: "4–8 business days",
} as const;

/** Which required details are still outstanding for Razorpay KYC. */
export const MISSING_DETAILS: string[] = [
  ["registered address", COMPANY.address],
  ["support phone", COMPANY.phone],
]
  .filter((pair) => !pair[1])
  .map((pair) => pair[0]);

export const HAS_PLACEHOLDERS =
  Object.values(COMPANY).some((v) => typeof v === "string" && v.startsWith("TODO")) ||
  POLICY_LAST_UPDATED.startsWith("TODO") ||
  MISSING_DETAILS.length > 0;
