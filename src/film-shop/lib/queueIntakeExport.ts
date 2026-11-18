/**
 * ใบรับงาน (จากฟอร์ม “รับงานใหม่”) → ไฟล์ CSV ที่เปิดใน Excel / Google Sheets ได้
 * ใช้ข้อมูลจากร่างในฟอร์มโดยตรง ไม่แตะ logic การออกเอกสารจริงของระบบ
 */
import { downloadCsv } from '@/lib/csv';
import {
  QUEUE_PAY_LABEL,
  queueItemArea, queueItemDiscount, queueItemGross, queueItemSizeLabel,
  queueItemTotal, queueItemUnitPrice, queueTotals, round2,
  type QueueIntakeDraft, type QueueIntakeResult,
} from '@/film-shop/lib/queueIntake';

export interface QueueIntakeDocMeta {
  /** เลขที่งาน/ออเดอร์ (ถ้าสร้างแล้ว) */
  orderNo?: string | null;
  receiptNo?: string | null;
}

const dt = (iso: string) => (iso ? new Date(iso).toLocaleString('th-TH') : '-');

/** แถวข้อมูลของใบรับงาน (หัวเอกสาร + รายการ + สรุปยอด) */
export function buildQueueIntakeRows(draft: QueueIntakeDraft, meta: QueueIntakeDocMeta = {}) {
  const t = queueTotals(draft);
  const head = [
    ['เลขที่งาน', meta.orderNo ?? '(ยังไม่ยืนยัน)'],
    ['เลขที่ใบเสร็จ', meta.receiptNo ?? '-'],
    ['วันที่ออกเอกสาร', new Date().toLocaleString('th-TH')],
    ['ลูกค้า', [draft.customerName, draft.customerOrg].filter(Boolean).join(' · ') || '-'],
    ['เบอร์โทร', draft.customerPhone || '-'],
    ['กำหนดรับงาน', dt(draft.dueAt)],
    ['ผู้รับผิดชอบ', draft.assigneeName || 'ยังไม่ระบุ'],
    ['งานด่วน', draft.isUrgent ? 'ใช่' : 'ไม่'],
    ['การชำระเงิน', QUEUE_PAY_LABEL[draft.payMode]],
    ['หมายเหตุ', draft.jobDetail || '-'],
  ].map(([k, v]) => ({ หัวข้อ: k, ข้อมูล: v }));

  const items = draft.items
    .filter((i) => i.title.trim())
    .map((i, idx) => ({
      ลำดับ: idx + 1,
      รายการ: i.title.trim(),
      รายละเอียด: i.size || i.detail || '',
      ขนาด: queueItemSizeLabel(i) || '',
      'พื้นที่ (ตร.ม./ชิ้น)': queueItemArea(i) || '',
      'ราคา/ตร.ม.': round2(Number(i.pricePerSqm) || 0) || '',
      จำนวน: Number(i.quantity) || 0,
      หน่วย: i.unit,
      'ราคา/หน่วย': queueItemUnitPrice(i),
      'ราคาก่อนลด': queueItemGross(i),
      ส่วนลด: queueItemDiscount(i),
      รวมเงิน: queueItemTotal(i),
    }));

  const summary = [
    ['รวมก่อนส่วนลด', t.subtotal],
    ['ส่วนลดรวม', t.discount],
    ['ยอดสุทธิ', t.total],
    ['มัดจำ/ชำระแล้ว', t.paid],
    ['คงเหลือ', t.balance],
  ].map(([k, v]) => ({ สรุป: k, บาท: v }));

  return { head, items, summary };
}

/** รวมทุกส่วนเป็นตารางเดียว (CSV เปิดใน Google Sheets ได้ตรง ๆ) */
export function buildQueueIntakeCsvRows(draft: QueueIntakeDraft, meta: QueueIntakeDocMeta = {}) {
  const { head, items, summary } = buildQueueIntakeRows(draft, meta);
  const cols = ['ลำดับ', 'รายการ', 'รายละเอียด', 'ขนาด', 'พื้นที่ (ตร.ม./ชิ้น)', 'ราคา/ตร.ม.', 'จำนวน', 'หน่วย', 'ราคา/หน่วย', 'ราคาก่อนลด', 'ส่วนลด', 'รวมเงิน'];
  const blank = Object.fromEntries(cols.map((c) => [c, '']));
  const rows: Record<string, any>[] = [];
  rows.push({ ...blank, ลำดับ: 'ใบรับงาน' });
  for (const h of head) rows.push({ ...blank, ลำดับ: h.หัวข้อ, รายการ: h.ข้อมูล });
  rows.push({ ...blank });
  rows.push({ ...blank, ...Object.fromEntries(cols.map((c) => [c, c])) });
  for (const i of items) rows.push({ ...blank, ...i });
  rows.push({ ...blank });
  for (const s of summary) rows.push({ ...blank, ลำดับ: s.สรุป, รายการ: s.บาท });
  return { rows, cols };
}

export function queueIntakeFileName(draft: QueueIntakeDraft, meta: QueueIntakeDocMeta = {}) {
  const stamp = new Date().toISOString().slice(0, 10);
  const who = (draft.customerName || 'ลูกค้า').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 30);
  return `ใบรับงาน-${meta.orderNo || stamp}-${who}`;
}

/** ดาวน์โหลดใบรับงานเป็น CSV (UTF-8 BOM → เปิด Excel/Sheets ภาษาไทยไม่เพี้ยน) */
export function downloadQueueIntakeCsv(draft: QueueIntakeDraft, meta: QueueIntakeDocMeta = {}) {
  const { rows, cols } = buildQueueIntakeCsvRows(draft, meta);
  downloadCsv(queueIntakeFileName(draft, meta), rows, cols);
}
