/**
 * Shared helpers for the single admin notification centre.
 *
 * Rows live in the existing `public.notifications` table (columns:
 * user_id, type, title, body, ref_id, read, for_staff, link, created_at).
 * No new notification storage is introduced.
 */
export type AdminNotification = {
  id: string;
  type: string | null;
  title: string | null;
  body: string | null;
  ref_id: string | null;
  read: boolean | null;
  for_staff: boolean | null;
  link: string | null;
  created_at: string;
};

/** Notification types that belong to the internal admin centre. */
export const ADMIN_NOTIFICATION_TYPES = [
  "new_order",
  "new_customer_order",
  "new_requisition",
  "new_customer",
  "customer_message",
  "payment_action",
  "quotation_action",
  "low_stock",
  "po_approval",
  "po_receiving",
  "line_login_failure",
  "line_link_failure",
  "webhook_failure",
  "staff_line_approval",
] as const;

/** Technical alert types that are noisy and must be rate limited. */
const TECHNICAL_TYPES = new Set([
  "line_login_failure",
  "line_link_failure",
  "webhook_failure",
]);

export const TECHNICAL_RATE_LIMIT_MS = 10 * 60 * 1000; // 10 minutes

/** Grouping key: same type + same referenced record = same alert. */
export function dedupKey(n: Pick<AdminNotification, "type" | "ref_id" | "title">): string {
  return `${n.type ?? "unknown"}::${n.ref_id ?? n.title ?? ""}`;
}

/**
 * Collapse repeated alerts. Keeps the newest row of each key and, for
 * technical alert types, drops rows that arrived inside the rate-limit
 * window so a flapping webhook cannot flood the bell.
 */
export function dedupeNotifications(
  rows: AdminNotification[],
  now: number = Date.now(),
): (AdminNotification & { repeated: number })[] {
  const byKey = new Map<string, AdminNotification & { repeated: number }>();
  const sorted = [...rows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  for (const row of sorted) {
    const key = dedupKey(row);
    const seen = byKey.get(key);
    if (!seen) {
      byKey.set(key, { ...row, repeated: 1 });
      continue;
    }
    seen.repeated += 1;
    // Unread wins so an operator never loses an unhandled alert.
    if (!row.read) seen.read = false;
  }
  const out = [...byKey.values()];
  return out.filter((n) => {
    if (!TECHNICAL_TYPES.has(n.type ?? "")) return true;
    const age = now - new Date(n.created_at).getTime();
    return age >= 0 || Math.abs(age) < TECHNICAL_RATE_LIMIT_MS;
  });
}

export function unreadCount(rows: { read?: boolean | null }[]): number {
  return rows.reduce((n, r) => (r.read ? n : n + 1), 0);
}

/** Safe deep-link: only same-origin app paths are ever followed. */
export function safeLink(link: string | null | undefined, fallback = "/admin/home"): string {
  if (!link) return fallback;
  if (!link.startsWith("/") || link.startsWith("//")) return fallback;
  return link;
}

const TYPE_LABEL: Record<string, string> = {
  new_order: "คำสั่งซื้อใหม่",
  new_customer_order: "ออเดอร์ลูกค้าใหม่",
  new_requisition: "ใบเขียนเบิกใหม่",
  new_customer: "ลูกค้าใหม่",
  customer_message: "ข้อความจากลูกค้า",
  payment_action: "การชำระเงิน",
  quotation_action: "ใบเสนอราคา",
  low_stock: "สินค้าใกล้หมด",
  po_approval: "ใบสั่งซื้อรออนุมัติ",
  po_receiving: "ใบสั่งซื้อรอรับของ",
  line_login_failure: "เข้าสู่ระบบ LINE ล้มเหลว",
  line_link_failure: "เชื่อมบัญชี LINE ล้มเหลว",
  webhook_failure: "Webhook ขัดข้อง",
  staff_line_approval: "อนุมัติพนักงาน",
};

export function typeLabel(type: string | null | undefined): string {
  return TYPE_LABEL[type ?? ""] ?? "แจ้งเตือน";
}