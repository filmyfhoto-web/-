/**
 * Film Shop production-queue scheduler.
 *
 * Pure, deterministic and timezone-safe (all wall-clock maths happen in
 * Asia/Bangkok, +07:00 with no DST). Used by the queue UI and by the
 * "recalculate" action whenever jobs, urgency, status, quantity or the
 * standard durations change.
 */

export const BKK_OFFSET_MS = 7 * 3600_000;

export interface QueueSettings {
  timezone: string;
  /** "HH:MM" shop opening time */
  openTime: string;
  /** "HH:MM" shop closing time */
  closeTime: string;
  /** ISO weekday numbers that the shop works (0 = Sunday … 6 = Saturday) */
  workingDays: number[];
  /** how many jobs can run in parallel */
  capacity: number;
  /** clean-up / hand-over minutes inserted after each job */
  bufferMinutes: number;
}

export const DEFAULT_QUEUE_SETTINGS: QueueSettings = {
  timezone: "Asia/Bangkok",
  openTime: "08:30",
  closeTime: "18:00",
  workingDays: [1, 2, 3, 4, 5, 6],
  capacity: 1,
  bufferMinutes: 10,
};

export interface JobTypeDuration {
  jobType: string;
  label?: string;
  setupMinutes: number;
  minutesPerUnit: number;
}

export interface SchedulableJob {
  id: string;
  /** lower = earlier; urgent jobs are lifted above everything unlocked */
  priority: number;
  isUrgent: boolean;
  estimatedMinutes: number;
  /** locked jobs keep their planned window and are never moved */
  scheduleLocked?: boolean;
  plannedStartAt?: string | Date | null;
  plannedFinishAt?: string | Date | null;
}

export interface ScheduledSlot {
  start: Date;
  finish: Date;
  locked: boolean;
}

/** Standard estimate: setup + per-unit time, min 5 minutes. */
export function estimateMinutes(
  jobType: string | null | undefined,
  quantity: number | null | undefined,
  durations: JobTypeDuration[],
): number {
  const d =
    durations.find((x) => x.jobType === (jobType || "")) ||
    durations.find((x) => x.jobType === "other");
  const setup = d?.setupMinutes ?? 15;
  const per = d?.minutesPerUnit ?? 10;
  const qty = Math.max(1, Number(quantity) || 1);
  return Math.max(5, Math.round(setup + per * qty));
}

function hm(text: string): number {
  const [h, m] = String(text || "0:0").split(":").map((n) => Number(n) || 0);
  return h * 60 + m;
}

/** Minutes since midnight, Bangkok wall clock. */
function bkkMinuteOfDay(ms: number): number {
  const d = new Date(ms + BKK_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** 0 = Sunday … 6 = Saturday, Bangkok wall clock. */
function bkkWeekday(ms: number): number {
  return new Date(ms + BKK_OFFSET_MS).getUTCDay();
}

/** Epoch ms of Bangkok midnight for the day containing `ms`. */
function bkkMidnight(ms: number): number {
  const d = new Date(ms + BKK_OFFSET_MS);
  const midUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return midUtc - BKK_OFFSET_MS;
}

/** Move a timestamp forward to the next instant the shop is open. */
export function nextWorkingInstant(ms: number, s: QueueSettings): number {
  const open = hm(s.openTime);
  const close = hm(s.closeTime);
  const days = s.workingDays.length ? s.workingDays : [0, 1, 2, 3, 4, 5, 6];
  let cur = ms;
  for (let i = 0; i < 400; i++) {
    const mid = bkkMidnight(cur);
    if (!days.includes(bkkWeekday(cur))) {
      cur = mid + 86400_000 + open * 60_000;
      continue;
    }
    const mod = bkkMinuteOfDay(cur);
    if (mod < open) return mid + open * 60_000;
    if (mod >= close) {
      cur = mid + 86400_000 + open * 60_000;
      continue;
    }
    return cur;
  }
  return cur;
}

/** Consume `minutes` of working time starting at `ms`, skipping closed hours. */
export function addWorkingMinutes(ms: number, minutes: number, s: QueueSettings): number {
  const close = hm(s.closeTime);
  let cur = nextWorkingInstant(ms, s);
  let left = Math.max(0, minutes);
  for (let i = 0; i < 800 && left > 0; i++) {
    const mid = bkkMidnight(cur);
    const endOfDay = mid + close * 60_000;
    const avail = Math.floor((endOfDay - cur) / 60_000);
    if (avail >= left) return cur + left * 60_000;
    left -= Math.max(0, avail);
    cur = nextWorkingInstant(endOfDay, s);
  }
  return cur;
}

function toMs(v: string | Date | null | undefined): number | null {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/**
 * Plan the queue. Locked jobs keep their window and block their lane;
 * urgent jobs jump ahead of the remaining unlocked work.
 */
export function scheduleQueue(
  jobs: SchedulableJob[],
  settings: QueueSettings = DEFAULT_QUEUE_SETTINGS,
  from: Date = new Date(),
): Record<string, ScheduledSlot> {
  const s = { ...DEFAULT_QUEUE_SETTINGS, ...settings };
  const capacity = Math.max(1, Math.floor(s.capacity) || 1);
  const start0 = nextWorkingInstant(from.getTime(), s);
  const lanes: number[] = Array.from({ length: capacity }, () => start0);
  const out: Record<string, ScheduledSlot> = {};

  const locked = jobs
    .filter((j) => j.scheduleLocked && toMs(j.plannedStartAt) !== null)
    .sort((a, b) => (toMs(a.plannedStartAt)! - toMs(b.plannedStartAt)!));

  for (const j of locked) {
    const st = toMs(j.plannedStartAt)!;
    const fi = toMs(j.plannedFinishAt) ?? addWorkingMinutes(st, j.estimatedMinutes, s);
    out[j.id] = { start: new Date(st), finish: new Date(fi), locked: true };
    // Occupy the lane that frees up earliest.
    let lane = 0;
    for (let i = 1; i < lanes.length; i++) if (lanes[i] < lanes[lane]) lane = i;
    lanes[lane] = Math.max(lanes[lane], fi + s.bufferMinutes * 60_000);
  }

  const flexible = jobs
    .filter((j) => !out[j.id])
    .map((j, idx) => ({ j, idx }))
    .sort((a, b) => {
      const ua = a.j.isUrgent ? 0 : 1;
      const ub = b.j.isUrgent ? 0 : 1;
      if (ua !== ub) return ua - ub;
      if (a.j.priority !== b.j.priority) return a.j.priority - b.j.priority;
      return a.idx - b.idx;
    });

  for (const { j } of flexible) {
    let lane = 0;
    for (let i = 1; i < lanes.length; i++) if (lanes[i] < lanes[lane]) lane = i;
    const st = nextWorkingInstant(lanes[lane], s);
    const fi = addWorkingMinutes(st, j.estimatedMinutes, s);
    out[j.id] = { start: new Date(st), finish: new Date(fi), locked: false };
    lanes[lane] = fi + s.bufferMinutes * 60_000;
  }

  return out;
}

/** "5 ส.ค. 14:30" — Bangkok wall clock, Thai short month. */
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export function formatBkk(v: string | Date | null | undefined): string {
  const ms = toMs(v);
  if (ms === null) return "-";
  const d = new Date(ms + BKK_OFFSET_MS);
  return `${d.getUTCDate()} ${TH_MONTHS[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} น.`;
}
