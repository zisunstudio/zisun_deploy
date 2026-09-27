/**
 * Whether phone sign-in can work at all, with no Firebase SDK attached.
 *
 * The home page and the product page both import this flag to decide what
 * to show. It used to live in lib/firebase.ts, and importing a boolean from
 * there dragged the whole Firebase Auth SDK into both pages for every
 * visitor - found on 2026-09-27 by checking which route bundles contained
 * it. Import the flag from here; import lib/firebase only where sign-in
 * actually happens.
 */
export const FIREBASE_ENABLED = Boolean(
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
);
