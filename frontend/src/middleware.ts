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

// Whether sign-in can actually complete. Browse mode used to bounce /login
// because the OTP had no provider and the page was a dead end; with Firebase
// configured it works, and it is the only route to /admin. Mirrors
// FIREBASE_ENABLED in lib/firebase.ts — middleware runs on the edge and
// cannot import it.
const AUTH_AVAILABLE = Boolean(
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
);

// In browse mode /checkout is allowed through so it can explain itself. Its
// page renders a "checkout isn't open yet" message; bouncing to /login instead
// would strand the visitor on a form that cannot possibly succeed.
const BROWSE_ALLOWED = ["/checkout"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
  const isAuthOnly = AUTH_ONLY.some((p) => pathname.startsWith(p));

  if (BROWSE_ONLY) {
    // Browse mode has no working login: the OTP is sent over Twilio, which is
    // not configured, so /login is a dead end rather than a way in. Anything
    // that would lead there goes back to the catalogue instead — the only part
    // of the site that actually works.
    if ((isAuthOnly && !AUTH_AVAILABLE) || (isProtected && !BROWSE_ALLOWED.some((p) => pathname.startsWith(p)))) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Authentication is NOT gated here any more, and the reason matters.
  //
  // This used to redirect protected routes to /login unless a `refresh_token`
  // cookie was present. That cookie is deliberately scoped to
  // `path=/api/v1/auth`, so the browser never sends it to /checkout — the check
  // could not pass even for a signed-in customer. In production it cannot pass
  // at all: the API is a different domain, so the cookie is not on this origin.
  // The effect was that every authenticated route bounced a logged-in user
  // straight back to /login. Browse mode hid it, because those routes redirect
  // to / there anyway.
  //
  // Widening the cookie's path would send a long-lived refresh token on every
  // request to the site, which is a real downgrade for a check that is only
  // cosmetic — the API authorises each request on its own, and every protected
  // page already handles the signed-out case itself.
  //
  // So the gate lives with the pages, which can see the in-memory session, and
  // middleware is left doing the one job it can do correctly: browse mode.
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static assets, images, _next internals, and API routes
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
