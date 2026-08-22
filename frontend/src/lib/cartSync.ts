/**
 * Mirrors the local cart onto the server cart.
 *
 * There are two carts and they used to disagree. Everything the customer
 * touches writes to the local store; /checkout reads the server cart via
 * useCart(). Adding from a product page therefore produced a full drawer and
 * an empty checkout.
 *
 * The local cart stays the one the customer sees, because it has to work
 * before they log in — forcing account creation to hold a cart is a large
 * share of Indian mobile checkout drop-off. The server copy is kept in step so
 * that by the time checkout reads it, it says the same thing.
 *
 * Every function here is best-effort. A failed mirror must never break adding
 * to a cart: the local cart is still correct, and the merge on login repairs
 * the server copy wholesale.
 */
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";

/**
 * Whether the client *believes* it is signed in.
 *
 * Only a hint, never a gate. The auth store is not persisted and the access
 * token lives in memory, so any full page load resets this to false while the
 * httpOnly refresh cookie is still perfectly valid. Gating on it meant a
 * signed-in customer who reloaded silently stopped mirroring, and arrived at
 * checkout with a server cart missing everything added after the reload.
 *
 * The server is the authority on whether a request is authenticated, so we ask
 * it. api.ts refreshes and retries on 401.
 */
function believesSignedIn(): boolean {
  try {
    return useAuthStore.getState().isAuthenticated();
  } catch {
    return false;
  }
}

/**
 * Set once a request comes back 401 *after* the refresh interceptor gave up,
 * which means there is genuinely no session. Stops a guest firing a doomed
 * request on every cart interaction. Cleared the moment a call succeeds or a
 * merge runs, so signing in resumes mirroring immediately.
 */
let knownGuest = false;

async function mirror(action: string, fn: () => Promise<unknown>): Promise<void> {
  // A client that knows it is signed in makes any earlier 401 stale. Without
  // this, a visitor who browsed as a guest (latching the flag) and then signed
  // in with an empty cart never mirrored again for the whole session, because
  // the only other place the latch cleared was a merge — and a merge returns
  // early when there is nothing to merge.
  if (believesSignedIn()) knownGuest = false;
  if (knownGuest) return;
  try {
    await fn();
    knownGuest = false;
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 401 || status === 403) knownGuest = true;
    swallow(action, err);
  }
}

function swallow(action: string, err: unknown) {
  // Out-of-stock and similar 409s are real answers, but the local cart is not
  // the place to surface them — checkout re-validates against stock anyway.
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[cartSync] ${action} failed`, err);
  }
}

export async function pushAdd(variantId: string, quantity = 1): Promise<void> {
  await mirror("add", () =>
    api.post("/cart/items", { variant_id: variantId, quantity })
  );
}

export async function pushRemove(variantId: string): Promise<void> {
  await mirror("remove", () => api.delete(`/cart/items/${variantId}`));
}

/**
 * Set an absolute quantity.
 *
 * The server's PUT takes a cart-item id, which the local store never sees — it
 * keys everything by variant. POST increments rather than sets. So the only
 * operation expressible with a variant id alone is remove-then-add.
 */
export async function pushSetQuantity(variantId: string, quantity: number): Promise<void> {
  if (quantity <= 0) return pushRemove(variantId);
  await mirror("setQuantity", async () => {
    await api.delete(`/cart/items/${variantId}`).catch(() => undefined);
    await api.post("/cart/items", { variant_id: variantId, quantity });
  });
}

/**
 * Make the server cart match the local one, item for item.
 *
 * Runs once at login, which is the moment a guest's cart has to become a real
 * one. Each item is removed first so a server cart left over from a previous
 * session cannot double the quantities.
 */
export async function mergeLocalCart(
  items: { id: string; quantity: number }[]
): Promise<void> {
  knownGuest = false; // a merge only runs on sign-in, so any past 401 is stale
  if (items.length === 0) return;
  for (const item of items) {
    await mirror(`merge ${item.id}`, async () => {
      await api.delete(`/cart/items/${item.id}`).catch(() => undefined);
      await api.post("/cart/items", {
        variant_id: item.id,
        quantity: item.quantity,
      });
    });
  }
}
