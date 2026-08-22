import { create } from "zustand";
import { setAccessToken } from "@/lib/api";

export interface AuthUser {
  id: string;
  phone: string;
  name?: string | null;
  email?: string | null;
  role: "user" | "admin" | "operations" | "finance";
}

interface AuthStore {
  user: AuthUser | null;
  pendingPhone: string | null; // Held during OTP flow, cleared on success/cancel
  /**
   * True once the one-shot restore from the refresh cookie has finished,
   * whether it found a session or not.
   *
   * Protected pages must wait for this before concluding the visitor is signed
   * out. Restoration is a network round trip, so on first render there is
   * simply no answer yet — and redirecting on "no answer" bounced signed-in
   * customers to /login before the cookie had been read.
   */
  sessionChecked: boolean;

  setAuth: (user: AuthUser, accessToken: string) => void;
  restoreSession: (user: AuthUser, accessToken: string) => void;
  markSessionChecked: () => void;
  clearAuth: () => void;
  setPendingPhone: (phone: string) => void;
  clearPendingPhone: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  pendingPhone: null,
  sessionChecked: false,

  markSessionChecked: () => set({ sessionChecked: true }),

  setAuth: (user, accessToken) => {
    setAccessToken(accessToken);
    set({ user });

    // The moment a guest becomes a customer, their cart has to stop being
    // local-only: /checkout reads the server cart. Imported dynamically so the
    // auth store does not take a static dependency on the cart store, which
    // depends on cartSync, which reads this store.
    if (typeof window !== "undefined") {
      void (async () => {
        try {
          const [{ useCartStore }, { mergeLocalCart }] = await Promise.all([
            import("@/store/useCartStore"),
            import("@/lib/cartSync"),
          ]);
          await mergeLocalCart(useCartStore.getState().items);
        } catch {
          // A failed merge leaves the local cart intact and the customer can
          // still see it; checkout re-reads the server cart on mount.
        }
      })();
    }
    if (typeof window !== "undefined") {
      import("@sentry/nextjs").then(({ setUser }) => {
        setUser({ id: user?.id, username: user?.phone });
      });
    }
  },

  /**
   * Re-establish a session that already existed, from the refresh cookie.
   *
   * Deliberately not setAuth. setAuth means "someone just signed in" and
   * merges the guest cart onto the server — doing that on every page load
   * would re-POST every cart line on each refresh, and a cart write costs
   * seconds. Restoring is not signing in.
   */
  restoreSession: (user, accessToken) => {
    setAccessToken(accessToken);
    set({ user });
    if (typeof window !== "undefined") {
      import("@sentry/nextjs").then(({ setUser }) => {
        setUser({ id: user?.id, username: user?.phone });
      });
    }
  },

  clearAuth: () => {
    setAccessToken(null);
    set({ user: null });
    if (typeof window !== "undefined") {
      import("@sentry/nextjs").then(({ setUser }) => {
        setUser(null);
      });
    }
  },

  setPendingPhone: (phone) => set({ pendingPhone: phone }),
  clearPendingPhone: () => set({ pendingPhone: null }),

  isAuthenticated: () => get().user !== null,
}));
