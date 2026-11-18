/**
 * ศูนย์รับงานภายในร้าน / รันคิวงาน — ค่าคงที่และตรรกะล้วน (ไม่มีการเข้าถึงฐานข้อมูล)
 * ใช้ร่วมกันระหว่างหน้ารับงานใหม่ บอร์ดคิวงาน งานส่งร้านใหญ่ และเอกสารภายใน
 */

export const WORK_CATEGORIES = [
  { value: 'stationery', label: 'เครื่องเขียน', dept: 'front' },
  { value: 'vinyl', label: 'ไวนิล', dept: 'largeformat' },
  { value: 'photo', label: 'อัดรูป', dept: 'photo' },
  { value: 'copy', label: 'ถ่ายเอกสาร', dept: 'copy' },
  { value: 'print', label: 'งานพิมพ์', dept: 'print' },
  { value: 'sticker', label: 'งานสติ๊กเกอร์', dept: 'largeformat' },
  { value: 'signage', label: 'งานป้าย', dept: 'largeformat' },
  { value: 'cnc', label: 'งาน CNC', dept: 'cnc' },
  { value: 'design', label: 'งานออกแบบ', dept: 'design' },
] as const;

export type WorkCategory = (typeof WORK_CATEGORIES)[number]['value'];

export const WORK_DEPTS = [
  { value: 'front', label: 'หน้าร้าน' },
  { value: 'copy', label: 'ฝ่ายถ่ายเอกสาร' },
  { value: 'print', label: 'ฝ่ายงานพิมพ์' },
  { value: 'photo', label: 'ฝ่ายอัดรูป' },
  { value: 'largeformat', label: 'ฝ่ายงานใหญ่ (ไวนิล/สติ๊กเกอร์/ป้าย)' },
  { value: 'cnc', label: 'ฝ่าย CNC' },
  { value: 'design', label: 'ฝ่ายออกแบบ' },
] as const;

export type WorkDept = (typeof WORK_DEPTS)[number]['value'];

export function categoryLabel(value?: string | null): string {
  return WORK_CATEGORIES.find((c) => c.value === value)?.label ?? (value || '-');
}

export function deptLabel(value?: string | null): string {
  return WORK_DEPTS.find((d) => d.value === value)?.label ?? (value || '-');
}

/** ฝ่ายผลิตเริ่มต้นตามหมวดงาน */
export function defaultDept(category?: string | null): WorkDept {
  return (WORK_CATEGORIES.find((c) => c.value === category)?.dept as WorkDept) ?? 'front';
}

export const WORK_STATUSES = [
  'new',
  'order_review',
  'design_queue',
  'waiting_info',
  'waiting_approval',
  'waiting_outsource',
  'producing',
  'reviewing',
  'ready',
  'done',
  'cancelled',
] as const;

export type WorkStatus = (typeof WORK_STATUSES)[number];

export const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  new: 'งานเข้าใหม่',
  order_review: 'รอตรวจสอบออเดอร์',
  design_queue: 'รอคิวออกแบบ',
  waiting_info: 'รอข้อมูล/ไฟล์',
  waiting_approval: 'รออนุมัติ',
  waiting_outsource: 'รอส่งร้านใหญ่',
  producing: 'กำลังผลิต',
  reviewing: 'รอตรวจงาน',
  ready: 'พร้อมส่งมอบ',
  done: 'เสร็จสิ้น',
  cancelled: 'ยกเลิก',
};

export const WORK_STATUS_TONE: Record<WorkStatus, string> = {
  new: 'bg-sky-50 text-sky-700 border-sky-200',
  order_review: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  design_queue: 'bg-accent text-primary border-primary/20',
  waiting_info: 'bg-amber-50 text-amber-700 border-amber-200',
  waiting_approval: 'bg-accent text-primary border-primary/20',
  waiting_outsource: 'bg-orange-50 text-orange-700 border-orange-200',
  producing: 'bg-blue-50 text-blue-700 border-blue-200',
  reviewing: 'bg-accent text-primary border-primary/20',
  ready: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  done: 'bg-slate-100 text-slate-700 border-slate-200',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
};

export function isWorkStatus(v: unknown): v is WorkStatus {
  return typeof v === 'string' && (WORK_STATUSES as readonly string[]).includes(v);
}

/**
 * สถานะแบบกระชับที่ให้พนักงานเลือกได้จริงในหน้ารับงาน/รันคิว
 * (สถานะเก่าที่มีอยู่ในข้อมูลยังแสดงผลได้ตามปกติ แค่ไม่ให้เลือกใหม่)
 */
export const SIMPLE_WORK_STATUSES = ['new', 'producing', 'done', 'cancelled'] as const satisfies readonly WorkStatus[];

/** คอลัมน์บนบอร์ด (ไม่รวม "ยกเลิก" ซึ่งอยู่ในตัวกรอง) */
export const BOARD_STATUSES = WORK_STATUSES.filter((s) => s !== 'cancelled') as readonly WorkStatus[];

