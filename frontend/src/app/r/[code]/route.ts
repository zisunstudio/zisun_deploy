import { NextResponse, type NextRequest } from "next/server";
import { API_V1 } from "@/lib/apiBase";

/**
 * An influencer's short link: `zisun.in/r/riya`.
 *
 * Short enough for an Instagram bio, and it outlives her collection - when
 * the founder points Riya at a new edit, every post already out lands on
 * the new one. It redirects with `?inf=<code>` (who to credit, read and
 * removed by lib/influencer.ts) and UTM tags (so the channel panels show
 * "Influencer"). An unknown or paused code lands on the home page and
 * credits nobody. The lookup is cached for a minute, so a reel that sends
 * a thousand taps does not send a thousand requests to the API.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { code: string } }) {
  const code = (params.code || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,29}$/.test(code)) return to("/");
  let path = "/";
  try {
    const res = await fetch(`${API_V1}/influencers/${code}/landing`, { next: { revalidate: 60 } });
    if (!res.ok) return to("/");
    path = ((await res.json()) as { path?: string }).path || "/";
  } catch {
    // The API is down: still land her on the shop, and still credit the code.
  }
  const q = new URLSearchParams({ inf: code, utm_source: "influencer", utm_medium: "social", utm_campaign: code });
  return to(`${path.startsWith("/") ? path : "/"}?${q}`);
}

/**
 * A relative Location. Behind Railway's proxy the standalone server knows
 * itself as localhost:<PORT>, so `req.nextUrl.origin` builds a URL no
 * customer can reach - the first version redirected every tap there.
 */
function to(location: string) {
  return new NextResponse(null, { status: 307, headers: { Location: location, "Cache-Control": "no-store" } });
}
