import { PENDING_ORDER_STATUS } from "./useHubData";
import type { BadgeTone } from "./ui";

/**
 * สถานะคำสั่งซื้อ — ใช้ค่าที่มีอยู่ในฐานข้อมูลเดิม (customer_purchase_orders.status)
 * เพียงจัดกลุ่มและตั้งชื่อไทยให้พนักงานอ่านง่ายขึ้น (ไม่เปลี่ยน flow หลังบ้าน)
 */
export const ORDER_FLOW: { key: string; label: string }[] = [
  { key: "submitted", label: "ใหม่" },
  { key: "quoted", label: "รอเสนอราคา" },
  { key: "pending", label: "รอยืนยัน" },
  { key: "preparing", label: "กำลังเตรียม" },
  { key: "ready", label: "พร้อมรับ" },
  { key: "completed", label: "เสร็จแล้ว" },
];

/** ชื่อไทยของสถานะเดิมทุกค่าที่เคยมีในระบบ */
export const ORDER_STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง",
  submitted: "ใหม่",
  quoted: "รอเสนอราคา",
  review: "รอเสนอราคา",
  pending: "รอยืนยัน",
  preparing: "กำลังเตรียม",
  approved: "กำลังเตรียม",
  ready: "พร้อมรับ",
  delivered: "เสร็จแล้ว",
  completed: "เสร็จแล้ว",
  cancelled: "ยกเลิก",
};

export function orderStatusLabel(status: string | null | undefined): string {
  const s = String(status ?? "").toLowerCase();
  return ORDER_STATUS_LABEL[s] || status || "—";
}

export function orderStatusTone(status: string | null | undefined): BadgeTone {
  const s = String(status ?? "").toLowerCase();
  if (["ready", "approved", "delivered", "completed", "paid"].includes(s)) return "green";
  if (PENDING_ORDER_STATUS.includes(s) || ["quoted", "preparing"].includes(s)) return "amber";
  return "muted";
}

/** ตัวกรองหน้าออเดอร์: ทั้งหมด + สถานะตาม flow */
export function matchesOrderStatus(status: string | null | undefined, filter: string): boolean {
  if (filter === "all") return true;
  const s = String(status ?? "").toLowerCase();
  if (filter === "submitted") return ["submitted", "draft"].includes(s);
  if (filter === "quoted") return ["quoted", "review"].includes(s);
  if (filter === "preparing") return ["preparing", "approved"].includes(s);
  if (filter === "completed") return ["completed", "delivered"].includes(s);
  return s === filter;
}
