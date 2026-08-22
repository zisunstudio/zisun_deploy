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

function signedIn(): boolean {
  try {
    return useAuthStore.getState().isAuthenticated();
  } catch {
    return false;
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
  if (!signedIn()) return;
  try {
    await api.post("/cart/items", { variant_id: variantId, quantity });
  } catch (err) {
    swallow("add", err);
  }
}

export async function pushRemove(variantId: string): Promise<void> {
  if (!signedIn()) return;
  try {
    await api.delete(`/cart/items/${variantId}`);
  } catch (err) {
    swallow("remove", err);
  }
}

/**
 * Set an absolute quantity.
 *
 * The server's PUT takes a cart-item id, which the local store never sees — it
 * keys everything by variant. POST increments rather than sets. So the only
 * operation expressible with a variant id alone is remove-then-add.
 */
export async function pushSetQuantity(variantId: string, quantity: number): Promise<void> {
  if (!signedIn()) return;
  if (quantity <= 0) return pushRemove(variantId);
  try {
    await api.delete(`/cart/items/${variantId}`).catch(() => undefined);
    await api.post("/cart/items", { variant_id: variantId, quantity });
  } catch (err) {
    swallow("setQuantity", err);
  }
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
  if (!signedIn() || items.length === 0) return;
  for (const item of items) {
    try {
      await api.delete(`/cart/items/${item.id}`).catch(() => undefined);
      await api.post("/cart/items", {
        variant_id: item.id,
        quantity: item.quantity,
      });
    } catch (err) {
      swallow(`merge ${item.id}`, err);
    }
  }
}
