/**
 * One reading of NEXT_PUBLIC_API_URL for the whole app.
 *
 * The three callers disagreed about what the variable means: `api.ts` treated
 * it as already ending in `/api/v1`, while `adminApi.ts` and the analytics
 * beacon appended the prefix themselves. Whichever value you set, one set of
 * callers was wrong — with the origin form (what DEPLOYMENT.md §1.9 documents)
 * every storefront request lands one path segment short and 404s, so the
 * catalogue renders empty against a perfectly healthy API.
 *
 * Both forms are accepted here and normalised, so the deploy cannot get it
 * wrong in a way that only shows up as a silently empty shop.
 */
const RAW = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").trim();

/** Scheme + host, no trailing slash, no path prefix. */
export const API_ORIGIN = RAW.replace(/\/+$/, "").replace(/\/api\/v1$/, "");

export const API_V1 = `${API_ORIGIN}/api/v1`;
export const API_ADMIN_V1 = `${API_ORIGIN}/api/admin/v1`;
