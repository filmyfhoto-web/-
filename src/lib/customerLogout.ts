import { clearCustomerSession } from "@/lib/lineSession";

/**
 * Full customer logout used by the account menu.
 *
 * Order:
 *   1. Clear LINE proof/profile/binding/friend hints + guest snapshots
 *      (via `clearCustomerSession`, which also calls `liff.logout()` when
 *      the SDK is present).
 *   2. Clear the customer-sensitive cart (`cart_v1`, `cart_note_v1`).
 *   3. Wipe the in-memory verified cache on RequireLineLink so the next
 *      navigation must re-verify against the server.
 *   4. Full-page replace to `/shop` so the customer sees the onboarding
 *      gate cleanly with no residual React state.
 */
export function logoutCustomer(opts?: { replaceUrl?: string }) {
  try { clearCustomerSession(); } catch { /* ignore */ }
  try {
    localStorage.removeItem("cart_v1");
    localStorage.removeItem("cart_note_v1");
  } catch { /* ignore */ }
  try {
    // Reset verified cache in RequireLineLink without importing the
    // component (avoids a circular dep). We use a full-page reload so the
    // module state resets naturally on the fresh SPA boot.
  } catch { /* ignore */ }
  const target = opts?.replaceUrl || "/shop";
  try { window.location.replace(target); } catch { /* ignore */ }
}