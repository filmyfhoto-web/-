/**
 * ตรรกะล้วนของหน้า DEMO "งานปัจจุบัน / NATTA.Q" (โหมดทดลองเท่านั้น)
 * ห้ามเรียก network / DB / LINE จริง — ใช้ state ในหน่วยความจำเท่านั้น
 */

export type DemoStatus = "new" | "accepted" | "producing" | "summarized" | "completed";

export const DEMO_STATUS_LABEL: Record<DemoStatus, string> = {
  new: "งานใหม่",
  accepted: "รับงานแล้ว",
  producing: "กำลังทำ",
  summarized: "สรุปงานแล้ว",
  completed: "เสร็จงาน / ออกเอกสาร",
};

export const DEMO_STATUS_FLOW: DemoStatus[] = ["new", "accepted", "producing", "summarized", "completed"];

export type DemoUnit = "cm" | "m";

export interface DemoLine {
  id: string;
  name: string;
  quantity: number;
  unit: DemoUnit;
  width: number;
  height: number;
  /** อัตราราคาต่อ ตร.ม. */
  rate: number;
  /** true = ผู้ใช้กด "แก้ราคาเอง" → ห้ามคำนวณทับ */
  manual: boolean;
  manualPrice: number;
}

/** แปลงเป็นเมตรก่อนคำนวณเสมอ */
export function toMeters(value: number, unit: DemoUnit): number {
  const v = Number(value) || 0;
  return unit === "cm" ? v / 100 : v;
}

/** พื้นที่ (ตร.ม.) = กว้าง × ยาว */
export function lineArea(line: Pick<DemoLine, "width" | "height" | "unit">): number {
  return toMeters(line.width, line.unit) * toMeters(line.height, line.unit);
}

/** ราคาอัตโนมัติ = พื้นที่ × อัตรา/ตร.ม. × จำนวน */
export function autoPrice(line: DemoLine): number {
  const qty = Number(line.quantity) || 0;
  return Math.max(0, lineArea(line) * (Number(line.rate) || 0) * qty);
}

/** ราคาสุดท้าย: ใช้ราคาที่แก้เองถ้าเปิด manual ไว้ */
export function finalPrice(line: DemoLine): number {
  return line.manual ? Math.max(0, Number(line.manualPrice) || 0) : autoPrice(line);
}

export function demoTotal(lines: DemoLine[]): number {
  return lines.reduce((sum, l) => sum + finalPrice(l), 0);
}

export function formatBaht(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export interface DemoJob {
  jobNo: string;
  customer: string;
  phone: string;
  dueDate: string;
  status: DemoStatus;
  assignee: string | null;
  lines: DemoLine[];
}

/** งานตัวอย่างสมจริง: ไวนิล 1.50 × 2.50 ม. อัตรา 120 บาท/ตร.ม. จำนวน 1 */
export function sampleDemoJob(): DemoJob {
  return {
    jobNo: "DEMO-0001",
    customer: "ร้านกาแฟบ้านสวน",
    phone: "081-234-5678",
    dueDate: "พรุ่งนี้ 16:00 น.",
    status: "new",
    assignee: null,
    lines: [
      { id: "l1", name: "ป้ายไวนิล เปิดร้านใหม่", quantity: 1, unit: "m", width: 1.5, height: 2.5, rate: 120, manual: false, manualPrice: 0 },
    ],
  };
}

export type DemoAction =
  | "queue_list"
  | "queue_take"
  | "queue_summary"
  | "refresh"
  | "doc_job_order"
  | "doc_receipt"
  | "new_draft"
  | "intake_form";

export interface DemoButton {
  label: string;
  action: DemoAction;
}

/** ปุ่มในการ์ดเดียว (postback model เดียวกับบอทจริง แต่ demo เป็น local state) */
export const DEMO_CARD_BUTTONS: DemoButton[] = [
  { label: "📋 เช็คคิว", action: "queue_list" },
  { label: "🔄 รับงาน", action: "queue_take" },
  { label: "✅ สรุปงาน", action: "queue_summary" },
  { label: "↩️ รีเฟรช", action: "refresh" },
  { label: "📄 ใบสั่งจ้าง", action: "doc_job_order" },
  { label: "🧾 ใบเสร็จรับเงิน", action: "doc_receipt" },
];

/** ข้อความที่เจ้าของร้านพิมพ์ใน LINE → action เดียวกับปุ่ม */
export function parseDemoCommand(text: string): DemoAction | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  if (/^(ตอนนี้ทำอะไร|ทำอะไรอยู่|งานปัจจุบัน)$/.test(t)) return "queue_list";
  if (/^(งานใหม่|เปิดงานใหม่)$/.test(t)) return "new_draft";
  if (/^(สั่งงาน|ฟอร์มสั่งงาน)$/.test(t)) return "intake_form";
  if (/^(เช็คคิว|ดูคิว)$/.test(t)) return "queue_list";
  if (/^(รับงาน|เริ่มงาน)$/.test(t)) return "queue_take";
  if (/^(สรุปงาน|ปิดจ๊อบ)$/.test(t)) return "queue_summary";
  if (/^(รีเฟรช|รีเฟรชคิว)$/.test(t)) return "refresh";
  if (/^(ใบสั่งจ้าง)$/.test(t)) return "doc_job_order";
  if (/^(ใบเสร็จ|ใบเสร็จรับเงิน)$/.test(t)) return "doc_receipt";
  return null;
}

