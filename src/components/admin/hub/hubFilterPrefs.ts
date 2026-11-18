/**
 * จำค่าฟิลเตอร์ของหน้า “งานที่ต้องทำวันนี้” ไว้ใน localStorage
 * เพื่อให้รีเฟรชหน้าแล้วกลับมาดูงานชุดเดิมได้ทันที (UI-only ไม่แตะ business logic)
 */
import { DATE_RANGES, READ_STATUSES, type DateRange, type ReadStatus } from "./notificationCatalog";

export const HUB_FILTER_KEY = "hub.noti.filters.v1";

export type HubFilterTab = "todo" | "order" | "requisition" | "line" | "done";

export interface HubFilterPrefs {
  filter: HubFilterTab;
  range: DateRange;
  status: ReadStatus;
  query: string;
  sortDesc: boolean;
}

export const DEFAULT_HUB_FILTERS: HubFilterPrefs = {
  filter: "todo",
  range: "all",
  status: "all",
  query: "",
  sortDesc: true,
};

const TABS: HubFilterTab[] = ["todo", "order", "requisition", "line", "done"];

/** ทำให้ค่าที่อ่านมาปลอดภัยเสมอ (ค่าเสียหาย/เวอร์ชันเก่า → ใช้ค่าเริ่มต้น) */
export function sanitizeHubFilters(raw: unknown): HubFilterPrefs {
  const r = (raw ?? {}) as Partial<HubFilterPrefs>;
  return {
    filter: TABS.includes(r.filter as HubFilterTab) ? (r.filter as HubFilterTab) : DEFAULT_HUB_FILTERS.filter,
    range: DATE_RANGES.some((x) => x.key === r.range) ? (r.range as DateRange) : DEFAULT_HUB_FILTERS.range,
    status: READ_STATUSES.some((x) => x.key === r.status) ? (r.status as ReadStatus) : DEFAULT_HUB_FILTERS.status,
    query: typeof r.query === "string" ? r.query.slice(0, 80) : "",
    sortDesc: typeof r.sortDesc === "boolean" ? r.sortDesc : true,
  };
}

export function loadHubFilters(): HubFilterPrefs {
  try {
    const raw = localStorage.getItem(HUB_FILTER_KEY);
    return sanitizeHubFilters(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_HUB_FILTERS;
  }
}

export function saveHubFilters(prefs: HubFilterPrefs): void {
  try {
    localStorage.setItem(HUB_FILTER_KEY, JSON.stringify(sanitizeHubFilters(prefs)));
  } catch {
    /* โหมดส่วนตัว/พื้นที่เต็ม — ไม่ต้องทำอะไร */
  }
}
