/**
 * รับงานเข้า Q + ออกใบเสร็จในครั้งเดียว (unified queue intake)
 * ยืนยันครั้งเดียว → สร้างงานในคิว + ใบเสร็จเมื่อจ่ายครบ ผ่าน RPC เดียว
 * เพื่อไม่ให้เกิดข้อมูลค้างครึ่งทาง ไม่ตัดสต๊อก และไม่ส่งเอกสารให้ลูกค้าอัตโนมัติ
 */
import { supabase } from '@/film-shop/lib/supabase';

const db = supabase as any;

export type QueuePayMode = 'unpaid' | 'deposit' | 'paid';
export type QueuePayMethod = 'cash' | 'transfer' | 'other';

export const QUEUE_PAY_LABEL: Record<QueuePayMode, string> = {
  unpaid: 'ยังไม่รับเงิน',
  deposit: 'รับมัดจำ',
  paid: 'จ่ายครบแล้ว',
};

export const QUEUE_METHOD_LABEL: Record<QueuePayMethod, string> = {
  cash: 'เงินสด',
  transfer: 'โอน',
  other: 'อื่น ๆ',
};

export const QUEUE_UNITS = ['ชิ้น', 'ผืน', 'ใบ', 'ชุด', 'แผ่น', 'ตร.ม.', 'รูป', 'เล่ม'];

/** ปัดเศษเงินเป็นทศนิยม 2 ตำแหน่ง (กันเลขทศนิยมลอยผิดเพี้ยน) */
export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** รูปแบบตัวเลขที่ยอมรับ: ตัวเลขบวก ทศนิยมไม่เกิน 2 ตำแหน่ง */
const MONEY_RE = /^\d+(\.\d{0,2})?$/;
/** จำนวนชิ้น: จำนวนเต็มบวกเท่านั้น */
const QTY_RE = /^\d+$/;

export type NumParse = { value: number | null; error: string | null };

export function parseMoneyInput(raw: string): NumParse {
  const s = raw.trim().replace(/,/g, '');
  if (s === '') return { value: null, error: 'กรุณากรอกจำนวนเงิน' };
  if (!MONEY_RE.test(s)) return { value: null, error: 'กรอกเป็นตัวเลขบวก ทศนิยมไม่เกิน 2 ตำแหน่ง' };
  return { value: round2(Number(s)), error: null };
}

export function parseQtyInput(raw: string): NumParse {
  const s = raw.trim().replace(/,/g, '');
  if (s === '') return { value: null, error: 'กรุณากรอกจำนวน' };
  if (!QTY_RE.test(s)) return { value: null, error: 'จำนวนต้องเป็นจำนวนเต็ม' };
  const n = Number(s);
  if (n <= 0) return { value: null, error: 'จำนวนต้องมากกว่า 0' };
  return { value: n, error: null };
}

export interface QueueIntakeItem {
  key: string;
  title: string;
  detail: string;
  size: string;
  category: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discount: number;
  /** ขนาดงาน (กว้าง × ยาว) สำหรับงานคิดราคาเป็นตารางเมตร */
  width?: number;
  height?: number;
  /** หน่วยของขนาด — เมตร หรือ เซนติเมตร */
  sizeUnit?: 'm' | 'cm';
  /** ราคาต่อ ตร.ม. — ถ้ามีค่า > 0 จะคิดราคาต่อหน่วยจากพื้นที่ให้อัตโนมัติ */
  pricePerSqm?: number | null;
  /** ราคาที่แก้เอง — null/undefined = คิดอัตโนมัติจาก จำนวน × ราคาต่อหน่วย − ส่วนลด */
  manualTotal?: number | null;
}

export interface QueueIntakeDraft {
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerOrg: string;
  items: QueueIntakeItem[];
  dueAt: string;
  assigneeEmployeeId: string;
  assigneeName: string;
  jobDetail: string;
  attachmentUrl: string;
  /** ไฟล์แนบของงาน (อัปโหลด/ลบได้ในหน้ารับงานใหม่) */
  attachments: { name: string; url: string; path?: string }[];
  payMode: QueuePayMode;
  deposit: number;
  method: QueuePayMethod;
  received: number;
  isUrgent: boolean;
  /** โหมดเอกสารของคิว — คงไว้เพื่อรองรับ payload เดิม แต่ระบบใหม่ใช้คิว + ใบเสร็จเท่านั้น */
  docs?: 'queue_only';
  /** เตรียมออกใบเสร็จเมื่อปิดงาน (เก็บเป็น flag ไว้กับออเดอร์) */
  prepareReceipt?: boolean;
}

