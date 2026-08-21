import { NextRequest, NextResponse } from "next/server";

// Routes that require authentication — redirect to /login if no refresh token cookie
const PROTECTED = ["/checkout", "/orders", "/profile", "/wishlist", "/cart"];
// Routes only for unauthenticated users — redirect to / if already authenticated
const AUTH_ONLY = ["/login"];

// Mirrors the API's LAUNCH_MODE=browse. Read here as well as in the client
// because this runs before any page does, and it is what decides whether a
// visitor ever reaches one.
const BROWSE_ONLY =
  (process.env.NEXT_PUBLIC_LAUNCH_MODE ?? "").trim().toLowerCase() === "browse";

// In browse mode /checkout is allowed through so it can explain itself. Its
// page renders a "checkout isn't open yet" message; bouncing to /login instead
// would strand the visitor on a form that cannot possibly succeed.
const BROWSE_ALLOWED = ["/checkout"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Use the httpOnly refresh_token cookie as the auth signal.
  // The access token lives in memory (not readable by middleware), so we rely
  // on the cookie presence as a proxy for "the user has a valid session."
  const hasSession = req.cookies.has("refresh_token");

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
  const isAuthOnly = AUTH_ONLY.some((p) => pathname.startsWith(p));

  if (BROWSE_ONLY) {
    // Browse mode has no working login: the OTP is sent over Twilio, which is
    // not configured, so /login is a dead end rather than a way in. Anything
    // that would lead there goes back to the catalogue instead — the only part
    // of the site that actually works.
    if (isAuthOnly || (isProtected && !BROWSE_ALLOWED.some((p) => pathname.startsWith(p)))) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

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
