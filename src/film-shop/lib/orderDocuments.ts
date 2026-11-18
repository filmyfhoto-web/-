import { supabase } from '@/film-shop/lib/supabase';
import type { Invoice, VinylItem } from '@/film-shop/types';
import type { FilmOrder } from '@/film-shop/types/order';

const db = supabase as any;

export type OrderDocType = 'work_order' | 'job_order' | 'invoice';

export const ORDER_DOC_LABELS: Record<OrderDocType, string> = {
  work_order: 'ใบสั่งงาน (ภายในร้าน)',
  job_order: 'ใบสั่งจ้าง (ส่งงานนอก)',
  invoice: 'ใบแจ้งหนี้',
};

/** Order line items -> the VinylItem shape stored on film_invoices. */
export function orderItemsToInvoiceItems(order: FilmOrder): VinylItem[] {
  return order.items.map((i, idx) => ({
    id: `${order.id}-${idx}`,
    name: i.notes ? `${i.description} (${i.notes})` : i.description,
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

export function orderPaymentToInvoiceStatus(order: FilmOrder): Invoice['status'] {
  if (order.paymentStatus === 'paid') return 'paid';
  if (order.paymentStatus === 'deposit') return 'deposit';
  return 'pending';
}

/**
 * Build the invoice payload for a document generated from an order.
 * Numbers/tax/print behaviour stay with the existing invoice pipeline.
 */
export function buildDocumentFromOrder(
  order: FilmOrder,
  docType: OrderDocType,
  invoiceNumber: string,
): Omit<Invoice, 'id' | 'createdAt'> {
  const items = orderItemsToInvoiceItems(order);
  const status = orderPaymentToInvoiceStatus(order);
  const amountDue = status === 'paid' ? 0 : Math.max(0, order.total - (order.deposit || 0));
  return {
    invoiceNumber,
    type: docType === 'invoice' ? 'invoice' : 'job_order',
    customerId: order.customerId,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    items,
    subtotal: order.subtotal,
    deposit: order.deposit || 0,
    discount: order.discount || 0,
    total: order.total,
    amountDue,
    status,
    jobStatus: 'pending',
    referenceDoc: order.orderNo,
    notes: order.notes,
    headerText: docType === 'work_order' ? 'ใบสั่งงาน' : undefined,
    documentDate: new Date(),
    dueDate: order.dueAt,
  };
}

/** Link a generated document back to its source order + log the event. */
export async function linkDocumentToOrder(orderId: string, invoiceId: string, docType: OrderDocType) {
  await db.from('film_invoices').update({ source_order_id: orderId }).eq('id', invoiceId);
  await db.from('film_order_events').insert({
    order_id: orderId,
    to_status: 'document_created',
    note: `สร้าง${ORDER_DOC_LABELS[docType]}`,
  });
}