import { NextRequest, NextResponse } from "next/server";

// Routes that require authentication — redirect to /login if no refresh token cookie
const PROTECTED = ["/checkout", "/orders", "/profile", "/wishlist", "/cart"];
// Routes only for unauthenticated users — redirect to / if already authenticated
const AUTH_ONLY = ["/login"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Use the httpOnly refresh_token cookie as the auth signal.
  // The access token lives in memory (not readable by middleware), so we rely
  // on the cookie presence as a proxy for "the user has a valid session."
  const hasSession = req.cookies.has("refresh_token");

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
  const isAuthOnly = AUTH_ONLY.some((p) => pathname.startsWith(p));

  if (isProtected && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthOnly && hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static assets, images, _next internals, and API routes
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
