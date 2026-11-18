/**
 * Film Shop — order payment domain (pure helpers + Supabase access).
 * Payments live in `film_order_payments`; a DB trigger keeps
 * `film_orders.paid_amount / deposit / payment_status` in sync.
 */
import { supabase } from '@/film-shop/lib/supabase';
import { balanceDue, type FilmOrder } from '@/film-shop/types/order';
import type { Invoice, VinylItem } from '@/film-shop/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type PaymentKind = 'deposit' | 'payment';
export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'promptpay' | 'credit';

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  deposit: 'มัดจำ',
  payment: 'ชำระเพิ่ม',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'เงินสด',
  transfer: 'โอนเงิน',
  card: 'บัตร',
  promptpay: 'พร้อมเพย์',
  credit: 'เครดิต',
};

export interface OrderPayment {
  id: string;
  orderId: string;
  kind: PaymentKind;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  paidAt: Date;
  receivedBy?: string;
  receiptInvoiceId?: string;
  note?: string;
  voidedAt?: Date;
}

export interface PaymentDraft {
  orderId: string;
  kind: PaymentKind;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  paidAt?: Date;
  receivedBy?: string;
  note?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapPayment(row: any): OrderPayment {
  return {
    id: row.id,
    orderId: row.order_id,
    kind: (row.kind ?? 'payment') as PaymentKind,
    amount: Number(row.amount) || 0,
    method: (row.method ?? 'cash') as PaymentMethod,
    reference: row.reference ?? undefined,
    paidAt: new Date(row.paid_at ?? row.created_at),
    receivedBy: row.received_by ?? undefined,
    receiptInvoiceId: row.receipt_invoice_id ?? undefined,
    note: row.note ?? undefined,
    voidedAt: row.voided_at ? new Date(row.voided_at) : undefined,
  };
}

/** Only live (non-voided) rows count towards the order balance. */
export function activePayments(payments: OrderPayment[]): OrderPayment[] {
  return payments.filter((p) => !p.voidedAt);
}

export function sumPayments(payments: OrderPayment[]): number {
  return Math.round(activePayments(payments).reduce((s, p) => s + (Number(p.amount) || 0), 0) * 100) / 100;
}

export function sumDeposits(payments: OrderPayment[]): number {
  return Math.round(
    activePayments(payments)
      .filter((p) => p.kind === 'deposit')
      .reduce((s, p) => s + (Number(p.amount) || 0), 0) * 100,
  ) / 100;
}

export function outstanding(order: Pick<FilmOrder, 'total'>, payments: OrderPayment[]): number {
  return balanceDue(order.total, sumPayments(payments));
}

/** A payment that already produced a receipt must not produce a second one. */
export function alreadyReceipted(payment: OrderPayment): boolean {
  return !!payment.receiptInvoiceId && !payment.voidedAt;
}

/** Validation shared by the dialog and the tests. */
export function validatePayment(
  draft: Pick<PaymentDraft, 'amount'>,
  order: Pick<FilmOrder, 'total'>,
  payments: OrderPayment[],
): string | null {
  const amount = Number(draft.amount) || 0;
  if (amount <= 0) return 'ระบุจำนวนเงินที่รับมากกว่า 0';
  const due = outstanding(order, payments);
  if (due <= 0) return 'ออเดอร์นี้ชำระครบแล้ว';
  if (amount - due > 0.009) return `รับเกินยอดคงเหลือ (คงเหลือ ${due.toLocaleString('th-TH')} บาท)`;
  return null;
}

/** Receipt line items derived from the order — no re-typing at the counter. */
export function receiptItemsFromOrder(order: FilmOrder): VinylItem[] {
  return order.items.map((i, idx) => ({
    id: `${order.id}-rc-${idx}`,
    name: i.description,
    width: 0,
    height: 0,
    pricePerSqm: 0,
    quantity: i.quantity,
    unit: i.unit || 'ชิ้น',
    discount: 0,
    pricePerPiece: i.unitPrice,
    total: i.total,
  }));
}

/**
 * Build the receipt payload for one received payment.
 * `amountDue` is the balance AFTER this payment so the printed document is honest.
 */
export function buildReceiptFromPayment(
  order: FilmOrder,
  payment: Pick<OrderPayment, 'amount' | 'method' | 'reference' | 'paidAt' | 'receivedBy' | 'kind'>,
  receiptNumber: string,
  paidBefore = 0,
): Omit<Invoice, 'id' | 'createdAt'> {
  const paidAfter = Math.round((paidBefore + (Number(payment.amount) || 0)) * 100) / 100;
  const remaining = balanceDue(order.total, paidAfter);
  return {
    invoiceNumber: receiptNumber,
    type: 'receipt',
    customerId: order.customerId,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    items: receiptItemsFromOrder(order),
    subtotal: order.subtotal,
    deposit: paidAfter,
    discount: order.discount || 0,
    total: order.total,
    amountDue: remaining,
    status: remaining <= 0 ? 'paid' : 'deposit',
    jobStatus: 'pending',
    referenceDoc: order.orderNo,
    notes: [
      order.notes,
      `${PAYMENT_KIND_LABELS[payment.kind] ?? 'รับชำระ'} ${(Number(payment.amount) || 0).toLocaleString('th-TH')} บาท`,
      payment.reference ? `อ้างอิง: ${payment.reference}` : '',
      remaining <= 0 ? 'ชำระครบแล้ว' : `คงเหลือ ${remaining.toLocaleString('th-TH')} บาท`,
    ]
      .filter(Boolean)
      .join(' · '),
    salesPerson: payment.receivedBy,
    documentDate: payment.paidAt ?? new Date(),
    dueDate: order.dueAt,
    paidAt: payment.paidAt ?? new Date(),
    paymentMethod: (payment.method === 'transfer' || payment.method === 'credit' ? payment.method : 'cash') as
      | 'cash'
      | 'transfer'
      | 'credit',
  };
}

/** Server-minted receipt number (advisory-locked, never collides). */
export async function nextReceiptNumber(): Promise<string> {
  const { data, error } = await db.rpc('film_next_receipt_number');
  if (!error && typeof data === 'string' && data) return data;
  const d = new Date();
  const yymm = `${d.getFullYear().toString().slice(-2)}${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  return `RC-${yymm}${Date.now().toString().slice(-4)}`;
}

export async function fetchOrderPayments(orderId: string): Promise<OrderPayment[]> {
  const { data } = await db
    .from('film_order_payments')
    .select('*')
    .eq('order_id', orderId)
    .order('paid_at', { ascending: true });
  return (data ?? []).map(mapPayment);
}

export async function insertPayment(draft: PaymentDraft): Promise<OrderPayment | null> {
  const { data, error } = await db
    .from('film_order_payments')
    .insert({
      order_id: draft.orderId,
      kind: draft.kind,
      amount: Number(draft.amount) || 0,
      method: draft.method,
      reference: draft.reference || null,
      paid_at: (draft.paidAt ?? new Date()).toISOString(),
      received_by: draft.receivedBy || null,
      note: draft.note || null,
    })
    .select()
    .single();
  if (error || !data) {
    console.error('insert film_order_payments failed', error);
    return null;
  }
  return mapPayment(data);
}

export async function attachReceipt(paymentId: string, receiptInvoiceId: string) {
  await db.from('film_order_payments').update({ receipt_invoice_id: receiptInvoiceId }).eq('id', paymentId);
}

export async function voidPayment(paymentId: string, note?: string) {
  await db
    .from('film_order_payments')
    .update({ voided_at: new Date().toISOString(), note: note || null })
    .eq('id', paymentId);
}
