/**
 * ตัวช่วยหน้า "แจ้งเตือนออเดอร์สั่งสินค้าเข้า"
 * - ตัวกรอง (ช่วงวันที่ / สถานะ / หน่วยงาน) ที่จำค่าไว้ใน localStorage
 * - สถานะอ่านแล้ว/ยังไม่อ่าน ต่ออุปกรณ์ (ไม่แตะ schema)
 */
import type { CpoReviewStatus } from "@/lib/customerPoTotals";

export interface CpoFilterState {
  from: string; // yyyy-mm-dd
  to: string;   // yyyy-mm-dd
  statuses: CpoReviewStatus[];
  org: string;  // "" = ทุกหน่วยงาน
  unreadOnly: boolean;
}

export const emptyCpoFilters: CpoFilterState = {
  from: "", to: "", statuses: [], org: "", unreadOnly: false,
};

const FILTER_KEY = "cpo-inbox-filters:v1";
const READ_KEY = "cpo-inbox-read:v1";

export function loadCpoFilters(): CpoFilterState {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (!raw) return emptyCpoFilters;
    const p = JSON.parse(raw);
    return {
      from: typeof p?.from === "string" ? p.from : "",
      to: typeof p?.to === "string" ? p.to : "",
      statuses: Array.isArray(p?.statuses) ? p.statuses : [],
      org: typeof p?.org === "string" ? p.org : "",
      unreadOnly: Boolean(p?.unreadOnly),
    };
  } catch {
    return emptyCpoFilters;
  }
}

export function saveCpoFilters(f: CpoFilterState) {
  try { localStorage.setItem(FILTER_KEY, JSON.stringify(f)); } catch { /* ignore */ }
}

export function loadReadIds(): Record<string, true> {
  try {
    const raw = localStorage.getItem(READ_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

export function saveReadIds(map: Record<string, true>) {
  try {
    const keys = Object.keys(map);
    const trimmed = keys.length > 800
      ? Object.fromEntries(keys.slice(keys.length - 800).map((k) => [k, true as const]))
      : map;
    localStorage.setItem(READ_KEY, JSON.stringify(trimmed));
  } catch { /* ignore */ }
}

export interface CpoFilterRow {
  id: string;
  created_at: string;
  review_status: string;
  school_or_org?: string | null;
}

/** กรองรายการตามตัวกรองที่เลือกไว้ (pure — ใช้ทดสอบได้) */
export function filterCpoRows<T extends CpoFilterRow>(
  rows: T[],
  f: CpoFilterState,
  readIds: Record<string, true> = {},
): T[] {
  const fromTs = f.from ? new Date(`${f.from}T00:00:00`).getTime() : null;
  const toTs = f.to ? new Date(`${f.to}T23:59:59.999`).getTime() : null;
  return rows.filter((r) => {
    if (f.statuses.length && !f.statuses.includes(r.review_status as CpoReviewStatus)) return false;
    if (f.org && (r.school_or_org || "") !== f.org) return false;
    if (f.unreadOnly && readIds[r.id]) return false;
    if (fromTs || toTs) {
      const t = new Date(r.created_at).getTime();
      if (Number.isFinite(t)) {
        if (fromTs && t < fromTs) return false;
        if (toTs && t > toTs) return false;
      }
    }
    return true;
  });
}

/** รายชื่อหน่วยงานที่มีอยู่จริงในข้อมูล สำหรับ dropdown */
export function orgOptions(rows: { school_or_org?: string | null }[]): string[] {
  const set = new Set<string>();
  rows.forEach((r) => { const v = (r.school_or_org || "").trim(); if (v) set.add(v); });
  return [...set].sort((a, b) => a.localeCompare(b, "th"));
}

export function countUnread(rows: { id: string }[], readIds: Record<string, true>): number {
  return rows.reduce((n, r) => (readIds[r.id] ? n : n + 1), 0);
}