/**
 * บันทึกกิจกรรมฝั่งหน้าจอ (เก็บในเครื่องนี้) — ครอบคลุม
 * การตั้งค่าเสียงแจ้งเตือน การจำลองออเดอร์ และการยิงแจ้งเตือน
 * ใช้สำหรับตรวจย้อนหลังและดาวน์โหลดเป็น CSV
 */
export type FsActivityCategory = 'sound_settings' | 'order_simulation' | 'notification' | 'deep_link';

export type FsActivityEntry = {
  id: string;
  at: string;
  category: FsActivityCategory;
  action: string;
  detail: Record<string, unknown>;
};

export const FS_ACTIVITY_STORAGE_KEY = 'fs.activityLog.v1';
export const FS_ACTIVITY_EVENT = 'fs-activity-log-changed';
export const FS_ACTIVITY_LIMIT = 500;

export const FS_ACTIVITY_CATEGORY_LABEL: Record<FsActivityCategory, string> = {
  sound_settings: 'ตั้งค่าเสียงแจ้งเตือน',
  order_simulation: 'จำลองออเดอร์',
  notification: 'ยิงแจ้งเตือน',
  deep_link: 'ลิงก์ปลายทาง (Deep link)',
};

function isEntry(v: unknown): v is FsActivityEntry {
  const o = v as Partial<FsActivityEntry>;
  return !!o && typeof o.id === 'string' && typeof o.at === 'string' && typeof o.action === 'string';
}

export function loadFsActivity(): FsActivityEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(FS_ACTIVITY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

export function logFsActivity(
  category: FsActivityCategory,
  action: string,
  detail: Record<string, unknown> = {},
): FsActivityEntry | null {
  const entry: FsActivityEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    category,
    action,
    detail,
  };
  if (typeof localStorage === 'undefined') return entry;
  try {
    const next = [entry, ...loadFsActivity()].slice(0, FS_ACTIVITY_LIMIT);
    localStorage.setItem(FS_ACTIVITY_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(FS_ACTIVITY_EVENT));
  } catch {
    /* โควตาเต็ม — ข้ามไป */
  }
  return entry;
}

export function clearFsActivity() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(FS_ACTIVITY_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(FS_ACTIVITY_EVENT));
  } catch {
    /* ข้ามไป */
  }
}

export const FS_ACTIVITY_CSV_COLUMNS = ['เวลา', 'หมวด', 'การกระทำ', 'รายละเอียด'];

/** แปลงรายการกิจกรรมเป็นแถวสำหรับ CSV (pure — ทดสอบได้) */
export function fsActivityToRows(entries: FsActivityEntry[]): Record<string, string>[] {
  return entries.map((e) => ({
    'เวลา': new Date(e.at).toLocaleString('th-TH'),
    'หมวด': FS_ACTIVITY_CATEGORY_LABEL[e.category] ?? e.category,
    'การกระทำ': e.action,
    'รายละเอียด': Object.entries(e.detail ?? {})
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join(' · '),
  }));
}
