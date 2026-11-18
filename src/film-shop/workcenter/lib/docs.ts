import { printInternalDoc, type PrintDocInput, type PrintRow } from '@/film-shop/workcenter/lib/printInternalDoc';
import {
  ESTIMATE_NOTICE, INTERNAL_DOC_NOTICE, formatThaiDate, formatThb,
} from '@/film-shop/workcenter/lib/workcenter';
import type { OutsourceOrder, WorkJob } from '@/film-shop/workcenter/hooks/useWorkcenter';

export interface DocHeader {
  docNo?: string | null;
  customerName: string;
  customerPhone?: string | null;
  orderNo?: string | null;
  dueAt?: string | null;
  note?: string | null;
}

function jobRow(j: WorkJob, i: number, withPrice = false): PrintRow {
  return {
    no: i + 1,
    title: j.title,
    detail: j.notes || undefined,
    category: j.category,
    dept: j.dept,
    size: j.size,
    quantity: j.quantity,
    unit: j.unit,
    costPrice: withPrice ? j.costPrice : undefined,
    note: j.isOutsourced ? 'ส่งร้านใหญ่' : (j.assignedName || null),
  };
}

/** 1) ใบรับงานภายใน */
export function buildIntakeDoc(h: DocHeader, jobs: WorkJob[]): PrintDocInput {
  return {
    docTitle: 'ใบรับงานภายใน',
    docNo: h.docNo,
    notice: INTERNAL_DOC_NOTICE,
    meta: [
      { label: 'ลูกค้า', value: h.customerName },
      { label: 'เบอร์โทร', value: h.customerPhone || '-' },
      { label: 'เลขออเดอร์', value: h.orderNo || '-' },
      { label: 'กำหนดส่ง', value: formatThaiDate(h.dueAt) },
    ],
    columns: ['no', 'title', 'category', 'dept', 'size', 'qty', 'note'],
    rows: jobs.map((j, i) => jobRow(j, i)),
    footerNote: h.note || undefined,
    signatures: ['ผู้รับงาน', 'ลูกค้า'],
  };
}

/** 2) ใบสรุปรายการและประเมินราคา (ฉบับร่าง) */
export function buildEstimateDoc(
  h: DocHeader,
  rows: { title: string; detail?: string; category?: string | null; size?: string | null; quantity: number; unit?: string | null; unitPrice: number }[],
  totals: { subtotal: number; discount: number; deposit: number; total: number; balance: number },
): PrintDocInput {
  return {
    docTitle: 'ใบสรุปรายการและประเมินราคา (ฉบับร่าง)',
    docNo: h.docNo,
    notice: ESTIMATE_NOTICE,
    meta: [
      { label: 'ลูกค้า', value: h.customerName },
      { label: 'เบอร์โทร', value: h.customerPhone || '-' },
      { label: 'เลขออเดอร์', value: h.orderNo || '-' },
      { label: 'วันนัดรับ', value: formatThaiDate(h.dueAt) },
    ],
    columns: ['no', 'title', 'category', 'size', 'qty', 'unitPrice', 'amount'],
    rows: rows.map((r, i) => ({
      no: i + 1, title: r.title, detail: r.detail, category: r.category, size: r.size,
      quantity: r.quantity, unit: r.unit, unitPrice: r.unitPrice, amount: r.quantity * r.unitPrice,
    })),
    summary: [
      { label: 'รวมเป็นเงิน', value: formatThb(totals.subtotal) },
      { label: 'ส่วนลด', value: formatThb(totals.discount) },
      { label: 'ยอดสุทธิ (ประเมิน)', value: formatThb(totals.total) },
      { label: 'มัดจำ', value: formatThb(totals.deposit) },
      { label: 'คงเหลือ', value: formatThb(totals.balance) },
    ],
    footerNote: `${h.note ? `${h.note}\n` : ''}ราคานี้เป็นการประเมินเบื้องต้นสำหรับใช้ภายในร้าน อาจเปลี่ยนแปลงตามหน้างานจริง`,
    signatures: ['ผู้ประเมิน', 'ผู้ตรวจสอบ'],
  };
}

