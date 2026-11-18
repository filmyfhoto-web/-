/**
 * Redirect / navigation-loop diagnostics.
 *
 * Symptom we hunt: the app "เด้งไปมา" — the same path is entered again and
 * again, or two paths ping-pong (A → B → A → B). Both are invisible in normal
 * logs because each individual navigation looks legitimate.
 *
 * Everything is kept in localStorage on the device (no PII, only paths and
 * timings) so support can read it from the admin dashboard of that device.
 */

export type NavVisit = { path: string; t: number };

export type LoopIncident = {
  /** stable id: kind + signature */
  id: string;
  kind: "repeat" | "pingpong";
  /** "/shop" or "/shop ⇄ /login" */
  signature: string;
  /** how many navigations took part in the loop (grows while it repeats) */
  count: number;
  /** ISO of first and last navigation of this loop */
  firstAt: string;
  lastAt: string;
  /** average gap between consecutive repeats, in ms ("เวลาดับเบิล") */
  avgIntervalMs: number;
  /** shortest gap seen, in ms */
  minIntervalMs: number;
  ua?: string;
};

const VISITS_KEY = "nav_diag_visits_v1";
const LOOPS_KEY = "nav_diag_loops_v1";
/** navigations older than this are irrelevant for loop detection */
export const WINDOW_MS = 10_000;
/** same path this many times inside the window = a loop */
export const REPEAT_THRESHOLD = 3;
/** A→B→A→B inside the window = a ping-pong loop */
export const PINGPONG_THRESHOLD = 4;
const MAX_VISITS = 30;
const MAX_LOOPS = 30;
/** merge into the previous incident instead of creating a new one */
const MERGE_WINDOW_MS = 30_000;

function read<T>(key: string): T[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as T[]) : [];
  } catch {
    return [];
  }
}

function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

export function readNavVisits(): NavVisit[] { return read<NavVisit>(VISITS_KEY); }
export function readLoopIncidents(): LoopIncident[] { return read<LoopIncident>(LOOPS_KEY); }

export function clearNavDiagnostics() {
  try {
    localStorage.removeItem(VISITS_KEY);
    localStorage.removeItem(LOOPS_KEY);
  } catch { /* private mode */ }
}

function intervals(times: number[]): { avg: number; min: number } {
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i += 1) gaps.push(times[i] - times[i - 1]);
  if (!gaps.length) return { avg: 0, min: 0 };
  return {
    avg: Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length),
    min: Math.min(...gaps),
  };
}

/** Pure detector — exported so tests can drive it without a browser. */
export function detectLoop(recent: NavVisit[]): Omit<LoopIncident, "id" | "ua"> | null {
  if (recent.length < REPEAT_THRESHOLD) return null;
  const last = recent[recent.length - 1];

  // 1. same path over and over
  const same = recent.filter((v) => v.path === last.path);
  if (same.length >= REPEAT_THRESHOLD) {
    const times = same.map((v) => v.t);
    const { avg, min } = intervals(times);
    return {
      kind: "repeat",
      signature: last.path,
      count: same.length,
      firstAt: new Date(times[0]).toISOString(),
      lastAt: new Date(times[times.length - 1]).toISOString(),
      avgIntervalMs: avg,
      minIntervalMs: min,
    };
  }

  // 2. two paths bouncing off each other
  const tail = recent.slice(-PINGPONG_THRESHOLD);
  if (tail.length === PINGPONG_THRESHOLD) {
    const [a, b] = [tail[0].path, tail[1].path];
    const alternating =
      a !== b && tail.every((v, i) => v.path === (i % 2 === 0 ? a : b));
    if (alternating) {
      const times = tail.map((v) => v.t);
      const { avg, min } = intervals(times);
      return {
        kind: "pingpong",
        signature: `${a} ⇄ ${b}`,
        count: tail.length,
        firstAt: new Date(times[0]).toISOString(),
        lastAt: new Date(times[times.length - 1]).toISOString(),
        avgIntervalMs: avg,
        minIntervalMs: min,
      };
    }
  }

  return null;
}

/**
 * Record one navigation. Returns the loop incident when this navigation
 * completed (or extended) a loop, otherwise null.
 */
export function recordNavigation(path: string, now = Date.now()): LoopIncident | null {
  const visits = [...readNavVisits(), { path, t: now }]
    .filter((v) => now - v.t <= WINDOW_MS)
    .slice(-MAX_VISITS);
  write(VISITS_KEY, visits);

  const found = detectLoop(visits);
  if (!found) return null;

  const id = `${found.kind}:${found.signature}`;
  const loops = readLoopIncidents();
  const prev = loops.find(
    (l) => l.id === id && now - Date.parse(l.lastAt) <= MERGE_WINDOW_MS,
  );

  const incident: LoopIncident = prev
    ? {
        ...prev,
        count: Math.max(prev.count, found.count),
        lastAt: found.lastAt,
        avgIntervalMs: found.avgIntervalMs || prev.avgIntervalMs,
        minIntervalMs: Math.min(prev.minIntervalMs || found.minIntervalMs, found.minIntervalMs),
      }
    : {
        ...found,
        id,
        ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 160) : undefined,
      };

  const next = [...loops.filter((l) => l !== prev), incident].slice(-MAX_LOOPS);
  write(LOOPS_KEY, next);

  console.warn(
    `[nav] ตรวจพบการวนหน้า (${incident.kind}) ${incident.signature} — ${incident.count} ครั้ง, เฉลี่ยทุก ${incident.avgIntervalMs}ms`,
  );
  return incident;
}