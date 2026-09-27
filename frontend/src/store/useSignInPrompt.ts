import { create } from "zustand";

/**
 * Opens the in-page sign-in card (components/SignInSheet.tsx) from anywhere.
 *
 * Signing in used to mean leaving the page for /login - from the wishlist
 * heart, the wishlist page and the profile page. Now each of those opens the
 * card over what she was looking at, and she stays where she was. /login
 * still exists for someone who signed out and wants to sign back in on
 * purpose.
 */
interface SignInPrompt {
  open: boolean;
  reason: string | null;
  show: (reason: string) => void;
  hide: () => void;
}

export const useSignInPrompt = create<SignInPrompt>((set) => ({
  open: false,
  reason: null,
  show: (reason) => set({ open: true, reason }),
  hide: () => set({ open: false, reason: null }),
}));
