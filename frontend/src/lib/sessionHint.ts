/**
 * Whether this device might hold a session worth restoring.
 *
 * The refresh cookie is httpOnly and scoped to the API's host, so the page
 * cannot see it; until now SessionRestore asked /auth/refresh on every page
 * load for every visitor, twice (with its retry), and a stranger who had
 * never signed in got two 401s per page. Those calls sit under the sign-in
 * rate limit - ten a minute, per address, counted in Redis - so anonymous
 * browsing spent the limit that guards OTP sends (and on a carrier's shared
 * address, spent it for everyone behind it), and every page view cost two
 * metered Upstash commands.
 *
 * So a flag is written whenever a session is made or restored and removed
 * when the server says there is none. A device with no flag is asked once
 * (the probe), which covers sessions that began before the flag existed.
 * Storage that throws (private mode) falls back to always asking.
 */
const SESSION_KEY = "zisun-session";
const PROBED_KEY = "zisun-session-probed";
// Written by lib/firebase.ts (FIREBASE_DEVICE_KEY); not imported, so this
// check does not pull the Firebase SDK into every page.
const FIREBASE_KEY = "zisun-signed-in";

export function markSignedIn(): void {
  try { localStorage.setItem(SESSION_KEY, "1"); } catch { /* private mode */ }
}

export function forgetSession(): void {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* nothing kept */ }
}

export function shouldRestore(): boolean {
  try {
    if (localStorage.getItem(SESSION_KEY) === "1") return true;
    if (localStorage.getItem(FIREBASE_KEY) === "1") return true;
    if (localStorage.getItem(PROBED_KEY) === "1") return false;
    localStorage.setItem(PROBED_KEY, "1");
    return true;
  } catch {
    return true;
  }
}
