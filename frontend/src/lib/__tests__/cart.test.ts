/**
 * The cart is the highest-consequence, least-covered code in the frontend.
 *
 * Every case here was found or confirmed by walking the real thing in a
 * browser against a live checkout. They are written down so the next change
 * cannot quietly undo them:
 *
 *   - a guest can build a cart and it survives a reload
 *   - signing in merges that cart onto the server
 *   - adding the same variant increments rather than duplicating
 *   - mirroring is NOT gated on client-side auth state, because that state is
 *     wiped by any page load while the refresh cookie is still valid — the bug
 *     that would have sent customers to checkout with a stale server cart
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const posts: { url: string; body?: unknown }[] = [];
const deletes: string[] = [];
let nextError: { response?: { status?: number } } | null = null;

vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn(async (url: string, body?: unknown) => {
      if (nextError) {
        const e = nextError;
        nextError = null;
        throw e;
      }
      posts.push({ url, body });
      return { data: {} };
    }),
    delete: vi.fn(async (url: string) => {
      deletes.push(url);
      return { data: {} };
    }),
  },
  setAccessToken: vi.fn(),
}));

let signedIn = false;
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: {
    getState: () => ({ isAuthenticated: () => signedIn }),
  },
}));

import { mergeLocalCart, pushAdd, pushRemove, pushSetQuantity } from "@/lib/cartSync";
import { useCartStore } from "@/store/useCartStore";

const item = (id: string, quantity = 1) => ({
  id, name: `Item ${id}`, price: 2499, quantity, image: "/x.jpg", size: "M",
});

beforeEach(async () => {
  signedIn = true;
  nextError = null;
  // cartSync keeps a module-level "known guest" latch, which survives between
  // tests in the same file. An empty merge clears it without any network call.
  await mergeLocalCart([]);
  posts.length = 0;
  deletes.length = 0;
  localStorage.clear();
  useCartStore.setState({ items: [], isOpen: false });
});

describe("the cart a customer sees", () => {
  it("holds items for a guest, before any sign-in", () => {
    useCartStore.getState().addItem(item("v1"));
    expect(useCartStore.getState().items).toHaveLength(1);
  });

  it("adding the same variant increments instead of adding a second line", () => {
    useCartStore.getState().addItem(item("v1"));
    useCartStore.getState().addItem(item("v1"));
    const { items } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
  });

  it("persists to localStorage so a reload does not empty it", async () => {
    useCartStore.getState().addItem(item("v1", 3));
    await Promise.resolve();
    const raw = localStorage.getItem("zisun-cart");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state.items[0].quantity).toBe(3);
  });

  it("does not persist drawer visibility", async () => {
    useCartStore.getState().toggleCart();
    useCartStore.getState().addItem(item("v1"));
    await Promise.resolve();
    expect(JSON.parse(localStorage.getItem("zisun-cart")!).state.isOpen).toBeUndefined();
  });

  it("setting quantity to zero removes the line", () => {
    useCartStore.getState().addItem(item("v1", 2));
    useCartStore.getState().updateQuantity("v1", 0);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it("totals by quantity", () => {
    useCartStore.getState().addItem(item("v1", 2));
    useCartStore.getState().addItem({ ...item("v2"), price: 1000 });
    expect(useCartStore.getState().getCartTotal()).toBe(2499 * 2 + 1000);
  });
});

describe("mirroring to the server cart", () => {
  it("attempts the call even when the client believes it is signed out", async () => {
    signedIn = false;
    // The regression that motivated this file. useAuthStore is not persisted
    // and the token is in memory, so after any page load the client believes
    // it is a guest while the refresh cookie is still good. Gating on that
    // belief silently stopped mirroring and stranded the server cart.
    await pushAdd("v1", 1);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toEqual({ url: "/cart/items", body: { variant_id: "v1", quantity: 1 } });
  });

  it("stops retrying once the server says there is genuinely no session", async () => {
    signedIn = false;
    nextError = { response: { status: 401 } };
    await pushAdd("v1", 1);      // 401 -> latch
    await pushAdd("v2", 1);      // skipped
    expect(posts).toHaveLength(0);
  });

  it("resumes the moment a merge runs, because that only happens on sign-in", async () => {
    signedIn = false;
    nextError = { response: { status: 401 } };
    await pushAdd("v1", 1);
    await mergeLocalCart([{ id: "v9", quantity: 2 }]);
    expect(posts.some((p) => JSON.stringify(p.body).includes("v9"))).toBe(true);
  });

  it("a failed mirror never throws into the caller", async () => {
    nextError = { response: { status: 500 } };
    await expect(pushAdd("v1", 1)).resolves.toBeUndefined();
  });

  it("sets an absolute quantity by remove-then-add", async () => {
    // The server's PUT takes a cart-item id the local store never sees, and
    // POST increments rather than sets, so this is the only expressible form.
    await pushSetQuantity("v1", 4);
    expect(deletes).toEqual(["/cart/items/v1"]);
    expect(posts[0].body).toEqual({ variant_id: "v1", quantity: 4 });
  });

  it("treats a zero quantity as a removal", async () => {
    await pushSetQuantity("v1", 0);
    expect(deletes).toEqual(["/cart/items/v1"]);
    expect(posts).toHaveLength(0);
  });

  it("removes by variant id", async () => {
    await pushRemove("v1");
    expect(deletes).toEqual(["/cart/items/v1"]);
  });
});

describe("merging a guest cart at sign-in", () => {
  it("removes each line before adding it, so a stale server cart cannot double up", async () => {
    await mergeLocalCart([{ id: "v1", quantity: 2 }, { id: "v2", quantity: 1 }]);
    expect(deletes).toEqual(["/cart/items/v1", "/cart/items/v2"]);
    expect(posts.map((p) => p.body)).toEqual([
      { variant_id: "v1", quantity: 2 },
      { variant_id: "v2", quantity: 1 },
    ]);
  });

  it("does nothing for an empty cart", async () => {
    await mergeLocalCart([]);
    expect(posts).toHaveLength(0);
    expect(deletes).toHaveLength(0);
  });
});
