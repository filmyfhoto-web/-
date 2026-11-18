/**
 * ตรรกะกลางสำหรับออกเอกสาร Film Shop — ใบเสร็จรับเงินเท่านั้น
 * ใช้ร่วมกันระหว่างหน้าสร้างใบเสร็จและตัวช่วยออกเอกสารเดิม
 * ไม่แตะสต๊อก ไม่ส่งเอกสารให้ลูกค้าอัตโนมัติ และออกเลขเอกสารเมื่อพนักงานกดยืนยันเท่านั้น
 * และ “ห้าม” สร้าง/ส่งงานเข้า Q รันงาน — Q เป็นโมดูลแยก ต้องเพิ่มงานจากหน้า Q เองเท่านั้น
 */
import { GROUPS, withGroupPrefix } from '@/film-shop/lib/groups';
import { uniqueDocNumber } from '@/film-shop/lib/jobOrderFlow';
import type { Invoice, InvoiceAttachment, VinylItem } from '@/film-shop/types';

export type FilmDocMode = 'receipt';
export type FilmPayMethod = 'cash' | 'transfer' | 'credit';

export interface FilmDraftItem {
  id: string;
  name: string;
  detail: string;
  quantity: number;
  unit: string;
  pricePerPiece: number;
  discount: number;
  /** งานป้าย: ขนาดกว้าง x ยาว (เมตร) และราคาต่อ ตร.ม. — ใช้คำนวณราคาต่อหน่วยอัตโนมัติ */
  width?: number;
  height?: number;
  pricePerSqm?: number;
}

/** ราคาต่อหน่วยจากขนาดป้าย (กว้าง x ยาว x ราคา/ตร.ม.) */
export const filmSqmPrice = (
  i: Pick<FilmDraftItem, 'width' | 'height' | 'pricePerSqm'>,
) => Math.max(0, (Number(i.width) || 0) * (Number(i.height) || 0) * (Number(i.pricePerSqm) || 0));


export interface FilmDraftState {
  mode: FilmDocMode;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerOrg: string;
  customerAddress: string;
  customerTaxId: string;
  items: FilmDraftItem[];
  dueDate: string;
  jobDetail: string;
  /** ขนาด/วัสดุ (ใบสั่งจ้าง) */
  jobSpec?: string;
  /** ผู้รับผิดชอบ (ใบสั่งจ้าง) */
  owner?: string;
  deposit: number;
  paymentMethod: FilmPayMethod;
  /** รับเงินมา (ใบเสร็จ) — ใช้คำนวณเงินทอน */
  received?: number;
  staffNote: string;
  attachments: InvoiceAttachment[];
}

export const FILM_UNITS = ['ชิ้น', 'ผืน', 'ใบ', 'ชุด', 'แผ่น', 'ตร.ม.', 'รูป', 'เล่ม'];

export const PAY_LABEL: Record<FilmPayMethod, string> = {
  cash: 'เงินสด',
  transfer: 'โอนจ่าย',
  credit: 'ลงบัญชี',
};

