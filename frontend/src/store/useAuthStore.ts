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

  setAuth: (user: AuthUser, accessToken: string) => void;
  clearAuth: () => void;
  setPendingPhone: (phone: string) => void;
  clearPendingPhone: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  pendingPhone: null,

  setAuth: (user, accessToken) => {
    setAccessToken(accessToken);
    set({ user });
  },

  clearAuth: () => {
    setAccessToken(null);
    set({ user: null });
  },

  setPendingPhone: (phone) => set({ pendingPhone: phone }),
  clearPendingPhone: () => set({ pendingPhone: null }),

  isAuthenticated: () => get().user !== null,
}));
