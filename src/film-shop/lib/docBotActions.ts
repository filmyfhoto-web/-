/**
 * แยกแยะ “คำสั่งบอท” ของศูนย์เอกสาร Film Shop
 * - create        : ออกใบสั่งจ้าง / ออกใบเสร็จใบใหม่ (ต้องพรีวิวก่อนยืนยันเสมอ)
 * - approve       : อนุมัติใบสั่งจ้าง (ล่าสุด หรือระบุเลขที่)
 * - issue_receipt : งานเสร็จแล้ว → ออกใบเสร็จจากใบสั่งจ้างเดิม
 */
export type DocBotAction =
  | { kind: 'create' }
  | { kind: 'approve'; docNo?: string }
  | { kind: 'issue_receipt'; docNo?: string };

const DOC_NO_RE = /\b((?:JO|RC|QT|INV)[-\s]?[A-Z0-9]{2,}(?:-[A-Z0-9]+)*)\b/i;

/** ดึงเลขที่เอกสารจากคำสั่ง เช่น “อนุมัติใบสั่งจ้าง JO-26080001” */
export function extractDocNo(text: string): string | undefined {
  const m = String(text || '').match(DOC_NO_RE);
  return m ? m[1].replace(/\s+/g, '-').toUpperCase() : undefined;
}

export function parseDocBotAction(rawText: string): DocBotAction {
  const text = String(rawText || '').replace(/\s+/g, ' ').trim();
  if (!text) return { kind: 'create' };
  const docNo = extractDocNo(text);
  const isJobDocNo = !!docNo && /^JO/i.test(docNo);

  // งานเสร็จแล้ว ออกใบเสร็จ / ปิดงาน ออกใบเสร็จ / ออกใบเสร็จจาก JO-xxxx
  if (
    /(งานเสร็จ|เสร็จแล้ว|เสร็จงาน|ปิดงาน|ส่งงานแล้ว)/.test(text) ||
    (/(ออก|ทำ|สร้าง)?\s*ใบเสร็จ/.test(text) && isJobDocNo)
  ) {
    if (/ใบเสร็จ/.test(text)) return { kind: 'issue_receipt', docNo: isJobDocNo ? docNo : undefined };
  }

  // อนุมัติใบสั่งจ้างล่าสุด / อนุมัติ JO-xxxx
  if (/อนุมัติ/.test(text) && !/(ยกเลิก|ไม่อนุมัติ)/.test(text)) {
    return { kind: 'approve', docNo: isJobDocNo ? docNo : undefined };
  }

  return { kind: 'create' };
}
