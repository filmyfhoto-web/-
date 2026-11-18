/**
 * Groups cart lines by the shop/branch that will produce them, so the cart
 * reads like a marketplace order (นัฐภรณ์ เชียงกลาง / คัลเลอร์แล็ป / การพิมพ์).
 */
export interface GroupableItem {
  product_id: string;
  name: string;
  code?: string;
}

export const CART_GROUPS = {
  colorlab: "นัฐภรณ์คัลเลอร์แล็ป",
  printing: "นัฐภรณ์การพิมพ์",
  general: "นัฐภรณ์ เชียงกลาง",
} as const;

export type CartGroupKey = keyof typeof CART_GROUPS;

const COLORLAB = ["รูป", "ภาพ", "อัดรูป", "ถ่าย", "ฟิล์ม", "โฟโต้"];
const PRINTING = ["พิมพ์", "ไวนิล", "สติกเกอร์", "เข้าเล่ม", "ตรายาง", "ป้าย", "นามบัตร", "เอกสาร"];

export function groupKeyFor(item: GroupableItem): CartGroupKey {
  const s = `${item.name || ""} ${item.code || ""}`;
  if (PRINTING.some((k) => s.includes(k))) return "printing";
  if (COLORLAB.some((k) => s.includes(k))) return "colorlab";
  return "general";
}

export function groupItems<T extends GroupableItem>(items: T[]): { key: CartGroupKey; label: string; items: T[] }[] {
  const order: CartGroupKey[] = ["general", "colorlab", "printing"];
  return order
    .map((key) => ({ key, label: CART_GROUPS[key], items: items.filter((it) => groupKeyFor(it) === key) }))
    .filter((g) => g.items.length > 0);
}

/* ---------------- per-line job options ---------------- */

export interface JobOptions {
  size?: string;
  paper?: string;
  color?: string;
  sides?: "single" | "double";
  note?: string;
}

const OPTIONS_KEY = "cart_job_options_v1";

export function readJobOptions(): Record<string, JobOptions> {
  try {
    const raw = JSON.parse(localStorage.getItem(OPTIONS_KEY) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

export function writeJobOptions(map: Record<string, JobOptions>): void {
  try { localStorage.setItem(OPTIONS_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

export function describeOptions(o?: JobOptions): string {
  if (!o) return "";
  const parts = [
    o.size && `ขนาด ${o.size}`,
    o.paper && `กระดาษ/วัสดุ ${o.paper}`,
    o.color && `สี ${o.color}`,
    o.sides && (o.sides === "double" ? "พิมพ์สองด้าน" : "พิมพ์ด้านเดียว"),
    o.note,
  ].filter(Boolean);
  return parts.join(" · ");
}

/* ---------------- attachment validation ---------------- */

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export type AttachmentStatus = "none" | "ready" | "error";

export function validateAttachment(file: { name: string; size: number }): { status: AttachmentStatus; message: string } {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { status: "error", message: "ไฟล์ใหญ่เกิน 20 MB — กรุณาย่อไฟล์หรือส่งทาง LINE" };
  }
  if (file.size === 0) return { status: "error", message: "ไฟล์เสียหรือว่างเปล่า" };
  return { status: "ready", message: `แนบชื่อไฟล์แล้ว: ${file.name} — กรุณาส่งไฟล์จริงให้ร้านทาง LINE หลังยืนยันคำสั่งซื้อ` };
}
