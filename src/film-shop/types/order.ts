/**
 * Film Shop — order + job queue domain types.
 * Additive module: does not touch invoices/POS/customer/LINE types.
 */

export const ORDER_STATUSES = [
  'waiting_info',
  'waiting_design',
  'waiting_customer',
  'waiting_print',
  'producing',
  'finishing',
  'ready',
  'delivered',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** ลำดับการเดินงานปกติ (ไม่รวมงานที่ยกเลิก) */
export const ORDER_FLOW_STATUSES: OrderStatus[] = ORDER_STATUSES.filter((s) => s !== 'cancelled');

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  waiting_info: 'รอข้อมูล',
  waiting_design: 'รอออกแบบ',
  waiting_customer: 'รอลูกค้ายืนยัน',
  waiting_print: 'รอพิมพ์/ผลิต',
  producing: 'กำลังผลิต',
  finishing: 'รอตัด/เคลือบ/เก็บงาน',
  ready: 'พร้อมรับ',
  delivered: 'ส่งมอบแล้ว',
  cancelled: 'ยกเลิก',
};

/** Soft, low-glare status tints (design-system tokens only). */
export const ORDER_STATUS_TONE: Record<OrderStatus, string> = {
  waiting_info: 'bg-muted text-muted-foreground border-border',
  waiting_design: 'bg-accent/15 text-accent-foreground border-accent/30',
  waiting_customer: 'bg-warning/10 text-warning border-warning/30',
  waiting_print: 'bg-primary/10 text-primary border-primary/30',
  producing: 'bg-primary/15 text-primary border-primary/40',
  finishing: 'bg-accent/20 text-accent-foreground border-accent/40',
  ready: 'bg-success/15 text-success border-success/40',
  delivered: 'bg-muted text-muted-foreground border-border',
  cancelled: 'bg-destructive/10 text-destructive border-destructive/30',
};

export function nextOrderStatus(status: OrderStatus): OrderStatus | null {
  const i = ORDER_FLOW_STATUSES.indexOf(status);
  if (i < 0 || i >= ORDER_FLOW_STATUSES.length - 1) return null;
  return ORDER_FLOW_STATUSES[i + 1];
}

/**
 * 6 ช่องสถานะหลักของกระดานงาน (dashboard) — ย่อสถานะละเอียดให้อ่านง่าย
 * งานใหม่ / รอประเมิน / รอยืนยัน / กำลังผลิต / พร้อมรับ / ส่งแล้ว
 */
export const PIPELINE_BUCKETS = ['new', 'evaluating', 'confirming', 'producing', 'ready', 'delivered'] as const;
export type PipelineBucket = (typeof PIPELINE_BUCKETS)[number];

export const PIPELINE_BUCKET_LABELS: Record<PipelineBucket, string> = {
  new: 'งานใหม่',
  evaluating: 'รอประเมิน',
  confirming: 'รอยืนยัน',
  producing: 'กำลังผลิต',
  ready: 'พร้อมรับ',
  delivered: 'ส่งแล้ว',
};

const BUCKET_BY_STATUS: Record<OrderStatus, PipelineBucket> = {
  waiting_info: 'new',
  waiting_design: 'evaluating',
  waiting_customer: 'confirming',
  waiting_print: 'producing',
  producing: 'producing',
  finishing: 'producing',
  ready: 'ready',
  delivered: 'delivered',
  cancelled: 'delivered',
};

export function pipelineBucketOf(status: OrderStatus): PipelineBucket {
  return BUCKET_BY_STATUS[status];
}

/**
 * 5 ช่องงานที่พนักงานต้องลงมือทำ (หน้าแรก Film Shop) — ย่อจากสถานะละเอียด
 * ออเดอร์ใหม่ / กำลังทำ / รอลูกค้า-รอข้อมูล / พร้อมรับ-ส่ง / เสร็จแล้ว
 */
export const WORK_GROUPS = ['inbox', 'doing', 'waiting', 'ready', 'done', 'cancelled'] as const;
export type WorkGroup = (typeof WORK_GROUPS)[number];

export const WORK_GROUP_LABELS: Record<WorkGroup, string> = {
  inbox: 'ใหม่',
  doing: 'กำลังทำ',
  waiting: 'รอลูกค้า/ข้อมูล',
  ready: 'พร้อมรับ/ส่ง',
  done: 'เสร็จแล้ว',
  cancelled: 'ยกเลิก',
};

const WORK_GROUP_BY_STATUS: Record<OrderStatus, WorkGroup> = {
  waiting_info: 'waiting',
  waiting_customer: 'waiting',
  waiting_design: 'inbox',
  waiting_print: 'inbox',
  producing: 'doing',
  finishing: 'doing',
  ready: 'ready',
  delivered: 'done',
  cancelled: 'cancelled',
};

export function workGroupOf(status: OrderStatus): WorkGroup {
  return WORK_GROUP_BY_STATUS[status];
}

/** Open = still needs shop action. */
export const OPEN_ORDER_STATUSES = ORDER_STATUSES.filter((s) => s !== 'delivered' && s !== 'cancelled');

/** งานที่ยังต้องทำต่อ (ไม่ส่งมอบ ไม่ยกเลิก) */
export const isOpenOrderStatus = (s: OrderStatus) => s !== 'delivered' && s !== 'cancelled';

export type OrderChannel = 'line' | 'walkin' | 'phone' | 'facebook';

export const ORDER_CHANNEL_LABELS: Record<OrderChannel, string> = {
  line: 'LINE OA',
  walkin: 'หน้าร้าน',
  phone: 'โทรศัพท์',
  facebook: 'Facebook',
};