export interface DemoResult {
  job: DemoJob;
  /** ข้อความตอบกลับที่บอทจะพิมพ์ (mock) */
  reply: string;
  /** เอกสารที่ควรเปิดพรีวิว */
  openDoc?: "job_order" | "receipt";
  /** เปิดฟอร์มสั่งงาน */
  openIntake?: boolean;
}

/** ตัวลดสถานะเดียวที่ทั้งการ์ด LINE (mock) และหน้าเว็บใช้ร่วมกัน */
export function applyDemoAction(job: DemoJob, action: DemoAction, actor = "แอดมินเดโม"): DemoResult {
  switch (action) {
    case "queue_take": {
      if (job.status === "new") {
        const next = { ...job, status: "producing" as DemoStatus, assignee: actor };
        return { job: next, reply: `🔄 รับงาน ${job.jobNo} แล้ว ผู้ทำ: ${actor} (สถานะ: กำลังทำ)` };
      }
      return { job, reply: `งาน ${job.jobNo} ถูกรับไปแล้ว (${DEMO_STATUS_LABEL[job.status]})` };
    }
    case "queue_summary": {
      if (job.status === "producing" || job.status === "accepted") {
        const next = { ...job, status: "summarized" as DemoStatus };
        return { job: next, reply: `✅ สรุปงาน ${job.jobNo} ยอดโดยประมาณ ${formatBaht(demoTotal(job.lines))} บาท — พร้อมออกเอกสาร` };
      }
      return { job, reply: `ยังสรุปงานไม่ได้ (สถานะ: ${DEMO_STATUS_LABEL[job.status]})` };
    }
    case "doc_job_order":
      return { job, reply: `📄 พรีวิวใบสั่งจ้าง ${job.jobNo} (โหมดทดลอง — ไม่ออกเลขเอกสารจริง)`, openDoc: "job_order" };
    case "doc_receipt": {
      const next = job.status === "summarized" ? { ...job, status: "completed" as DemoStatus } : job;
      return { job: next, reply: `🧾 พรีวิวใบเสร็จรับเงิน ${job.jobNo} (โหมดทดลอง — ไม่ออกเลขเอกสารจริง)`, openDoc: "receipt" };
    }
    case "new_draft":
      return { job: sampleDemoJob(), reply: "🆕 เปิดร่างงานใหม่ (โหมดทดลอง) — แก้ไขรายการได้ทันที" };
    case "intake_form":
      return { job, reply: `📝 เปิดฟอร์มสั่งงานของ ${job.jobNo}`, openIntake: true };
    case "refresh":
    case "queue_list":
    default:
      return {
        job,
        reply: `📋 งานปัจจุบัน ${job.jobNo} • ${job.customer} • ${DEMO_STATUS_LABEL[job.status]} • กำหนดรับ ${job.dueDate} • ยอดโดยประมาณ ${formatBaht(demoTotal(job.lines))} บาท`,
      };
  }
}