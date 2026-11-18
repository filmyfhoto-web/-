// localStorage-backed import history per store.
// Lightweight (no DB migration needed) and survives reloads on the same device.

export type ImportHistoryEntry = {
  id: string;
  at: number;             // epoch ms
  source: "paste" | "file";
  fileName?: string;
  delimiter?: string;
  hadHeader?: boolean;
  rowCount: number;
  errorCount: number;
  sample: string[];       // first few item names
  items: { name: string; price: number; quantity: number; unit: string }[];
};

const KEY = (storeId: string) => `rds:import-history:${storeId}`;
const MAX = 30;

export function loadImportHistory(storeId: string): ImportHistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY(storeId));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function pushImportHistory(storeId: string, entry: ImportHistoryEntry) {
  try {
    const list = loadImportHistory(storeId);
    list.unshift(entry);
    const trimmed = list.slice(0, MAX);
    localStorage.setItem(KEY(storeId), JSON.stringify(trimmed));
  } catch { /* noop */ }
}

export function clearImportHistory(storeId: string) {
  try { localStorage.removeItem(KEY(storeId)); } catch { /* noop */ }
}