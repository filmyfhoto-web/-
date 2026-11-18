/**
 * Remembers which products the customer ordered last time so the storefront
 * can offer "สั่งซ้ำจากครั้งก่อน" without an extra round-trip.
 */
const KEY = "recent_ordered_products_v1";
const LIMIT = 20;

export function readRecentOrderedProductIds(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string").slice(0, LIMIT) : [];
  } catch {
    return [];
  }
}

export function rememberOrderedProductIds(ids: string[]): void {
  try {
    const merged = [...new Set([...ids.filter(Boolean), ...readRecentOrderedProductIds()])].slice(0, LIMIT);
    localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    /* ignore */
  }
}
