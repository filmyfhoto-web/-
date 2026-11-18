/**
 * ติดตามสถานะออเดอร์ที่ "เคยเห็นแล้ว" ต่ออุปกรณ์ เพื่อไฮไลต์เมื่อสถานะเปลี่ยน
 * เก็บใน localStorage: { [orderKey]: status }
 */
const KEY = "order-status-seen:v1";

type Map_ = Record<string, string>;

function readAll(): Map_ {
  try {
    const raw = localStorage.getItem(KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? (obj as Map_) : {};
  } catch {
    return {};
  }
}

function writeAll(m: Map_) {
  try {
    const keys = Object.keys(m);
    // กันไฟล์บวม: เก็บล่าสุดไม่เกิน 500 รายการ
    const trimmed: Map_ = keys.length > 500
      ? Object.fromEntries(keys.slice(keys.length - 500).map((k) => [k, m[k]]))
      : m;
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch { /* ignore */ }
}

export function getSeenStatus(key: string): string | null {
  return readAll()[key] ?? null;
}

/** สถานะเปลี่ยนไปจากที่เคยเห็นหรือไม่ (ครั้งแรกที่เห็น = ไม่ถือว่าเปลี่ยน) */
export function isStatusChanged(key: string, status: string): boolean {
  const seen = getSeenStatus(key);
  return seen != null && seen !== status;
}

export function markStatusSeen(key: string, status: string) {
  const all = readAll();
  if (all[key] === status) return;
  all[key] = status;
  writeAll(all);
}

export function markManySeen(entries: { key: string; status: string }[]) {
  const all = readAll();
  let dirty = false;
  for (const e of entries) {
    if (all[e.key] !== e.status) { all[e.key] = e.status; dirty = true; }
  }
  if (dirty) writeAll(all);
}
