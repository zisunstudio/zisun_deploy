/**
 * The shape of an influencer's links, shared by the redirect and the console.
 *
 *   zisun.in/r/riya                     her default page (set on her profile)
 *   zisun.in/r/riya/<collection>        a set of pieces, e.g. one reel's three
 *   zisun.in/r/riya/piece/<product id>  one piece
 *   zisun.in/r/riya/category/<slug>     a category
 *   zisun.in/r/riya/home                the home page
 *
 * Every form credits her the same way: the redirect adds `?inf=<code>`.
 * Only these shop pages can be reached - never another site, never the
 * console - so a link cannot be bent into a redirect elsewhere.
 */
export const CODE_RE = /^[a-z0-9][a-z0-9-]{1,29}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type Landing =
  | { kind: "home" }
  | { kind: "piece"; id: string }
  | { kind: "category"; slug: string }
  | { kind: "collection"; slug: string };

/** The shop page a link's tail points at, or null if it is not one. */
export function pathForTail(tail: string[]): string | null {
  const [a, b, ...more] = tail.map((t) => decodeURIComponent(t).toLowerCase());
  if (more.length) return null;
  if (a === "home" && !b) return "/";
  if (a === "piece" && b && UUID_RE.test(b)) return `/product/${b}`;
  if (a === "category" && b && SLUG_RE.test(b)) return `/category/${b}`;
  if (a && !b && SLUG_RE.test(a)) return `/collections/${a}`;
  return null;
}

/** The page a landing opens, as stored on her profile. */
export function pathFor(l: Landing): string {
  switch (l.kind) {
    case "piece": return `/product/${l.id}`;
    case "category": return `/category/${l.slug}`;
    case "collection": return `/collections/${l.slug}`;
    default: return "/";
  }
}

/** The link she shares. `asDefault` = her short link with no tail. */
export function linkFor(code: string, l: Landing | null, origin = "https://zisun.in"): string {
  if (!l) return `${origin}/r/${code}`;
  switch (l.kind) {
    case "piece": return `${origin}/r/${code}/piece/${l.id}`;
    case "category": return `${origin}/r/${code}/category/${l.slug}`;
    case "collection": return `${origin}/r/${code}/${l.slug}`;
    default: return `${origin}/r/${code}/home`;
  }
}

/**
 * The redirect itself: a *relative* Location (behind Railway's proxy the
 * server knows itself as localhost), the credit, and UTM tags so the
 * channel panels show "Influencer".
 */
export function redirectTo(path: string, code?: string): Response {
  const q = code ? `?${new URLSearchParams({ inf: code, utm_source: "influencer", utm_medium: "social", utm_campaign: code })}` : "";
  return new Response(null, { status: 307, headers: { Location: `${path}${q}`, "Cache-Control": "no-store" } });
}
