/**
 * Firebase Phone Auth — client side.
 *
 * Firebase sends the SMS and signs the result; the backend verifies that
 * signature at POST /auth/firebase and issues our own session. The values
 * below are public by design (they identify the project, they do not authorise
 * anything), which is why they are NEXT_PUBLIC and baked in at build time.
 *
 * Read at BUILD time like every other NEXT_PUBLIC value: changing the project
 * needs a frontend REBUILD, not a restart.
 */
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  RecaptchaVerifier,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  type Auth,
  type ConfirmationResult,
} from "firebase/auth";
import { FIREBASE_ENABLED } from "./firebaseEnabled";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
};

// The flag lives in its own module (firebaseEnabled.ts) so that a page which
// only needs to know *whether* sign-in exists does not pull in the SDK.
export { FIREBASE_ENABLED } from "./firebaseEnabled";

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;

function firebaseAuth(): Auth {
  if (!FIREBASE_ENABLED) {
    throw new Error("Firebase is not configured in this build");
  }
  // getApps() guards React StrictMode's double-invoke in development, which
  // would otherwise throw on a duplicate app name.
  _app = _app ?? (getApps()[0] || initializeApp(config));
  _auth = _auth ?? getAuth(_app);
  return _auth;
}

let _verifier: RecaptchaVerifier | null = null;

/**
 * Phone sign-in needs a reCAPTCHA to exist in the DOM before it is called.
 * Kept module-level and reused: creating a second verifier over the same
 * container leaves the first one attached and the widget silently stops
 * solving, so the second OTP request hangs with no error.
 */
function verifier(containerId: string): RecaptchaVerifier {
  if (_verifier) return _verifier;
  _verifier = new RecaptchaVerifier(firebaseAuth(), containerId, {
    size: "invisible",
  });
  return _verifier;
}

/** Send the OTP. `phone` must be E.164, e.g. +919876543210. */
export async function sendPhoneOtp(
  phone: string,
  containerId = "recaptcha-container"
): Promise<ConfirmationResult> {
  return signInWithPhoneNumber(firebaseAuth(), phone, verifier(containerId));
}

/**
 * Exchange the user's code for a Firebase ID token.
 *
 * The token goes to our backend, which verifies Google's signature before
 * trusting the phone number in it — nothing here is trusted client-side.
 */
export async function confirmPhoneOtp(
  confirmation: ConfirmationResult,
  code: string
): Promise<string> {
  const cred = await confirmation.confirm(code);
  return cred.user.getIdToken();
}

/** Let a failed attempt be retried; a solved reCAPTCHA cannot be reused. */
export function resetRecaptcha(): void {
  try {
    _verifier?.clear();
  } catch {
    /* already gone */
  }
  _verifier = null;
}

/**
 * Email/password sign-in.
 *
 * Exists for staff. Customers sign in by phone, because the number is what
 * orders, COD confirmation and delivery all key on — but phone sign-in bills
 * per SMS and needs a handset, which makes it a poor fit for someone opening
 * the admin twenty times a day.
 *
 * No sign-up function here on purpose. Accounts are created in the Firebase
 * console and granted a role with scripts/grant_admin.py; a self-serve staff
 * registration form on a public storefront is a way in, not a feature.
 */
export async function signInWithEmail(email: string, password: string): Promise<string> {
  const cred = await signInWithEmailAndPassword(firebaseAuth(), email.trim(), password);
  // The backend re-verifies this token's signature before trusting any claim
  // in it, so nothing here is trusted client-side.
  return cred.user.getIdToken();
}

/**
 * Re-send the confirmation link to the account that just signed in.
 *
 * Accounts created in the Firebase console start unverified, and our API
 * refuses an unverified address as an identity - so without this the very
 * first staff sign-in is a dead end with no way forward from the page.
 * Firebase still holds the session client-side after a successful password
 * check, which is what makes the resend possible even though our own API
 * turned the sign-in down.
 */
export async function resendEmailVerification(): Promise<void> {
  const user = firebaseAuth().currentUser;
  if (!user) throw new Error("No signed-in Firebase user to verify");
  await sendEmailVerification(user);
}


// ── Silent return sign-in ────────────────────────────────────────────────────

/**
 * Set when this device has signed in with Firebase, so the storefront knows
 * whether it is worth loading the Firebase SDK to restore a session. Every
 * other visitor never downloads it - the site was just made four times
 * faster and a sign-in library on every page view would give that back.
 */
export const FIREBASE_DEVICE_KEY = "zisun-signed-in";

export function rememberDevice(): void {
  try { localStorage.setItem(FIREBASE_DEVICE_KEY, "1"); } catch { /* private mode */ }
}

export function deviceWasSignedIn(): boolean {
  try { return localStorage.getItem(FIREBASE_DEVICE_KEY) === "1"; } catch { return false; }
}

/**
 * A fresh Firebase ID token for whoever this device last signed in as, with
 * no prompt, no SMS and no tap - or null.
 *
 * Firebase keeps its own session in IndexedDB and renews it indefinitely
 * until she signs out or clears the site's data. Our refresh cookie lasts
 * 30 days from her last visit; this is what signs her back in after a
 * longer absence without asking her for a code she has to wait for.
 */
export async function silentIdToken(): Promise<string | null> {
  if (!FIREBASE_ENABLED) return null;
  const auth = firebaseAuth();
  await auth.authStateReady();
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}

/** Sign out here and in Firebase, so the silent path cannot sign her back in. */
export async function forgetDevice(): Promise<void> {
  try { localStorage.removeItem(FIREBASE_DEVICE_KEY); } catch { /* nothing kept */ }
  if (!FIREBASE_ENABLED) return;
  try { await firebaseAuth().signOut(); } catch { /* already signed out */ }
}
