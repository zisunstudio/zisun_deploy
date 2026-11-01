import { API_V1 } from "@/lib/apiBase";
import { CODE_RE, redirectTo } from "@/lib/influencerLink";

/**
 * An influencer's default link: `zisun.in/r/riya`.
 *
 * Lands where her profile says (a collection, a piece, a category or the
 * home page), so moving her to a new edit moves every post already out.
 * An unknown or paused code lands on the home page and credits nobody.
 * The lookup is cached for a minute: a reel that sends a thousand taps
 * does not send a thousand requests to the API. Per-reel links
 * (`/r/riya/<what>`) are in [...rest] and need no lookup at all.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { code: string } }) {
  const code = (params.code || "").trim().toLowerCase();
  if (!CODE_RE.test(code)) return redirectTo("/");
  let path = "/";
  try {
    const res = await fetch(`${API_V1}/influencers/${code}/landing`, { next: { revalidate: 60 } });
    if (!res.ok) return redirectTo("/");
    path = ((await res.json()) as { path?: string }).path || "/";
  } catch {
    // The API is down: still land her on the shop, and still credit the code.
  }
  return redirectTo(path.startsWith("/") && !path.startsWith("//") ? path : "/", code);
}