export const emptyFilmItem = (): FilmDraftItem => ({
  id: `it-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  name: '', detail: '', quantity: 1, unit: 'ชิ้น', pricePerPiece: 0, discount: 0,
});

export const emptyFilmDraft = (mode: FilmDocMode): FilmDraftState => ({
  mode,
  customerName: '', customerPhone: '', customerOrg: '', customerAddress: '', customerTaxId: '',
  items: [], dueDate: '', jobDetail: '', jobSpec: '', owner: '',
  deposit: 0, paymentMethod: 'cash', received: 0, staffNote: '', attachments: [],
});

export const filmItemTotal = (i: Pick<FilmDraftItem, 'quantity' | 'pricePerPiece' | 'discount'>) =>
  Math.max(0, i.quantity * i.pricePerPiece - (i.discount || 0));

export const filmDraftTotals = (items: FilmDraftItem[], deposit: number) => {
  const subtotal = items.reduce((s, i) => s + filmItemTotal(i), 0);
  const discount = items.reduce((s, i) => s + (i.discount || 0), 0);
  const total = subtotal;
  return { subtotal, discount, total, amountDue: Math.max(0, total - (deposit || 0)) };
};

export const filmBaht = (n: number) =>
  (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ข้อมูลจำเป็นครบหรือยัง — ใช้เปิด/ปิดปุ่ม “ยืนยันสร้างเอกสาร” */
export function filmDraftMissing(draft: FilmDraftState): string[] {
  const miss: string[] = [];
  if (!draft.customerName.trim()) miss.push('ชื่อลูกค้า');
  if (draft.items.length === 0) miss.push('รายการงาน/สินค้าอย่างน้อย 1 รายการ');
  if (draft.items.some((i) => i.quantity <= 0 || i.pricePerPiece < 0 || i.discount < 0))
    miss.push('จำนวนต้องมากกว่า 0 และราคา/ส่วนลดต้องไม่ติดลบ');
  if (draft.mode !== 'receipt' && (draft.deposit || 0) < 0) miss.push('มัดจำต้องไม่ติดลบ');
  return miss;
}

function toVinylItems(items: FilmDraftItem[], docNo: string): VinylItem[] {
  return items.map((it, idx) => ({
    id: `${docNo}-${idx + 1}`,
    name: it.name,
    width: Number(it.width) || 0,
    height: Number(it.height) || 0,
    pricePerSqm: Number(it.pricePerSqm) || 0,
    quantity: it.quantity,
    unit: it.unit,
    discount: it.discount || 0,
    pricePerPiece: it.pricePerPiece,
    total: filmItemTotal(it),
    category: it.detail || undefined,
  }));
}

export function buildFilmDocPayload(
  draft: FilmDraftState,
  type: 'receipt' | 'job_order',
  docNo: string,
  referenceDoc?: string,
) {
  const totals = filmDraftTotals(draft.items, draft.deposit);
  const notes = [draft.jobDetail, draft.jobSpec, draft.owner ? `ผู้รับผิดชอบ: ${draft.owner}` : '', draft.staffNote]
    .filter(Boolean)
    .join('\n');
  return {
    invoiceNumber: docNo,
    type,
    customerId: draft.customerId,
    customerName: draft.customerName.trim(),
    customerPhone: draft.customerPhone || undefined,
    customerAddress: [draft.customerOrg, draft.customerAddress].filter(Boolean).join(' · ') || undefined,
    customerTaxId: draft.customerTaxId || undefined,
    items: toVinylItems(draft.items, docNo),
    subtotal: totals.subtotal,
    discount: totals.discount,
    deposit: draft.deposit || 0,
    total: totals.total,
    amountDue: type === 'receipt' ? 0 : totals.amountDue,
    status: (type === 'receipt' ? 'paid' : draft.deposit > 0 ? 'deposit' : 'pending') as Invoice['status'],
    jobStatus: (type === 'receipt' ? 'completed' : 'pending') as Invoice['jobStatus'],
    paymentMethod: draft.paymentMethod,
    documentDate: new Date(),
    dueDate: draft.dueDate ? new Date(draft.dueDate) : undefined,
    paidAt: type === 'receipt' ? new Date() : undefined,
    notes: notes || undefined,
    referenceDoc,
    attachments: draft.attachments.length ? draft.attachments : undefined,
    isDraft: false,
  };
}

export interface FilmIssueDeps {
  invoices: Invoice[];
  addInvoice: (payload: ReturnType<typeof buildFilmDocPayload>) => Promise<Invoice | undefined>;
  updateInvoice: (id: string, patch: Partial<Invoice>) => Promise<unknown>;
  generateInvoiceNumber: (type: 'receipt' | 'job_order') => string;
  refetch?: () => Promise<unknown> | void;
}

export function nextFilmDocNumber(deps: FilmIssueDeps, type: 'receipt' | 'job_order') {
  const base = withGroupPrefix(GROUPS.filmshop.docPrefix, deps.generateInvoiceNumber(type));
  return uniqueDocNumber(base, (deps.invoices ?? []).map((i) => i.invoiceNumber));
}

export interface FilmIssueResult {
  invoiceId?: string;
  message: string;
}

/**
 * ออกเอกสารจริง (หลังพนักงานกดยืนยันเท่านั้น)
 * - source = เอกสารต้นทาง → ออกใบเสร็จต่อจากเอกสารนั้น
 * - ไม่มี side effect กับ Q รันงานและสต๊อก
 */
export async function issueFilmDocument(
  deps: FilmIssueDeps,
  draft: FilmDraftState,
  source?: Invoice,
): Promise<FilmIssueResult> {
  if (source) {
    const rcNo = nextFilmDocNumber(deps, 'receipt');
    const created = await deps.addInvoice(buildFilmDocPayload(draft, 'receipt', rcNo, source.invoiceNumber));
    await deps.updateInvoice(source.id, { jobStatus: 'receipt_issued' as Invoice['jobStatus'] });
    await deps.refetch?.();
    return { invoiceId: created?.id, message: `ออกใบเสร็จ ${created?.invoiceNumber ?? rcNo} จากใบสั่งจ้าง ${source.invoiceNumber} แล้ว` };
  }

  const docNo = nextFilmDocNumber(deps, 'receipt');
  const created = await deps.addInvoice(buildFilmDocPayload(draft, 'receipt', docNo));
  await deps.refetch?.();
  return { invoiceId: created?.id, message: `ออกใบเสร็จ ${created?.invoiceNumber ?? docNo} แล้ว` };
}