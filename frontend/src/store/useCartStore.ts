import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import { pushAdd, pushRemove, pushSetQuantity } from "@/lib/cartSync";

export interface CartItem {
  id: string; // product variant id
  name: string;
  price: number;
  quantity: number;
  image: string;
  size?: string;
}

interface CartStore {
  items: CartItem[];
  isOpen: boolean;
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  toggleCart: () => void;
  clearCart: () => void;
  getCartTotal: () => number;
}

/**
 * The cart the customer sees.
 *
 * Persisted, so a refresh does not empty it and a guest can build a cart
 * before signing in — requiring an account to hold a cart is a large share of
 * Indian mobile checkout drop-off.
 *
 * Every mutation is mirrored to the server cart, because /checkout reads that
 * one. The mirror is fire-and-forget: it must never block or fail an add, and
 * the merge at login rebuilds the server copy from this one regardless.
 */
export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,

      addItem: (newItem) => {
        set((state) => {
          const existing = state.items.find((i) => i.id === newItem.id);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.id === newItem.id
                  ? { ...i, quantity: i.quantity + newItem.quantity }
                  : i
              ),
            };
          }
          return { items: [...state.items, newItem] };
        });
        // The server increments too, so the same delta is sent either way.
        void pushAdd(newItem.id, newItem.quantity);
      },

      removeItem: (id) => {
        set((state) => ({ items: state.items.filter((i) => i.id !== id) }));
        void pushRemove(id);
      },

      updateQuantity: (id, quantity) => {
        if (quantity <= 0) {
          get().removeItem(id);
          return;
        }
        set((state) => ({
          items: state.items.map((i) => (i.id === id ? { ...i, quantity } : i)),
        }));
        void pushSetQuantity(id, quantity);
      },

      toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),

      clearCart: () => set({ items: [] }),

      getCartTotal: () =>
        get().items.reduce((total, i) => total + i.price * i.quantity, 0),
    }),
    {
      name: "zisun-cart",
      storage: createJSONStorage(() => localStorage),
      // isOpen is view state. Persisting it would reopen the drawer on every
      // visit for anyone who closed the tab with it open.
      partialize: (state) => ({ items: state.items }),
      version: 1,
    }
  )
);
