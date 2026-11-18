import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  buildReceiptFromPayment,
  mapPayment,
  outstanding,
  sumPayments,
  validatePayment,
  type OrderPayment,
} from '@/film-shop/lib/filmPayments';
import { buildDocumentFromOrder } from '@/film-shop/lib/orderDocuments';
import { computeOrderTotals, type FilmOrder } from '@/film-shop/types/order';

const money = (n: number) => Math.round(n * 100) / 100;

function makeOrder(vatRate: 0 | 7): FilmOrder {
  const items = [{ description: 'ป้ายไวนิล 2x3 ม.', quantity: 2, unit: 'ผืน', unitPrice: 500 }];
  const totals = computeOrderTotals(items, 0, vatRate);
  return {
    id: 'order-1',
    orderNo: 'FO-2608-0001',
    title: 'ป้ายไวนิลงานกีฬาสี',
    hasDesign: true,
    jobs: [],
    customerName: 'คุณครูสมชาย',
    orgName: 'โรงเรียนบ้านนา',
    assignee: 'ช่างเอ',
    channel: 'walkin',
    status: 'waiting_info',
    paymentStatus: 'unpaid',
    items: items.map((i, idx) => ({ id: `i${idx}`, ...i, total: i.quantity * i.unitPrice })),
    subtotal: totals.subtotal,
    discount: 0,
    vatRate: totals.vatRate,
    vatAmount: totals.vatAmount,
    total: totals.total,
    deposit: 0,
    paidAmount: 0,
    attachments: [],
    isUrgent: false,
    isDraft: false,
    createdAt: new Date('2026-08-06'),
    updatedAt: new Date('2026-08-06'),
  } as FilmOrder;
}

const payment = (kind: OrderPayment['kind'], amount: number, id: string): OrderPayment =>
  mapPayment({
    id,
    order_id: 'order-1',
    kind,
    amount,
    method: 'cash',
    reference: null,
    paid_at: new Date('2026-08-06').toISOString(),
    received_by: 'แคชเชียร์',
    note: null,
    receipt_invoice_id: null,
    voided_at: null,
    created_at: new Date('2026-08-06').toISOString(),
  });

describe('film shop lifecycle: intake -> job order -> deposit -> top-up -> closed', () => {
  it.each([0, 7] as const)('settles to zero balance with VAT %i%%', (vat) => {
    const order = makeOrder(vat);
    const expectedTotal = vat === 0 ? 1000 : 1070;
    expect(order.total).toBe(expectedTotal);

    // 1. job order reuses intake data (no re-typing)
    const jobOrder = buildDocumentFromOrder(order, 'job_order', 'JO-26080001');
    expect(jobOrder.type).toBe('job_order');
    expect(jobOrder.referenceDoc).toBe(order.orderNo);
    expect(jobOrder.customerName).toBe(order.customerName);
    expect(jobOrder.items).toHaveLength(1);
    expect(jobOrder.total).toBe(expectedTotal);

    // 2. deposit
    const dep = payment('deposit', 400, 'p1');
    expect(validatePayment({ amount: dep.amount }, order, [])).toBeNull();
    const depReceipt = buildReceiptFromPayment(order, dep, 'RC-26080001', 0);
    expect(depReceipt.status).toBe('deposit');
    expect(money(depReceipt.amountDue)).toBe(money(expectedTotal - 400));
    expect(outstanding(order, [dep])).toBe(money(expectedTotal - 400));

    // 3. top-up clears the balance
    const rest = payment('payment', expectedTotal - 400, 'p2');
    expect(validatePayment({ amount: rest.amount }, order, [dep])).toBeNull();
    const finalReceipt = buildReceiptFromPayment(order, rest, 'RC-26080002', 400);
    expect(finalReceipt.status).toBe('paid');
    expect(finalReceipt.amountDue).toBe(0);
    expect(finalReceipt.notes).toContain('ชำระครบแล้ว');

    // 4. ledger agrees the job can close
    expect(sumPayments([dep, rest])).toBe(expectedTotal);
    expect(outstanding(order, [dep, rest])).toBe(0);
    expect(validatePayment({ amount: 1 }, order, [dep, rest])).toBeTruthy();
  });

  it('never reuses a receipt number across payments of the same order', () => {
    const order = makeOrder(0);
    const numbers = ['RC-26080001', 'RC-26080002', 'RC-26080003'];
    const receipts = numbers.map((n, i) =>
      buildReceiptFromPayment(order, payment('payment', 100, `p${i}`), n, i * 100),
    );
    expect(new Set(receipts.map((r) => r.invoiceNumber)).size).toBe(numbers.length);
  });
});

describe('mobile ergonomics', () => {
  const src = readFileSync('src/film-shop/components/orders/PaymentDialog.tsx', 'utf8');

  it('payment dialog body scrolls and keeps the action footer visible on small screens', () => {
    expect(src).toContain('max-h-[90dvh]');
    expect(src).toContain('overflow-y-auto');
    expect(src).toContain('safe-area-bottom');
  });

  it('uses tap-friendly 44px controls', () => {
    expect(src).toContain('min-h-11');
  });
});
