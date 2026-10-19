/**
 * "This phone is ours."
 *
 * The founder and her co-founder open the site many times a day to check a
 * photograph or a price, and every one of those opens was a visit, an
 * impression and an open in the analytics. The flag is set on any device
 * that signs in to the console, and can be set or cleared by hand on the
 * console's System page. While it is set, the storefront records nothing
 * from this device: no events, no WhatsApp taps.
 *
 * Local to the device, like the drafts: a flag the server could not see
 * would be a flag the server could not honour, so the decision is made
 * before anything is sent.
 */
const KEY = "zisun.internal";

export function isInternalDevice(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

export function markInternalDevice(on: boolean): void {
  if (typeof window === "undefined") return;
  try { if (on) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch { /* private mode */ }
}
