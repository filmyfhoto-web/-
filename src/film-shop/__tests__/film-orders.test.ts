import { describe, expect, it } from 'vitest';
import type { OrderStatus } from '@/film-shop/types/order';
import {
  ORDER_STATUSES,
  ORDER_FLOW_STATUSES,
  computeOrderTotals,
  initialOrderStatus,
  isOverdue,
  missingOrderInfo,
  nextOrderStatus,
  orderItemTotal,
} from '@/film-shop/types/order';
import { buildDocumentFromOrder, orderItemsToInvoiceItems } from '@/film-shop/lib/orderDocuments';
import type { FilmOrder } from '@/film-shop/types/order';

const baseItem = { description: 'ไวนิล 2x3', quantity: 2, unit: 'ผืน', unitPrice: 450 };

const order: FilmOrder = {
  id: 'o1',
  orderNo: 'OR-2601-0001',
  customerName: 'ร้านทดสอบ',
  channel: 'walkin',
  title: 'ป้ายงานบวช',
  isUrgent: false,
  hasDesign: true,
  status: 'waiting_print',
  paymentStatus: 'deposit',
  subtotal: 900,
  discount: 0,
  deposit: 300,
  vatRate: 0,
  vatAmount: 0,
  paidAmount: 300,
  total: 900,
  attachments: [],
  isDraft: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  items: [{ id: 'i1', orderId: 'o1', description: 'ไวนิล 2x3', quantity: 2, unit: 'ผืน', unitPrice: 450, total: 900, sortOrder: 0 }],
  jobs: [],
};

describe('film order status flow', () => {
  it('advances through every stage and stops at delivered', () => {
    let s: OrderStatus = ORDER_FLOW_STATUSES[0];
    const seen: OrderStatus[] = [s];
    let next = nextOrderStatus(s);
    while (next) { seen.push(next); s = next; next = nextOrderStatus(s); }
    expect(seen).toEqual([...ORDER_FLOW_STATUSES]);
    expect(nextOrderStatus('delivered')).toBeNull();
  });

  it('starts at waiting_info when intake data is incomplete', () => {
    expect(initialOrderStatus({ hasDesign: true, customerName: '', items: [] })).toBe('waiting_info');
  });

  it('skips design stage when the customer already has artwork', () => {
    const input = { hasDesign: true, customerName: 'A', items: [baseItem], dueAt: new Date() };
    expect(missingOrderInfo(input)).toEqual([]);
    expect(initialOrderStatus({ ...input })).toBe('waiting_print');
    expect(initialOrderStatus({ ...input, hasDesign: false })).toBe('waiting_design');
  });

  it('lists the missing intake fields', () => {
    expect(missingOrderInfo({ customerName: '', items: [] })).toEqual([
      'ชื่อลูกค้า', 'รายการงานอย่างน้อย 1 รายการ', 'วันและเวลารับงาน',
    ]);
  });

  it('computes totals with discount', () => {
    expect(orderItemTotal(baseItem)).toBe(900);
    expect(computeOrderTotals([baseItem], 100)).toEqual({ subtotal: 900, total: 800, vatRate: 0, vatAmount: 0 });
    expect(computeOrderTotals([baseItem], 5000).total).toBe(0);
  });

  it('flags overdue only for open orders', () => {
    const past = new Date(Date.now() - 3600_000);
    expect(isOverdue({ dueAt: past, status: 'producing' })).toBe(true);
    expect(isOverdue({ dueAt: past, status: 'delivered' })).toBe(false);
    expect(isOverdue({ dueAt: undefined, status: 'producing' })).toBe(false);
  });
});

describe('documents generated from an order', () => {
  it('reuses the same order data for every document type', () => {
    const items = orderItemsToInvoiceItems(order);
    expect(items).toHaveLength(1);
    expect(items[0].total).toBe(900);

    const workOrder = buildDocumentFromOrder(order, 'work_order', 'JO-2601');
    const jobOrder = buildDocumentFromOrder(order, 'job_order', 'JO-2602');
    const invoice = buildDocumentFromOrder(order, 'invoice', 'INV-2601');

    expect(workOrder.type).toBe('job_order');
    expect(workOrder.headerText).toBe('ใบสั่งงาน');
    expect(jobOrder.headerText).toBeUndefined();
    expect(invoice.type).toBe('invoice');
    for (const doc of [workOrder, jobOrder, invoice]) {
      expect(doc.customerName).toBe(order.customerName);
      expect(doc.total).toBe(order.total);
      expect(doc.referenceDoc).toBe(order.orderNo);
      expect(doc.items).toHaveLength(1);
    }
  });

  it('keeps the outstanding balance after a deposit', () => {
    const doc = buildDocumentFromOrder(order, 'invoice', 'INV-1');
    expect(doc.status).toBe('deposit');
    expect(doc.amountDue).toBe(600);
    const paid = buildDocumentFromOrder({ ...order, paymentStatus: 'paid' }, 'invoice', 'INV-2');
    expect(paid.status).toBe('paid');
    expect(paid.amountDue).toBe(0);
  });
});