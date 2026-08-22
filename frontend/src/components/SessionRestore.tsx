"use client";

import { useEffect } from "react";
import axios from "axios";

import { API_V1 } from "@/lib/apiBase";
import { useAuthStore } from "@/store/useAuthStore";

/**
 * Rebuilds the session on page load from the httpOnly refresh cookie.
 *
 * The access token is held in memory and never written to localStorage, which
 * is what keeps it out of reach of injected script. The cost is that every
 * hard refresh, new tab or restored session starts with no token — and until
 * now nothing rebuilt it, so a signed-in customer appeared logged out after
 * any reload and every protected page bounced them to /login.
 *
 * One call at mount fixes that: the cookie is scoped to /api/v1/auth, so the
 * browser sends it here and nowhere else, and the response carries both a
 * fresh access token and the user.
 */
export function SessionRestore() {
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const markSessionChecked = useAuthStore((s) => s.markSessionChecked);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());

  useEffect(() => {
    if (isAuthenticated) {
      markSessionChecked();
      return; // already restored, or just signed in
    }
    let cancelled = false;

    async function attempt(): Promise<boolean> {
      const { data } = await axios.post(
        `${API_V1}/auth/refresh`,
        {},
        { withCredentials: true }
      );
      if (cancelled || !data?.access_token || !data?.user) return false;
      restoreSession(data.user, data.access_token);
      return true;
    }

    (async () => {
      try {
        await attempt();
      } catch {
        // Refresh tokens rotate on use, so two tabs loading together race:
        // one wins and the other presents a cookie that was just revoked. The
        // winner's replacement is already in the shared cookie jar, so a
        // single retry uses it and succeeds. Anything past that is genuinely
        // not signed in, and staying quiet is correct — this runs on every
        // page load including for visitors who have never logged in.
        await new Promise((r) => setTimeout(r, 1200));
        try {
          await attempt();
        } catch {
          /* not signed in */
        }
      } finally {
        // Always, success or failure: protected pages are waiting on this to
        // know whether "no user" means "signed out" or "not asked yet".
        if (!cancelled) markSessionChecked();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, restoreSession, markSessionChecked]);

  return null;
}
