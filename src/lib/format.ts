export const fmtTHB = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("th-TH", { style: "currency", currency: "THB", minimumFractionDigits: 2 });

export const fmtNum = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("th-TH");

export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
};

export const fmtDateTime = (d: string | Date | null | undefined) => {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
};

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending_quote: "รอเสนอราคา",
  quoted: "เสนอราคาแล้ว",
  approved: "ลูกค้าอนุมัติแล้ว",
  picking: "กำลังจัดสินค้า",
  ready: "พร้อมรับ/พร้อมส่ง",
  completed: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
};

export const ORDER_STATUS_COLOR: Record<string, string> = {
  pending_quote: "bg-warning/15 text-warning border-warning/30",
  quoted: "bg-info/15 text-info border-info/30",
  approved: "bg-primary/15 text-primary border-primary/30",
  picking: "bg-accent text-accent-foreground border-accent",
  ready: "bg-success/15 text-success border-success/30",
  completed: "bg-success/20 text-success border-success/40",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
};

export const PO_STATUS_LABEL: Record<string, string> = {
  draft: "รอสั่ง",
  ordered: "สั่งแล้ว",
  received: "รับเข้าแล้ว",
};

export const CUSTOMER_TYPE_LABEL: Record<string, string> = {
  school: "โรงเรียน",
  office: "สำนักงาน",
  general: "ทั่วไป",
};

export const ROLE_LABEL: Record<string, string> = {
  owner: "เจ้าของร้าน",
  admin: "แอดมิน",
  customer: "ลูกค้า",
};

export function genDocNo(prefix: string) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rnd = String(Math.floor(Math.random() * 9000) + 1000);
  return `${prefix}-${ymd}-${rnd}`;
}