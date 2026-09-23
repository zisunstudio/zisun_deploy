/**
 * The one host `next/image` is allowed to optimize.
 *
 * `remotePatterns` in next.config.js allowlists exactly this host, on purpose:
 * `hostname: "**"` would turn next/image into an open proxy that strangers
 * could push their images through at our expense. The cost of that safety is
 * that a URL from anywhere else returns **HTTP 400** from the optimizer and
 * the picture silently does not appear - there is no broken-image icon and no
 * error, it is simply absent.
 *
 * Fields where a URL is typed or pasted rather than uploaded (a category's
 * image, the `image_url` column of the bulk CSV) are the places that happens,
 * so they check against this and say so before saving.
 */
export const MEDIA_HOST = "zisun-media.fly.storage.tigris.dev";

export function isOptimizableImageUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return true;                       // empty is fine; it just means none
  if (u.startsWith("/")) return true;        // our own /public assets
  try {
    return new URL(u).hostname === MEDIA_HOST;
  } catch {
    return false;                            // not a URL at all
  }
}

/** Why it will not work, in her words. Null when the URL is fine. */
export function imageUrlProblem(url: string): string | null {
  const u = url.trim();
  if (!u || isOptimizableImageUrl(u)) return null;
  try {
    new URL(u);
  } catch {
    return "That does not look like a web address.";
  }
  return `Only pictures already uploaded to ZISUN will show. Upload the photograph to a product first, then copy its address (it starts ${MEDIA_HOST}).`;
}
