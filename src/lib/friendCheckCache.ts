// Session-scoped cache for admin friend-check results.
// Keeps LINE Messaging API traffic down when staff re-open the page or
// hit "check page" repeatedly. TTL defaults to 5 minutes.
import type { FriendStatus } from "@/lib/lineFriend";

export type FriendCacheEntry = {
  status: FriendStatus;
  checked_at: string;
  reason?: string;
  http_status?: number;
};

export type FriendCacheMap = Record<string, FriendCacheEntry>;

const KEY = "admin:friend-check:v1";
export const DEFAULT_FRIEND_TTL_MS = 5 * 60 * 1000;

function safeStore(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch { return null; }
}

export function readFriendCache(): FriendCacheMap {
  const s = safeStore();
  if (!s) return {};
  try {
    const raw = s.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as FriendCacheMap) : {};
  } catch { return {}; }
}

function writeCache(map: FriendCacheMap): void {
  const s = safeStore();
  if (!s) return;
  try { s.setItem(KEY, JSON.stringify(map)); } catch { /* ignore quota */ }
}

function isFresh(entry: FriendCacheEntry | undefined, ttlMs: number, now: number): boolean {
  if (!entry?.checked_at) return false;
  const t = Date.parse(entry.checked_at);
  if (!Number.isFinite(t)) return false;
  return now - t < ttlMs;
}

export function getCachedFriend(
  id: string,
  ttlMs: number = DEFAULT_FRIEND_TTL_MS,
  now: number = Date.now(),
): FriendCacheEntry | null {
  const entry = readFriendCache()[id];
  return isFresh(entry, ttlMs, now) ? entry : null;
}

export function setCachedFriend(entries: FriendCacheMap): void {
  const map = readFriendCache();
  writeCache({ ...map, ...entries });
}

export function filterUncached(
  ids: string[],
  ttlMs: number = DEFAULT_FRIEND_TTL_MS,
  now: number = Date.now(),
): string[] {
  const map = readFriendCache();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (!isFresh(map[id], ttlMs, now)) out.push(id);
  }
  return out;
}

export function clearFriendCache(ids?: string[]): void {
  if (!ids) { writeCache({}); return; }
  const map = readFriendCache();
  for (const id of ids) delete map[id];
  writeCache(map);
}