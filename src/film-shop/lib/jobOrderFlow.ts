import type { Invoice } from '@/film-shop/types';

/**
 * ขั้นตอนของใบสั่งจ้าง (Film Shop)
 * รออนุมัติ → อนุมัติแล้ว → กำลังดำเนินการ → งานเสร็จแล้ว → ออกใบเสร็จแล้ว
 * เก็บใน film_invoices.job_status (คอลัมน์ text เดิม ไม่แก้โครงสร้างข้อมูล)
 */
export type JobOrderStage =
  | 'pending_approval'
  | 'approved'
  | 'in_progress'
  | 'completed'
  | 'receipt_issued';

export const JOB_ORDER_STAGES: { key: JobOrderStage; label: string; className: string }[] = [
  { key: 'pending_approval', label: 'รออนุมัติ', className: 'bg-amber-50 text-amber-700 border-amber-300' },
  { key: 'approved', label: 'อนุมัติแล้ว', className: 'bg-sky-50 text-sky-700 border-sky-300' },
  { key: 'in_progress', label: 'กำลังดำเนินการ', className: 'bg-accent text-primary border-primary/30' },
  { key: 'completed', label: 'งานเสร็จแล้ว', className: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
  { key: 'receipt_issued', label: 'ออกใบเสร็จแล้ว', className: 'bg-slate-100 text-slate-700 border-slate-300' },
];

export const JOB_ORDER_STAGE_LABELS = Object.fromEntries(
  JOB_ORDER_STAGES.map((s) => [s.key, s.label]),
) as Record<JobOrderStage, string>;

const STAGE_ORDER = JOB_ORDER_STAGES.map((s) => s.key);

/** รองรับค่าเดิมในฐานข้อมูล (pending / approved / completed …) โดยไม่ทำลายข้อมูล */
export function normalizeJobOrderStage(raw: string | null | undefined): JobOrderStage {
  const v = String(raw ?? '').trim();
  if ((STAGE_ORDER as string[]).includes(v)) return v as JobOrderStage;
  switch (v) {
    case 'in-progress':
    case 'printing':
      return 'in_progress';
    case 'delivered':
    case 'completed':
      return 'completed';
    case 'receipt':
    case 'invoiced':
      return 'receipt_issued';
    default:
      return 'pending_approval';
  }
}

/** ขั้นถัดไปตาม flow — คืน null เมื่อจบขั้นสุดท้ายแล้ว */
export function nextJobOrderStage(stage: JobOrderStage): JobOrderStage | null {
  const i = STAGE_ORDER.indexOf(stage);
  return i < 0 || i >= STAGE_ORDER.length - 1 ? null : STAGE_ORDER[i + 1];
}

export const isJobOrder = (inv: Pick<Invoice, 'type'>) => inv.type === 'job_order';

/** ใบเสร็จที่เคยออกจากใบสั่งจ้างเลขนี้ (กันออกซ้ำ) */
export function findReceiptForJobOrder(
  invoices: Invoice[],
  jobOrderNumber: string,
): Invoice | undefined {
  const no = jobOrderNumber.trim().toLowerCase();
  if (!no) return undefined;
  return invoices.find(
    (i) => i.type === 'receipt' && String(i.referenceDoc ?? '').trim().toLowerCase() === no,
  );
}

/** ค้นหาใบสั่งจ้างจากเลขที่ (บางส่วนก็ได้) หรือใบล่าสุดเมื่อไม่ระบุเลข */
export function findJobOrder(invoices: Invoice[], docNo?: string): Invoice | undefined {
  const jobs = invoices
    .filter(isJobOrder)
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (!docNo?.trim()) return jobs[0];
  const q = docNo.trim().toLowerCase();
  return jobs.find((j) => j.invoiceNumber.toLowerCase() === q)
    ?? jobs.find((j) => j.invoiceNumber.toLowerCase().includes(q));
}

/** เลขเอกสารที่ไม่ซ้ำกับที่มีอยู่แล้ว (กันเลขชนกัน) */
export function uniqueDocNumber(base: string, taken: string[]): string {
  const used = new Set(taken.map((t) => t.trim().toLowerCase()));
  if (!used.has(base.trim().toLowerCase())) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export type NewReceipt = Omit<Invoice, 'id' | 'createdAt'>;

/**
 * สร้างใบเสร็จใหม่จากใบสั่งจ้าง — คัดลอกลูกค้า รายการ จำนวน ราคา ส่วนลด มัดจำ ยอดรวม
 * และอ้างอิงเลขที่ใบสั่งจ้างเดิม (ห้ามใช้เลขเอกสารซ้ำ)
 */
export function buildReceiptFromJobOrder(source: Invoice, receiptNumber: string): NewReceipt {
  const items = (source.items ?? []).map((it, idx) => ({ ...it, id: `${receiptNumber}-${idx + 1}` }));
  const subtotal = source.subtotal ?? items.reduce((s, i) => s + (Number(i.total) || 0), 0);
  const total = source.total ?? Math.max(0, subtotal - (source.discount || 0));
  return {
    invoiceNumber: receiptNumber,
    type: 'receipt',
    customerId: source.customerId,
    customerName: source.customerName,
    customerPhone: source.customerPhone,
    customerAddress: source.customerAddress,
    customerTaxId: source.customerTaxId,
    customerBranch: source.customerBranch,
    items,
    subtotal,
    discount: source.discount || 0,
    deposit: source.deposit || 0,
    total,
    amountDue: 0,
    status: 'paid',
    jobStatus: 'completed',
    paymentMethod: source.paymentMethod,
    paidAt: new Date(),
    documentDate: new Date(),
    referenceDoc: source.invoiceNumber,
    notes: source.notes,
    salesPerson: source.salesPerson,
    isDraft: false,
  } as NewReceipt;
}
