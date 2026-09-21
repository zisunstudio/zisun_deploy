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

/** The canonical origin. Used by robots.txt, the sitemap and metadataBase. */
export const SITE_URL = "https://zisun.in";

export const COMPANY: CompanyDetails = {
  // TODO: GSTIN 29BAYPT2026A1ZH carries PAN BAYPT2026A, whose fourth character
  // "P" marks an individual proprietorship. The registered legal name is
  // therefore the proprietor's own name as printed on that PAN, and "ZISUN" is
  // the trade name. Razorpay verifies the legal name against the PAN during
  // onboarding, so this needs the proprietor's name before KYC is submitted.
  legalName: "ZISUN",
  brandName: "ZISUN",
  // City only, at the founder's request: this is her home, and a street
  // address on a public page is a safety problem before it is a compliance
  // one. Razorpay KYC and any statutory notice get the full address
  // privately; customers reach her by phone, email and WhatsApp.
  address: "Bengaluru, Karnataka, India",
  email: "zisunstudio@gmail.com",
  phone: "+91 93636 08792",
  gstin: "29BAYPT2026A1ZH",
  supportHours: "Monday–Saturday, 10:00–18:00 IST",
  websiteUrl: "https://zisun.in",
};

/** Last reviewed date shown on each policy. Update when you change a policy. */
export const POLICY_LAST_UPDATED = "22 August 2026";

/**
 * Windows referenced across the policies — keep these consistent with ops reality.
 *
 * ZISUN does not run a returns programme. There is an exchange, it is short, and
 * it covers one thing: a size that does not fit. That is a deliberate commercial
 * decision for a business with no warehouse and a 26% COD return rate, and it is
 * stated in the same words everywhere it appears — on the product page, on the
 * home page and in the policy — because a window a customer only discovers
 * after delivery is the kind of surprise the dark-pattern rules exist to stop.
 *
 * The window has two halves, and they are not the same clock. Telling us is
 * quick, so it is bounded tightly at 24 hours from delivery — it keeps the claim
 * close to the unboxing video it depends on. Posting a parcel back is not quick
 * and depends on a courier, so once a request is approved the customer gets
 * three days to ship. Collapsing both into one number would either make the
 * claim too loose or the return impossible for someone who works weekdays.
 *
 * `refundProcessingDays` survives because refunds still happen: a cancellation
 * before dispatch, and the statutory case in section 5 of the exchange policy.
 */
export const POLICY_TERMS = {
  /** Hours from delivery to RAISE a size exchange. Not a return window. */
  exchangeRaiseWindowHours: 24,
  /** Days from approval to SHIP the piece back. */
  exchangeReturnWindowDays: 3,
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