/** สถานะถัดไปตามลำดับการทำงาน (งานร้านใหญ่ข้ามไปรอส่งร้านใหญ่) */
export function nextWorkStatus(status: WorkStatus, isOutsourced = false, category?: string | null): WorkStatus | null {
  switch (status) {
    case 'new': return 'order_review';
    case 'order_review': return category === 'design' ? 'design_queue' : 'waiting_info';
    case 'design_queue': return 'waiting_info';
    case 'waiting_info': return 'waiting_approval';
    case 'waiting_approval': return isOutsourced ? 'waiting_outsource' : 'producing';
    case 'waiting_outsource': return 'producing';
    case 'producing': return 'reviewing';
    case 'reviewing': return 'ready';
    case 'ready': return 'done';
    default: return null;
  }
}

export interface StatusGateJob {
  title?: string | null;
  category?: string | null;
  dept?: string | null;
  quantity?: number | null;
  dueAt?: string | null;
  assignedEmployeeId?: string | null;
  isOutsourced?: boolean;
  outsourceId?: string | null;
  attachments?: unknown[];
}

/** ฟิลด์ที่ยังขาดก่อนเข้าสถานะถัดไป (ว่าง = ผ่าน) */
export function missingFieldsForStatus(job: StatusGateJob, next: WorkStatus): string[] {
  const miss: string[] = [];
  const need = (ok: unknown, label: string) => { if (!ok) miss.push(label); };
  if (next === 'waiting_approval' || next === 'producing' || next === 'waiting_outsource') {
    need(job.title?.trim(), 'ชื่องาน');
    need(job.category, 'หมวดงาน');
    need((job.quantity ?? 0) > 0, 'จำนวน');
  }
  if (next === 'producing' || next === 'waiting_outsource') {
    need(job.dueAt, 'วันเวลานัดส่ง');
  }
  if (next === 'producing' && !job.isOutsourced) {
    need(job.dept, 'ฝ่ายผลิต');
    need(job.assignedEmployeeId, 'ผู้รับผิดชอบ');
  }
  if (next === 'waiting_outsource') need(job.isOutsourced, 'ทำเครื่องหมายว่าเป็นงานส่งร้านใหญ่');
  if (next === 'ready') need(job.assignedEmployeeId, 'ผู้รับผิดชอบ');
  return miss;
}

/** ออเดอร์พร้อมส่งมอบได้เมื่องานย่อยที่ยังไม่ยกเลิกทุกชิ้นผ่านรอตรวจ/พร้อมส่ง/เสร็จแล้ว */
export function canDeliverOrder(jobs: { status: WorkStatus }[]): boolean {
  const active = jobs.filter((j) => j.status !== 'cancelled');
  if (active.length === 0) return false;
  return active.every((j) => j.status === 'reviewing' || j.status === 'ready' || j.status === 'done');
}

/** ข้อความอธิบายเมื่อยังส่งมอบไม่ได้ */
export function deliverBlockReason(jobs: { status: WorkStatus; title?: string | null }[]): string | null {
  if (canDeliverOrder(jobs)) return null;
  const pending = jobs.filter(
    (j) => j.status !== 'cancelled' && j.status !== 'reviewing' && j.status !== 'ready' && j.status !== 'done',
  );
  if (pending.length === 0) return 'ออเดอร์นี้ยังไม่มีงานย่อยที่ใช้งานได้';
  return `ยังมีงานย่อยที่ยังไม่ผ่านการตรวจ ${pending.length} รายการ: ${pending
    .map((j) => j.title || 'งาน').slice(0, 3).join(', ')}`;
}

/**
 * สถานะเริ่มต้นของงานย่อย
 * - งานส่งร้านใหญ่ → "รอส่งร้านใหญ่"
 * - งานที่เข้ามาจากเว็บแอป/LINE (NATTA.Q) → "รอตรวจสอบออเดอร์"
 * - งานออกแบบ → "รอคิวออกแบบ"
 */
export function initialJobStatus(
  isOutsourced: boolean,
  opts?: { channel?: string | null; category?: string | null },
): WorkStatus {
  if (isOutsourced) return 'waiting_outsource';
  const channel = (opts?.channel ?? '').toLowerCase();
  if (channel === 'web' || channel === 'webapp' || channel === 'web_app' || channel === 'line') return 'order_review';
  if (opts?.category === 'design') return 'design_queue';
  return 'new';
}

export const OUTSOURCE_STATUSES = [
  'pending',
  'sent',
  'accepted',
  'producing',
  'ready',
  'received',
  'problem',
] as const;

export type OutsourceStatus = (typeof OUTSOURCE_STATUSES)[number];