/** 3) ใบงานแต่ละฝ่าย (ไม่แสดงราคาขาย) */
export function buildDeptDoc(h: DocHeader, dept: string, jobs: WorkJob[]): PrintDocInput {
  return {
    docTitle: 'ใบงานฝ่ายผลิต',
    docNo: h.docNo,
    notice: INTERNAL_DOC_NOTICE,
    meta: [
      { label: 'ฝ่ายผลิต', value: dept },
      { label: 'ลูกค้า', value: h.customerName },
      { label: 'เลขออเดอร์', value: h.orderNo || '-' },
      { label: 'กำหนดส่ง', value: formatThaiDate(h.dueAt) },
    ],
    columns: ['no', 'title', 'category', 'size', 'qty', 'note'],
    rows: jobs.map((j, i) => jobRow(j, i)),
    signatures: ['ผู้ผลิต', 'ผู้ตรวจงาน'],
  };
}

/** 4) ใบสั่งผลิตร้านใหญ่ (แสดงราคาทุนเท่านั้น) */
export function buildOutsourceDoc(wo: OutsourceOrder): PrintDocInput {
  return {
    docTitle: 'ใบสั่งผลิต (ร้านใหญ่/ผู้รับผลิตภายนอก)',
    docNo: wo.woNo,
    notice: INTERNAL_DOC_NOTICE,
    meta: [
      { label: 'ร้านผู้ผลิต', value: wo.supplierName || '-' },
      { label: 'กำหนดรับ', value: formatThaiDate(wo.dueAt) },
      { label: 'สร้างเมื่อ', value: formatThaiDate(wo.createdAt) },
      { label: 'สถานะ', value: wo.status },
    ],
    columns: ['no', 'title', 'size', 'qty', 'cost', 'note'],
    rows: wo.items.map((it, i) => ({
      no: i + 1, title: it.title, size: it.size, quantity: it.quantity, unit: it.unit,
      costPrice: it.costPrice,
      detail: [it.material ? `วัสดุ: ${it.material}` : '', it.finishing ? `เก็บงาน: ${it.finishing}` : '']
        .filter(Boolean).join(' · ') || undefined,
      note: it.note,
    })),
    summary: [{ label: 'รวมราคาทุน', value: formatThb(wo.totalCost) }],
    footerNote: `${wo.note ? `${wo.note}\n` : ''}เอกสารนี้ไม่แสดงราคาขายลูกค้า`,
    signatures: ['ผู้สั่งผลิต', 'ผู้รับงาน (ร้านใหญ่)'],
  };
}

/** 5) ใบตรวจรับงาน */
export function buildInspectionDoc(h: DocHeader, jobs: WorkJob[]): PrintDocInput {
  return {
    docTitle: 'ใบตรวจรับงาน',
    docNo: h.docNo,
    notice: INTERNAL_DOC_NOTICE,
    meta: [
      { label: 'ลูกค้า', value: h.customerName },
      { label: 'เลขออเดอร์', value: h.orderNo || '-' },
      { label: 'วันที่ตรวจ', value: formatThaiDate(new Date().toISOString()) },
      { label: 'กำหนดส่ง', value: formatThaiDate(h.dueAt) },
    ],
    columns: ['no', 'title', 'dept', 'qty', 'note'],
    rows: jobs.map((j, i) => ({ ...jobRow(j, i), note: 'ผ่าน / ไม่ผ่าน' })),
    footerNote: 'ตรวจความถูกต้องของจำนวน ขนาด สี และการเก็บงานก่อนส่งมอบลูกค้า',
    signatures: ['ผู้ตรวจงาน', 'ผู้ส่งมอบ'],
  };
}

export { printInternalDoc };