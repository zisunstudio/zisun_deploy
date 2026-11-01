import { CODE_RE, pathForTail, redirectTo } from "@/lib/influencerLink";

/**
 * A link for one reel: `zisun.in/r/riya/<collection>`, `/r/riya/piece/<id>`,
 * `/r/riya/category/<slug>` or `/r/riya/home`. The page is in the link, so
 * no lookup is needed; whether the code still earns is decided at checkout
 * (an unknown or paused influencer is credited with nothing).
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { code: string; rest: string[] } }) {
  const code = (params.code || "").trim().toLowerCase();
  const path = pathForTail(params.rest ?? []);
  if (!CODE_RE.test(code)) return redirectTo(path ?? "/");
  return redirectTo(path ?? "/", code);
}