export const OUTSOURCE_STATUS_LABELS: Record<OutsourceStatus, string> = {
  pending: 'รอส่ง',
  sent: 'ส่งแล้ว',
  accepted: 'ร้านรับงาน',
  producing: 'กำลังผลิต',
  ready: 'พร้อมรับ',
  received: 'รับกลับแล้ว',
  problem: 'มีปัญหา',
};

export const OUTSOURCE_STATUS_TONE: Record<OutsourceStatus, string> = {
  pending: 'bg-slate-100 text-slate-700 border-slate-200',
  sent: 'bg-sky-50 text-sky-700 border-sky-200',
  accepted: 'bg-accent text-primary border-primary/20',
  producing: 'bg-blue-50 text-blue-700 border-blue-200',
  ready: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  received: 'bg-teal-50 text-teal-700 border-teal-200',
  problem: 'bg-rose-50 text-rose-700 border-rose-200',
};

/** สถานะงานย่อยที่ควรเปลี่ยนเป็นอะไร เมื่อใบสั่งผลิตร้านใหญ่เปลี่ยนสถานะ */
export function jobStatusForOutsource(status: OutsourceStatus): WorkStatus | null {
  switch (status) {
    case 'pending': return 'waiting_outsource';
    case 'sent':
    case 'accepted':
    case 'producing': return 'producing';
    case 'ready': return 'producing';
    case 'received': return 'reviewing';
    case 'problem': return 'waiting_info';
    default: return null;
  }
}

export interface WorkItemDraft {
  key: string;
  category: WorkCategory | '';
  title: string;
  description: string;
  size: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  costPrice: string;
  notes: string;
  fileUrl: string;
  dept: WorkDept | '';
  isOutsourced: boolean;
  assignedEmployeeId: string;
  dueAt: string;
}

export function emptyItem(key = String(Date.now())): WorkItemDraft {
  return {
    key,
    category: '',
    title: '',
    description: '',
    size: '',
    quantity: '1',
    unit: 'ชิ้น',
    unitPrice: '',
    costPrice: '',
    notes: '',
    fileUrl: '',
    dept: '',
    isOutsourced: false,
    assignedEmployeeId: '',
    dueAt: '',
  };
}

export function itemTotal(i: WorkItemDraft): number {
  return (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0);
}

export function itemCostTotal(i: WorkItemDraft): number {
  return (Number(i.quantity) || 0) * (Number(i.costPrice) || 0);
}

export interface WorkTotals {
  subtotal: number;
  cost: number;
  discount: number;
  deposit: number;
  total: number;
  balance: number;
}

export function computeTotals(items: WorkItemDraft[], discount: number, deposit: number): WorkTotals {
  const subtotal = items.reduce((s, i) => s + itemTotal(i), 0);
  const cost = items.reduce((s, i) => s + itemCostTotal(i), 0);
  const d = Math.max(0, Number(discount) || 0);
  const dep = Math.max(0, Number(deposit) || 0);
  const total = Math.max(0, subtotal - d);
  return { subtotal, cost, discount: d, deposit: dep, total, balance: Math.max(0, total - dep) };
}

/** ข้อความผิดพลาดภาษาไทย หรือ null เมื่อกรอกครบ */
export function validateIntake(customerName: string, items: WorkItemDraft[]): string | null {
  if (!customerName.trim()) return 'กรุณาเลือกหรือกรอกชื่อลูกค้า';
  const filled = items.filter((i) => i.category || i.title.trim());
  if (filled.length === 0) return 'กรุณาเพิ่มอย่างน้อย 1 รายการงาน';
  for (const i of filled) {
    if (!i.category) return 'กรุณาเลือกหมวดงานให้ครบทุกรายการ';
    if (!i.title.trim()) return 'กรุณากรอกชื่องานให้ครบทุกรายการ';
    if ((Number(i.quantity) || 0) <= 0) return 'จำนวนต้องมากกว่า 0';
  }
  return null;
}

export type DueTone = 'overdue' | 'soon' | 'normal' | 'none';

/** งานเลยกำหนด (overdue) / ใกล้กำหนดภายใน 24 ชม. (soon) */
export function dueTone(dueAt?: string | null, now: Date = new Date()): DueTone {
  if (!dueAt) return 'none';
  const t = new Date(dueAt).getTime();
  if (Number.isNaN(t)) return 'none';
  const diff = t - now.getTime();
  if (diff < 0) return 'overdue';
  if (diff <= 24 * 60 * 60 * 1000) return 'soon';
  return 'normal';
}

export function formatThb(n: number): string {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}

export function formatThaiDate(v?: string | null): string {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
}

export const INTERNAL_DOC_NOTICE = 'เอกสารภายในร้าน / ไม่ใช่เอกสารทางบัญชี';
export const ESTIMATE_NOTICE =
  'ใบสรุปรายการและประเมินราคา (ฉบับร่าง) — ไม่ใช่ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จรับเงิน หรือใบกำกับภาษี';