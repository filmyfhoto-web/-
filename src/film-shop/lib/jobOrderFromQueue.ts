import { supabase } from '@/film-shop/lib/supabase';

const db = supabase as any;

export interface JobOrderFromQueueResult {
  invoiceId: string;
  invoiceNumber: string;
  created: boolean;
}

/**
 * ออกใบสั่งจ้างจากออเดอร์ในคิว (Q รันงาน) แล้วบันทึกเข้าเอกสาร Film Shop
 * idempotent: ถ้าออเดอร์นี้มีใบสั่งจ้างแล้วจะคืนใบเดิม ไม่สร้างซ้ำ
 */
export async function issueJobOrderFromQueueOrder(orderId: string): Promise<JobOrderFromQueueResult | null> {
  if (!orderId) return null;
  try {
    const { data: order } = await db.from('film_orders')
      .select('id, order_no, customer_id, customer_name, customer_phone, subtotal, discount, deposit, total, notes, due_at')
      .eq('id', orderId).maybeSingle();
    if (!order) return null;

    const { data: existing } = await db.from('film_invoices')
      .select('id, invoice_number')
      .eq('type', 'job_order')
      .or(`source_order_id.eq.${orderId},reference_doc.eq.${order.order_no}`)
      .limit(1);
    if (existing?.length) {
      return { invoiceId: existing[0].id, invoiceNumber: existing[0].invoice_number, created: false };
    }

    const { data: rows } = await db.from('film_order_items')
      .select('description, title, quantity, unit, unit_price, total, sort_order')
      .eq('order_id', orderId).order('sort_order', { ascending: true });

    const items = (rows ?? []).map((r: any, i: number) => ({
      id: `${orderId}-${i}`,
      name: r.description || r.title || 'รายการงาน',
      width: 0,
      height: 0,
      pricePerSqm: 0,
      quantity: Number(r.quantity) || 1,
      unit: r.unit || 'ชิ้น',
      discount: 0,
      pricePerPiece: Number(r.unit_price) || 0,
      total: Number(r.total) || 0,
    }));

    const subtotal = Number(order.subtotal) || items.reduce((s: number, i: any) => s + i.total, 0);
    const discount = Number(order.discount) || 0;
    const deposit = Number(order.deposit) || 0;
    const total = Number(order.total) || subtotal - discount;

    let invoiceNumber = `JO-${Date.now().toString().slice(-8)}`;
    const { data: nextNo } = await db.rpc('film_next_job_order_number');
    if (typeof nextNo === 'string' && nextNo) invoiceNumber = nextNo;

    const { data: created, error } = await db.from('film_invoices').insert({
      invoice_number: invoiceNumber,
      type: 'job_order',
      customer_id: order.customer_id || null,
      customer_name: order.customer_name || 'ลูกค้าทั่วไป',
      customer_phone: order.customer_phone || null,
      items,
      subtotal,
      discount,
      deposit,
      total,
      amount_due: Math.max(0, total - deposit),
      status: deposit > 0 ? 'deposit' : 'pending',
      job_status: 'pending_approval',
      reference_doc: order.order_no,
      source_order_id: orderId,
      notes: order.notes || null,
      document_date: new Date().toISOString(),
      due_date: order.due_at || null,
    }).select('id, invoice_number').single();
    if (error || !created) throw error ?? new Error('บันทึกใบสั่งจ้างไม่สำเร็จ');

    return { invoiceId: created.id, invoiceNumber: created.invoice_number, created: true };
  } catch (e) {
    console.error('issueJobOrderFromQueueOrder', e);
    return null;
  }
}

export const JOB_ORDER_ISSUED_EVENT = 'film-shop:job-order-issued';

/** แจ้งหน้าคิวให้เปิดเอกสารที่เพิ่งออก (ดูตัวอย่าง/พิมพ์/PDF/แก้ไข ในหน้าเดียวกัน) */
export function emitJobOrderIssued(invoiceId: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(JOB_ORDER_ISSUED_EVENT, { detail: { invoiceId } }));
}