export const emptyQueueItem = (): QueueIntakeItem => ({
  key: `qi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  title: '', detail: '', size: '', category: 'other',
  quantity: 1, unit: 'ชิ้น', unitPrice: 0, discount: 0,
  width: 0, height: 0, sizeUnit: 'm', pricePerSqm: null,
});

export const emptyQueueDraft = (): QueueIntakeDraft => ({
  customerName: '', customerPhone: '', customerOrg: '',
  items: [emptyQueueItem()],
  dueAt: '', assigneeEmployeeId: '', assigneeName: '', jobDetail: '', attachmentUrl: '', attachments: [],
  payMode: 'unpaid', deposit: 0, method: 'cash', received: 0, isUrgent: false,
  docs: 'queue_only', prepareReceipt: false,
});

/** พื้นที่ต่อ 1 ชิ้น (ตร.ม.) จาก กว้าง × ยาว — 0 เมื่อยังกรอกไม่ครบ */
export function queueItemArea(i: QueueIntakeItem): number {
  const f = i.sizeUnit === 'cm' ? 0.01 : 1;
  const w = (Number(i.width) || 0) * f;
  const h = (Number(i.height) || 0) * f;
  return round2(Math.max(0, w * h));
}

/** ราคาต่อหน่วยที่ใช้จริง — คิดจาก พื้นที่ × ราคา/ตร.ม. เมื่อกรอกครบ */
export function queueItemUnitPrice(i: QueueIntakeItem): number {
  const perSqm = Number(i.pricePerSqm) || 0;
  const area = queueItemArea(i);
  if (perSqm > 0 && area > 0) return round2(perSqm * area);
  return round2(Number(i.unitPrice) || 0);
}

/** ป้ายขนาดที่อ่านง่าย เช่น "150×100 ซม. (1.5 ตร.ม.)" */
export function queueItemSizeLabel(i: QueueIntakeItem): string {
  const w = Number(i.width) || 0;
  const h = Number(i.height) || 0;
  if (w <= 0 || h <= 0) return '';
  const u = i.sizeUnit === 'cm' ? 'ซม.' : 'ม.';
  return `${w}×${h} ${u} (${queueItemArea(i)} ตร.ม.)`;
}

/** ราคาอัตโนมัติของบรรทัด (ยังไม่คิดราคาที่แก้เอง) */
export const queueItemAutoTotal = (i: QueueIntakeItem) =>
  round2(Math.max(0, (Number(i.quantity) || 0) * queueItemUnitPrice(i) - (Number(i.discount) || 0)));

export const queueItemTotal = (i: QueueIntakeItem) =>
  i.manualTotal === null || i.manualTotal === undefined
    ? queueItemAutoTotal(i)
    : round2(Math.max(0, Number(i.manualTotal) || 0));

/** ราคาก่อนหักส่วนลดของบรรทัด (จำนวน × ราคาต่อหน่วย) */
export const queueItemGross = (i: QueueIntakeItem) =>
  round2(Math.max(0, (Number(i.quantity) || 0) * queueItemUnitPrice(i)));

/** ส่วนลดที่มีผลจริงของบรรทัด (ถ้าแก้ยอดเอง = ผลต่างจากราคาก่อนลด) */
export const queueItemDiscount = (i: QueueIntakeItem) =>
  i.manualTotal === null || i.manualTotal === undefined
    ? round2(Math.min(Number(i.discount) || 0, queueItemGross(i)))
    : round2(Math.max(0, queueItemGross(i) - queueItemTotal(i)));

export function queueTotals(draft: QueueIntakeDraft) {
  const items = draft.items.filter((i) => i.title.trim() || queueItemTotal(i) > 0);
  const subtotal = round2(items.reduce((s, i) => s + queueItemGross(i), 0));
  const discount = round2(items.reduce((s, i) => s + queueItemDiscount(i), 0));
  const total = round2(items.reduce((s, i) => s + queueItemTotal(i), 0));
  const deposit = draft.payMode === 'deposit' ? round2(Math.min(Math.max(draft.deposit || 0, 0), total)) : 0;
  const paid = draft.payMode === 'paid' ? total : deposit;
  return {
    subtotal,
    discount,
    total,
    deposit,
    paid,
    balance: round2(Math.max(0, total - paid)),
    change: draft.payMode === 'paid' ? round2(Math.max(0, (draft.received || 0) - total)) : 0,
  };
}

export const queueBaht = (n: number) =>
  (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ข้อที่ยังกรอกไม่ครบของแต่ละส่วน (คีย์ = ลำดับส่วนในฟอร์ม) */
export function queueSectionErrors(draft: QueueIntakeDraft): Record<1 | 2 | 3 | 4, string[]> {
  const t = queueTotals(draft);
  const s1: string[] = [];
  const s2: string[] = [];
  const s3: string[] = [];
  const s4: string[] = [];
  if (!draft.customerName.trim()) s1.push('กรุณากรอกชื่อลูกค้า');
  const filled = draft.items.filter((i) => i.title.trim());
  if (filled.length === 0) s2.push('กรุณาเพิ่มรายการงานอย่างน้อย 1 รายการ');
  if (draft.items.some((i) => i.title.trim() && (Number(i.quantity) || 0) <= 0))
    s2.push('จำนวนต้องมากกว่า 0');
  if (draft.items.some((i) => i.title.trim() && !Number.isInteger(Number(i.quantity))))
    s2.push('จำนวนต้องเป็นจำนวนเต็ม');
  if (draft.items.some((i) => (Number(i.unitPrice) || 0) < 0 || (Number(i.discount) || 0) < 0))
    s2.push('ราคาและส่วนลดต้องไม่ติดลบ');
  if (draft.payMode === 'deposit' && !(draft.deposit > 0)) s4.push('กรุณากรอกจำนวนเงินมัดจำ');
  if (draft.payMode === 'deposit' && draft.deposit > t.total) s4.push('เงินมัดจำต้องไม่เกินยอดรวม');
  if (draft.payMode === 'paid' && t.total <= 0) s4.push('ยอดรวมต้องมากกว่า 0 จึงจะออกใบเสร็จได้');
  if (draft.payMode === 'paid' && (draft.received || 0) < t.total)
    s4.push('จำนวนเงินที่รับต้องไม่น้อยกว่ายอดรวม');
  return { 1: s1, 2: s2, 3: s3, 4: s4 };
}

export const queueDraftErrors = (draft: QueueIntakeDraft): string[] =>
  Object.values(queueSectionErrors(draft)).flat();

/** ---- บันทึกร่างในเครื่อง (ไม่ส่งขึ้นเซิร์ฟเวอร์) ---- */
export const QUEUE_DRAFT_KEY = 'film-shop:queue-intake-draft:v1';

export function saveQueueDraft(draft: QueueIntakeDraft): boolean {
  try {
    window.localStorage.setItem(QUEUE_DRAFT_KEY, JSON.stringify(draft));
    return true;
  } catch { return false; }
}

export function loadQueueDraft(): QueueIntakeDraft | null {
  try {
    const raw = window.localStorage.getItem(QUEUE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<QueueIntakeDraft>;
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return { ...emptyQueueDraft(), ...parsed } as QueueIntakeDraft;
  } catch { return null; }
}

export function clearQueueDraft() {
  try { window.localStorage.removeItem(QUEUE_DRAFT_KEY); } catch { /* ignore */ }
}

/** ร่างมีข้อมูลที่ควรกู้คืนไหม (ไม่ใช่ฟอร์มเปล่า) */
export const queueDraftHasContent = (d: QueueIntakeDraft) =>
  !!d.customerName.trim() || d.items.some((i) => i.title.trim() || (Number(i.unitPrice) || 0) > 0);

/** จำนวนส่วนที่กรอกครบ (ใช้กับแถบความคืบหน้า 4 ส่วน) */
export const queueSectionDone = (draft: QueueIntakeDraft): Record<1 | 2 | 3 | 4, boolean> => {
  const errs = queueSectionErrors(draft);
  return { 1: errs[1].length === 0, 2: errs[2].length === 0, 3: errs[3].length === 0, 4: errs[4].length === 0 };
};

export interface QueueIntakeResult {
  duplicate: boolean;
  order_id: string;
  order_no: string;
  receipt_id: string | null;
  receipt_no: string | null;
}

export function buildQueueIntakePayload(draft: QueueIntakeDraft, requestId: string) {
  const t = queueTotals(draft);
  return {
    request_id: requestId,
    customer: {
      id: draft.customerId || null,
      name: [draft.customerName.trim(), draft.customerOrg.trim()].filter(Boolean).join(' · '),
      phone: draft.customerPhone.trim() || null,
    },
    items: draft.items
      .filter((i) => i.title.trim())
      .map((i) => {
        const manual = i.manualTotal !== null && i.manualTotal !== undefined;
        const qty = Number(i.quantity) || 1;
        return {
        title: i.title.trim(),
        detail: i.detail.trim(),
        size: (i.size.trim() || queueItemSizeLabel(i)),
        category: i.category || 'other',
        quantity: qty,
        unit: i.unit || 'ชิ้น',
        // แก้ราคาเอง = ส่งราคาต่อหน่วยที่ทำให้ยอดรวมเท่ากับที่ผู้ใช้กรอก (ยอดรวมไม่เพี้ยน)
        unit_price: manual ? (Math.max(0, Number(i.manualTotal) || 0) / (qty || 1)) : queueItemUnitPrice(i),
        discount: manual ? 0 : (Number(i.discount) || 0),
        };
      }),
    due_at: draft.dueAt ? new Date(draft.dueAt).toISOString() : null,
    assignee_employee_id: draft.assigneeEmployeeId || null,
    assignee_name: draft.assigneeName || null,
    job_detail: draft.jobDetail.trim() || null,
    attachments: [
      ...(draft.attachments ?? []).map((a) => ({ name: a.name, url: a.url, path: a.path })),
      ...(draft.attachmentUrl.trim() ? [{ name: 'ไฟล์งาน', url: draft.attachmentUrl.trim() }] : []),
    ],
    is_urgent: draft.isUrgent,
    docs: 'queue_only',
    prepare_receipt: !!draft.prepareReceipt,
    payment: {
      mode: draft.payMode,
      deposit: t.deposit,
      method: draft.method,
    },
  };
}

/** ยืนยันรับงาน — atomic: Q + ใบเสร็จเมื่อจ่ายครบ */
export async function confirmQueueIntake(
  draft: QueueIntakeDraft,
  requestId: string,
): Promise<QueueIntakeResult> {
  const { data, error } = await db.rpc('film_queue_intake_confirm', {
    p_payload: buildQueueIntakePayload(draft, requestId),
  });
  if (error) throw new Error(error.message);
  return data as QueueIntakeResult;
}

export interface QueueReceiptResult {
  duplicate: boolean;
  receipt_id: string;
  receipt_no: string;
}

/** รับเงินภายหลัง → ออกใบเสร็จผูกกับงานเดิม (ห้ามออกซ้ำ) */
export async function issueQueueReceipt(
  orderId: string,
  input: { total: number; method: QueuePayMethod; note?: string },
): Promise<QueueReceiptResult> {
  const { data, error } = await db.rpc('film_queue_issue_receipt', {
    p_order_id: orderId,
    p_payload: { total: input.total, method: input.method, note: input.note ?? null },
  });
  if (error) throw new Error(error.message);
  return data as QueueReceiptResult;
}

export interface QueueOrderDocs {
  orderId: string;
  receiptId?: string;
  receiptNo?: string;
  /** ยอดเงินตามเอกสารใบเสร็จ */
  total: number;
}

/** ใบเสร็จของแต่ละออเดอร์ในคิว */
export async function loadQueueOrderDocs(orderIds: string[]): Promise<Record<string, QueueOrderDocs>> {
  const map: Record<string, QueueOrderDocs> = {};
  if (!orderIds.length) return map;
  const { data } = await db
    .from('film_invoices')
    .select('id, invoice_number, type, total, source_order_id')
    .in('source_order_id', orderIds);
  for (const row of data ?? []) {
    const id = row.source_order_id as string;
    map[id] ??= { orderId: id, total: 0 };
    if (row.type === 'receipt') {
      map[id].receiptId = row.id;
      map[id].receiptNo = row.invoice_number;
      if (!map[id].total) map[id].total = Number(row.total) || 0;
    }
  }
  return map;
}