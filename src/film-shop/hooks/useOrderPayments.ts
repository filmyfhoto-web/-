import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Invoice } from '@/film-shop/types';
import type { FilmOrder } from '@/film-shop/types/order';
import { supabase } from '@/film-shop/lib/supabase';
import {
  attachReceipt,
  buildReceiptFromPayment,
  fetchOrderPayments,
  insertPayment,
  nextReceiptNumber,
  outstanding,
  sumPayments,
  validatePayment,
  voidPayment,
  type OrderPayment,
  type PaymentDraft,
} from '@/film-shop/lib/filmPayments';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type AddInvoice = (invoice: Omit<Invoice, 'id' | 'createdAt'>) => Promise<Invoice | null>;

export interface ReceivePaymentInput extends Omit<PaymentDraft, 'orderId'> {
  issueReceipt?: boolean;
}

/**
 * Payments for a single order. Recording money also links the receipt document
 * and (when fully paid) nudges the order towards closing.
 */
export function useOrderPayments(orderId?: string) {
  const [payments, setPayments] = useState<OrderPayment[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!orderId) { setPayments([]); return; }
    setLoading(true);
    setPayments(await fetchOrderPayments(orderId));
    setLoading(false);
  }, [orderId]);

  useEffect(() => { refresh(); }, [refresh]);

  const receivePayment = useCallback(
    async (order: FilmOrder, input: ReceivePaymentInput, addInvoice: AddInvoice) => {
      const err = validatePayment({ amount: input.amount }, order, payments);
      if (err) { toast.error(err); return null; }

      const paidBefore = sumPayments(payments);
      const payment = await insertPayment({ ...input, orderId: order.id });
      if (!payment) { toast.error('บันทึกการรับเงินไม่สำเร็จ'); return null; }

      let receipt: Invoice | null = null;
      if (input.issueReceipt !== false) {
        const number = await nextReceiptNumber();
        receipt = await addInvoice(buildReceiptFromPayment(order, payment, number, paidBefore));
        if (receipt?.id) {
          await attachReceipt(payment.id, receipt.id);
          await db.from('film_invoices').update({ source_order_id: order.id }).eq('id', receipt.id);
        }
      }

      await db.from('film_order_events').insert({
        order_id: order.id,
        to_status: 'payment_received',
        note: `รับเงิน ${input.amount.toLocaleString('th-TH')} บาท${receipt ? ` · ใบเสร็จ ${receipt.invoiceNumber}` : ''}`,
      });

      toast.success(receipt ? `รับเงินและออกใบเสร็จ ${receipt.invoiceNumber} แล้ว` : 'บันทึกการรับเงินแล้ว');
      await refresh();
      return { payment, receipt };
    },
    [payments, refresh],
  );

  const voidOne = useCallback(async (payment: OrderPayment) => {
    await voidPayment(payment.id, 'ยกเลิกรายการรับเงิน');
    await db.from('film_order_events').insert({
      order_id: payment.orderId,
      to_status: 'payment_voided',
      note: `ยกเลิกการรับเงิน ${payment.amount.toLocaleString('th-TH')} บาท`,
    });
    toast.success('ยกเลิกรายการรับเงินแล้ว');
    await refresh();
  }, [refresh]);

  return {
    payments,
    loading,
    refresh,
    receivePayment,
    voidPayment: voidOne,
    paidAmount: sumPayments(payments),
    balance: (order: FilmOrder) => outstanding(order, payments),
  };
}
