/**
 * Rolling-window guard for *update* reloads.
 *
 * A stale shell that keeps believing "a newer build is live" used to reload
 * the phone over and over, which reads as "แอปค้าง/เด้ง" to the user. Every
 * automatic reload must go through this guard: at most `MAX_RELOADS` reloads
 * inside `WINDOW_MS`, after which the app simply keeps running on the build
 * it has (an update failure must never block usage).
 */
const KEY = "app:update-reloads";
export const RELOAD_WINDOW_MS = 60_000;
export const MAX_RELOADS = 2;

type Entry = { at: number[] };

function read(now: number): number[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Entry;
    if (!parsed || !Array.isArray(parsed.at)) return [];
    return parsed.at.filter((t) => typeof t === "number" && now - t < RELOAD_WINDOW_MS);
  } catch {
    return [];
  }
}

/** Pure core so tests don't need sessionStorage. */
export function withinReloadBudget(times: number[], now: number): boolean {
  return times.filter((t) => now - t < RELOAD_WINDOW_MS).length < MAX_RELOADS;
}

/**
 * True when another update reload is allowed right now — and records it.
 * Returns false once the budget for the window is used up.
 */
export function claimUpdateReload(now: number = Date.now()): boolean {
  const times = read(now);
  if (!withinReloadBudget(times, now)) return false;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ at: [...times, now] } satisfies Entry));
  } catch {
    /* private mode: allow the reload, the in-memory guards still apply */
  }
  return true;
}
