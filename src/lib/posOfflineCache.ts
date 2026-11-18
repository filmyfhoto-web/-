/**
 * Offline snapshot for the touch register (/pos/register).
 *
 * The shop's internet drops regularly, so the register keeps the last good
 * catalog + store branding in localStorage: the screen paints from the
 * snapshot immediately and stays usable (browse, look up prices, reprint a
 * receipt) while the network is down. Writing a sale still requires the
 * network — nothing is queued offline.
 */

export const POS_CACHE_VERSION = 2;
/** A snapshot older than this is still shown, but flagged as stale. */
export const POS_CACHE_STALE_MS = 24 * 60 * 60 * 1000;

type Envelope<T> = { v: number; savedAt: string; data: T };

export type PosCacheSnapshot<T> = { data: T; savedAt: Date; stale: boolean };

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function saveOfflineSnapshot<T>(key: string, data: T): void {
  const s = storage();
  if (!s) return;
  try {
    const env: Envelope<T> = { v: POS_CACHE_VERSION, savedAt: new Date().toISOString(), data };
    s.setItem(key, JSON.stringify(env));
  } catch {
    /* quota / private mode — the register just runs without a snapshot */
  }
}

export function readOfflineSnapshot<T>(key: string, now: number = Date.now()): PosCacheSnapshot<T> | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<T>;
    // A snapshot written by an older build may not match today's shape.
    if (!env || env.v !== POS_CACHE_VERSION || !env.savedAt) {
      s.removeItem(key);
      return null;
    }
    const savedAt = new Date(env.savedAt);
    if (Number.isNaN(savedAt.getTime())) {
      s.removeItem(key);
      return null;
    }
    return { data: env.data, savedAt, stale: now - savedAt.getTime() > POS_CACHE_STALE_MS };
  } catch {
    return null;
  }
}

export function clearOfflineSnapshot(key: string): void {
  try { storage()?.removeItem(key); } catch { /* ignore */ }
}

/** Catalog snapshot key — one per register store so branches don't collide. */
export const posCatalogKey = (storeKey: string) => `pos.offline.catalog.${storeKey}`;
/** Store branding snapshot key (used by the register header and receipts). */
export const posStoreProfileKey = (storeKey: string) => `pos.offline.store.${storeKey}`;

/** "อัปเดตล่าสุด 14:32" for the offline banner. */
export function describeSnapshotAge(savedAt: Date | null): string {
  if (!savedAt) return "ยังไม่มีข้อมูลที่บันทึกไว้";
  return `ใช้ข้อมูลล่าสุดเมื่อ ${savedAt.toLocaleString("th-TH", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  })}`;
}