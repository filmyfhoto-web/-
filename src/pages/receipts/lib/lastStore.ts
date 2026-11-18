import type { StoreSlug } from "../types";

const KEY = "receipts:last_store";

export function getLastStore(): StoreSlug | null {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "colorlab" || v === "printing" || v === "film") return v;
  } catch { /* noop */ }
  return null;
}

export function setLastStore(slug: StoreSlug): void {
  try { localStorage.setItem(KEY, slug); } catch { /* noop */ }
}

export function storeEntryPath(slug: StoreSlug): string {
  return slug === "film" ? "/admin/home" : `/receipts/${slug}/dashboard`;
}

export const STORE_LABEL: Record<StoreSlug, string> = {
  colorlab: "Colorlab",
  printing: "Printing",
  film: "FILM SHOP",
};