export type OrderPaymentStatus = 'unpaid' | 'deposit' | 'partial' | 'paid';

export const ORDER_PAYMENT_LABELS: Record<OrderPaymentStatus, string> = {
  unpaid: 'ยังไม่ชำระ',
  deposit: 'มัดจำแล้ว',
  partial: 'ชำระบางส่วน',
  paid: 'ชำระครบ',
};

export const ORDER_PAYMENT_TONE: Record<OrderPaymentStatus, string> = {
  unpaid: 'bg-muted text-muted-foreground border-border',
  deposit: 'bg-warning/10 text-warning border-warning/30',
  partial: 'bg-primary/10 text-primary border-primary/30',
  paid: 'bg-success/15 text-success border-success/40',
};

/** VAT options offered on intake — Thai shops use 0% or 7%. */
export const VAT_RATES = [0, 7] as const;
export type VatRate = (typeof VAT_RATES)[number];

export interface OrderAttachment {
  name: string;
  url: string;
  size?: number;
}

export interface FilmOrderItem {
  id: string;
  orderId: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  notes?: string;
  sortOrder: number;
}

export interface FilmOrderJob {
  id: string;
  orderId: string;
  orderItemId?: string;
  title: string;
  status: OrderStatus;
  sortOrder: number;
  doneAt?: Date;
}

export interface FilmOrderEvent {
  id: string;
  orderId: string;
  orderJobId?: string;
  fromStatus?: string;
  toStatus: string;
  note?: string;
  createdAt: Date;
}

export interface FilmOrder {
  id: string;
  orderNo: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  orgName?: string;
  assignee?: string;
  channel: OrderChannel;
  title: string;
  dueAt?: Date;
  isUrgent: boolean;
  hasDesign: boolean;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  subtotal: number;
  discount: number;
  deposit: number;
  vatRate: number;
  vatAmount: number;
  paidAmount: number;
  total: number;
  notes?: string;
  attachments: OrderAttachment[];
  isDraft: boolean;
  sourceJobRequestId?: string;
  createdAt: Date;
  updatedAt: Date;
  items: FilmOrderItem[];
  jobs: FilmOrderJob[];
}

export interface OrderDraftItemInput {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  notes?: string;
}

export interface OrderDraftInput {
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  orgName?: string;
  assignee?: string;
  channel: OrderChannel;
  title: string;
  dueAt?: Date | null;
  isUrgent: boolean;
  hasDesign: boolean;
  paymentStatus: OrderPaymentStatus;
  deposit: number;
  discount: number;
  vatRate?: number;
  notes?: string;
  attachments?: OrderAttachment[];
  isDraft?: boolean;
  items: OrderDraftItemInput[];
  sourceJobRequestId?: string;
}

/** Status an order enters right after intake. */
export function initialOrderStatus(input: { hasDesign: boolean; items: OrderDraftItemInput[]; customerName: string }): OrderStatus {
  const incomplete = missingOrderInfo(input);
  if (incomplete.length > 0) return 'waiting_info';
  return input.hasDesign ? 'waiting_print' : 'waiting_design';
}

/** Human-readable list of missing intake fields (order can still be saved as draft). */
export function missingOrderInfo(input: {
  customerName: string;
  items: OrderDraftItemInput[];
  dueAt?: Date | null;
  title?: string;
}): string[] {
  const missing: string[] = [];
  if (!input.customerName?.trim()) missing.push('ชื่อลูกค้า');
  const usable = (input.items || []).filter((i) => i.description?.trim());
  if (usable.length === 0) missing.push('รายการงานอย่างน้อย 1 รายการ');
  if (!input.dueAt) missing.push('วันและเวลารับงาน');
  return missing;
}

export function orderItemTotal(item: OrderDraftItemInput | FilmOrderItem): number {
  const qty = Number(item.quantity) || 0;
  const price = Number((item as OrderDraftItemInput).unitPrice ?? 0) || 0;
  return Math.round(qty * price * 100) / 100;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Subtotal → discount → VAT (0% or 7%) → net total.
 * VAT is charged on the discounted amount, which is how Thai shops invoice.
 */
export function computeOrderTotals(items: OrderDraftItemInput[], discount = 0, vatRate = 0) {
  const subtotal = round2(items.reduce((s, i) => s + orderItemTotal(i), 0));
  const net = Math.max(0, round2(subtotal - (Number(discount) || 0)));
  const rate = Number(vatRate) || 0;
  const vatAmount = round2((net * rate) / 100);
  const total = round2(net + vatAmount);
  return { subtotal, vatRate: rate, vatAmount, total };
}

/** Outstanding balance for an order given everything received so far. */
export function balanceDue(total: number, paidAmount: number): number {
  return Math.max(0, round2((Number(total) || 0) - (Number(paidAmount) || 0)));
}

/**
 * Mirror of the DB trigger so the UI can predict the next payment status.
 * `hasNonDepositPayment` distinguishes "มัดจำแล้ว" from "ชำระบางส่วน".
 */
export function paymentStatusFor(
  total: number,
  paidAmount: number,
  hasNonDepositPayment = false,
): OrderPaymentStatus {
  const paid = Number(paidAmount) || 0;
  const t = Number(total) || 0;
  if (paid <= 0) return 'unpaid';
  if (t > 0 && paid >= t) return 'paid';
  return hasNonDepositPayment ? 'partial' : 'deposit';
}

export function isOverdue(order: Pick<FilmOrder, 'dueAt' | 'status'>, now = new Date()): boolean {
  if (!order.dueAt || order.status === 'delivered') return false;
  return new Date(order.dueAt).getTime() < now.getTime();
}