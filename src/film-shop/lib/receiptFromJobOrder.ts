import type { Invoice } from '@/film-shop/types';

export interface ReceiptPrefill {
  type: 'receipt';
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerTaxId?: string;
  customerBranch?: string;
  notes?: string;
  referenceDoc?: string;
  deposit: number;
  discount: number;
}

/**
 * ออกใบเสร็จจากใบสั่งจ้าง — build the prefill payload for a brand new receipt
 * out of an existing job order. The result stays fully editable in the form;
 * `referenceDoc` keeps the link back to the source document.
 */
export function buildReceiptPrefill(source: Invoice): ReceiptPrefill {
  return {
    type: 'receipt',
    customerId: source.customerId,
    customerName: source.customerName,
    customerPhone: source.customerPhone,
    customerAddress: source.customerAddress,
    customerTaxId: source.customerTaxId,
    customerBranch: source.customerBranch,
    notes: source.notes,
    referenceDoc: source.invoiceNumber,
    deposit: source.deposit || 0,
    discount: source.discount || 0,
  };
}
