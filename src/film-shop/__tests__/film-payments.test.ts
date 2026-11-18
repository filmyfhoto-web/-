import { describe, it, expect } from 'vitest';
import {
  activePayments,
  buildReceiptFromPayment,
  mapPayment,
  outstanding,
  sumDeposits,
  sumPayments,
  validatePayment,
  type OrderPayment,
} from '@/film-shop/lib/filmPayments';
import { computeOrderTotals, type FilmOrder } from '@/film-shop/types/order';

const pay = (over: Partial<OrderPayment> = {}): OrderPayment =>
  mapPayment({
    id: over.id ?? crypto.randomUUID(),
    order_id: 'order-1',
    kind: over.kind ?? 'payment',
    amount: over.amount ?? 100,
    method: over.method ?? 'cash',
    reference: over.reference ?? null,
    paid_at: (over.paidAt ?? new Date('2026-01-05')).toISOString(),
    received_by: over.receivedBy ?? null,
    note: null,
    receipt_invoice_id: over.receiptInvoiceId ?? null,
    voided_at: over.voidedAt ? over.voidedAt.toISOString() : null,
    void_reason: null,
    created_at: new Date('2026-01-05').toISOString(),
  });

const order = (over: Partial<FilmOrder> = {}): FilmOrder =>
  ({
    id: 'order-1',
    orderNo: 'FO-2601-0001',
    customerName: 'คุณครูสมชาย',
    channel: 'walkin',
    status: 'in_progress',
    paymentStatus: 'unpaid',
    items: [{ id: 'i1', description: 'ป้ายไวนิล', quantity: 2, unit: 'ผืน', unitPrice: 500, total: 1000 }],
    subtotal: 1000,
    discount: 0,
    vatRate: 0,
    vatAmount: 0,
    total: 1000,
    deposit: 0,
    paidAmount: 0,
    attachments: [],
    isUrgent: false,
    isDraft: false,
    createdAt: new Date('2026-01-05'),
    updatedAt: new Date('2026-01-05'),
    ...over,
  }) as FilmOrder;

describe('VAT totals', () => {
  it('computes 0% VAT', () => {
    const t = computeOrderTotals([{ description: 'a', quantity: 2, unit: 'ชิ้น', unitPrice: 500 }], 0, 0);
    expect(t).toMatchObject({ subtotal: 1000, vatRate: 0, vatAmount: 0, total: 1000 });
  });

  it('computes 7% VAT after discount', () => {
    const t = computeOrderTotals([{ description: 'a', quantity: 2, unit: 'ชิ้น', unitPrice: 500 }], 100, 7);
    expect(t.vatAmount).toBe(63);
    expect(t.total).toBe(963);
  });
});

describe('payment ledger', () => {
  it('ignores voided payments in totals', () => {
    const list = [pay({ amount: 300 }), pay({ amount: 200, voidedAt: new Date('2026-01-06') })];
    expect(activePayments(list)).toHaveLength(1);
    expect(sumPayments(list)).toBe(300);
  });

  it('tracks deposit then top-up down to zero balance', () => {
    const o = order();
    const deposit = pay({ kind: 'deposit', amount: 400 });
    expect(sumDeposits([deposit])).toBe(400);
    expect(outstanding(o, [deposit])).toBe(600);

    const rest = pay({ kind: 'payment', amount: 600 });
    expect(outstanding(o, [deposit, rest])).toBe(0);
  });

  it('rejects invalid or over-payment amounts', () => {
    const o = order();
    expect(validatePayment({ amount: 0 }, o, [])).toBeTruthy();
    expect(validatePayment({ amount: 1500 }, o, [])).toBeTruthy();
    expect(validatePayment({ amount: 1000 }, o, [])).toBeNull();
    expect(validatePayment({ amount: 900 }, o, [pay({ amount: 400 })])).toBeTruthy();
    expect(validatePayment({ amount: 600 }, o, [pay({ amount: 400 })])).toBeNull();
  });
});

describe('receipt payload', () => {
  it('carries order lines, receipt number, paid and balance', () => {
    const o = order();
    const deposit = pay({ kind: 'deposit', amount: 400, method: 'transfer', reference: 'TR-1' });
    const receipt = buildReceiptFromPayment(o, deposit, 'RC-26010001', 0);

    expect(receipt.invoiceNumber).toBe('RC-26010001');
    expect(receipt.type).toBe('receipt');
    expect(receipt.items).toHaveLength(1);
    expect(receipt.total).toBe(1000);
    expect(receipt.notes).toContain('400');
    expect(receipt.notes).toContain('600');
  });

  it('marks the closing receipt as fully paid', () => {
    const o = order();
    const final = pay({ kind: 'payment', amount: 600 });
    const receipt = buildReceiptFromPayment(o, final, 'RC-26010002', 400);
    expect(receipt.notes).toMatch(/ชำระครบ|คงเหลือ 0/);
  });
});
