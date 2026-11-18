/**
 * สถานะ "อ่านแล้ว/ยังไม่อ่าน" + ตัวกรองของการ์ดบนแดชบอร์ดแอดมิน
 * เก็บต่ออุปกรณ์ใน localStorage (ไม่แตะ schema ฐานข้อมูล)
 */
export const CPO_READ_KEY = "cpo-inbox-read:v1";       // ใช้ร่วมกับหน้าแจ้งเตือนออเดอร์เข้า
const SEEN_KEY = "ng-dashboard-seen:v1";
const FILTER_KEY = "ng-dashboard-filters:v1";

export type ReadMap = Record<string, true>;

export function loadReadMap(key: string): ReadMap {
  try {
    const raw = localStorage.getItem(key);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

export function saveReadMap(key: string, map: ReadMap) {
  try {
    const keys = Object.keys(map);
    const trimmed = keys.length > 800
      ? Object.fromEntries(keys.slice(keys.length - 800).map((k) => [k, true as const]))
      : map;
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch { /* ignore */ }
}

/** สลับสถานะอ่าน/ยังไม่อ่านของรายการเดียว (pure) */
export function toggleRead(map: ReadMap, id: string): ReadMap {
  const next = { ...map };
  if (next[id]) delete next[id];
  else next[id] = true;
  return next;
}

/** ทำเครื่องหมายอ่านแล้วหลายรายการพร้อมกัน (pure) */
export function markRead(map: ReadMap, ids: string[]): ReadMap {
  const next = { ...map };
  ids.forEach((id) => { next[id] = true; });
  return next;
}

export function isToday(iso: string, now: Date = new Date()): boolean {
  const d = new Date(iso);
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  return d >= start;
}

export function countUnreadIds(rows: { id: string }[], map: ReadMap): number {
  return rows.reduce((n, r) => (map[r.id] ? n : n + 1), 0);
}

/* ---------------- ตัวกรองของแดชบอร์ด ---------------- */

export interface NgDashFilters {
  from: string;       // yyyy-mm-dd
  to: string;         // yyyy-mm-dd
  poStatus: string;   // "" = ทุกสถานะ
  org: string;        // "" = ทุกหน่วยงาน
}

export const emptyDashFilters: NgDashFilters = { from: "", to: "", poStatus: "", org: "" };

export function loadDashFilters(): NgDashFilters {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (!raw) return emptyDashFilters;
    const p = JSON.parse(raw) ?? {};
    const s = (v: unknown) => (typeof v === "string" ? v : "");
    return { from: s(p.from), to: s(p.to), poStatus: s(p.poStatus), org: s(p.org) };
  } catch {
    return emptyDashFilters;
  }
}

export function saveDashFilters(f: NgDashFilters) {
  try { localStorage.setItem(FILTER_KEY, JSON.stringify(f)); } catch { /* ignore */ }
}

export function hasActiveDashFilters(f: NgDashFilters): boolean {
  return Boolean(f.from || f.to || f.poStatus || f.org);
}

function inRange(iso: string, from: string, to: string): boolean {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return true;
  if (from && t < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && t > new Date(`${to}T23:59:59.999`).getTime()) return false;
  return true;
}

/** กรองใบสั่งซื้อของลูกค้าตามตัวกรองแดชบอร์ด (pure) */
export function filterPoRows<T extends { created_at: string; review_status: string; school_or_org?: string | null }>(
  rows: T[], f: NgDashFilters,
): T[] {
  return rows.filter((r) => {
    if (f.poStatus && r.review_status !== f.poStatus) return false;
    if (f.org && (r.school_or_org || "") !== f.org) return false;
    return inRange(r.created_at, f.from, f.to);
  });
}

/* ---------------- แจ้งเตือนรายการใหม่ ---------------- */

interface SeenState { po: string[] }

export function loadSeen(): SeenState {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const p = raw ? JSON.parse(raw) : null;
    return { po: Array.isArray(p?.po) ? p.po : [] };
  } catch {
    return { po: [] };
  }
}

export function saveSeen(next: SeenState) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ po: next.po.slice(0, 200) }));
  } catch { /* ignore */ }
}

/** id ที่เพิ่งเข้ามาใหม่เทียบกับรายการที่เคยเห็น (pure) */
export function newIds(current: { id: string }[], seen: string[]): string[] {
  if (!seen.length) return [];
  const known = new Set(seen);
  return current.filter((r) => !known.has(r.id)).map((r) => r.id);
}
