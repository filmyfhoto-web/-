/**
 * Helpers for the staff work inbox (/staff/inbox).
 *
 * Pure functions so the queue ordering / counting logic stays unit-testable
 * without touching the database.
 */

export type InboxSource = "member" | "guest";

export interface InboxOrder {
  id: string;
  order_no: string | null;
  status: string;
  total: number | null;
  created_at: string;
  customer: string | null;
  source: InboxSource;
}

/** Work queue, in the order staff should handle it. */
export const ORDER_QUEUE: string[] = [
  "pending_quote",
  "quoted",
  "approved",
  "picking",
  "ready",
];

/** Next status when staff advances a queued order. */
export const NEXT_STATUS: Record<string, string | null> = {
  pending_quote: "quoted",
  quoted: "approved",
  approved: "picking",
  picking: "ready",
  ready: "completed",
};

export const NEXT_STATUS_LABEL: Record<string, string> = {
  pending_quote: "เสนอราคาแล้ว",
  quoted: "ลูกค้าอนุมัติ",
  approved: "เริ่มจัดสินค้า",
  picking: "พร้อมส่ง",
  ready: "ปิดงาน",
};

export function queueIndex(status: string): number {
  const i = ORDER_QUEUE.indexOf(status);
  return i === -1 ? ORDER_QUEUE.length : i;
}

/** Only orders that still need action show up in the inbox. */
export function isOpenOrder(status: string): boolean {
  return ORDER_QUEUE.includes(status);
}

/**
 * Sort by queue stage first (earliest stage = most urgent), then oldest first
 * so nothing gets stuck at the bottom of the list.
 */
export function sortInboxOrders<T extends { status: string; created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const d = queueIndex(a.status) - queueIndex(b.status);
    if (d !== 0) return d;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

export function countByStatus(rows: { status: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = (out[r.status] ?? 0) + 1;
  return out;
}

/** Age of a task in hours (rounded down), used for the "waiting" badge. */
export function ageHours(iso: string, now: Date = new Date()): number {
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / 3_600_000);
}

export function ageLabel(iso: string, now: Date = new Date()): string {
  const h = ageHours(iso, now);
  if (h < 1) return "ไม่ถึง 1 ชม.";
  if (h < 24) return `${h} ชม.`;
  return `${Math.floor(h / 24)} วัน`;
}

/** Purchase-order statuses that still need staff action. */
export const OPEN_PO_STATUS = ["pending_approval", "approved_waiting_receipt", "ordered", "draft"];

export const PO_TASK_LABEL: Record<string, string> = {
  draft: "รอสั่งซื้อ",
  ordered: "สั่งแล้ว รอรับของ",
  pending_approval: "รออนุมัติ",
  approved_waiting_receipt: "อนุมัติแล้ว รอรับของ",
};