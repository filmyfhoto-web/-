import { supabase } from '@/film-shop/lib/supabase';
import type { DraftFields, DocCommandType } from '@/film-shop/lib/docCommand';

const db = supabase as any;

/** ประเภทเอกสารคำสั่งเสียง -> ประเภทเอกสารของ Film Shop */
export function toFilmInvoiceType(docType: DocCommandType): string {
  switch (docType) {
    case 'receipt':
    case 'tax_receipt':
      return 'receipt';
    case 'quotation':
      return 'quotation';
    case 'job_order':
      return 'job_order';
    default:
      return 'invoice';
  }
}

export interface VoiceDocTotals { subtotal: number; total: number }

/**
 * บันทึกเอกสารที่ออกด้วยเสียง/คำสั่งข้อความ ลงในสมุดเอกสารของ Film Shop
 * (film_invoices) โดยใช้เลขเอกสารที่ระบบรันมาให้แล้ว — idempotent ด้วยเลขเอกสาร
 */
export async function saveVoiceDocumentToFilmShop(
  fields: DraftFields,
  totals: VoiceDocTotals,
  docNo: string,
  source: 'typed' | 'voice' | 'line' = 'voice',
): Promise<string | null> {
  const { data: existing } = await db
    .from('film_invoices')
    .select('id')
    .eq('invoice_number', docNo)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const items = fields.items.map((i, idx) => ({
    id: `${docNo}-${idx}`,
    name: i.description,
    width: 0,
    height: 0,
    pricePerSqm: 0,
    quantity: Number(i.quantity) || 0,
    unit: i.unit || 'ชิ้น',
    discount: Number(i.discount) || 0,
    pricePerPiece: Number(i.unitPrice) || 0,
    total: (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0) - (Number(i.discount) || 0),
  }));

  const paid = fields.paymentStatus === 'paid';
  const deposit = Number(fields.deposit) || 0;
  const payload = {
    invoice_number: docNo,
    type: toFilmInvoiceType(fields.docType),
    customer_name: fields.customerName || 'ลูกค้าทั่วไป',
    customer_phone: fields.customerPhone ?? null,
    customer_address: fields.customerAddress ?? null,
    customer_tax_id: fields.customerTaxId ?? null,
    items,
    subtotal: totals.subtotal,
    discount: Number(fields.discount) || 0,
    deposit,
    total: totals.total,
    amount_due: paid ? 0 : Math.max(0, totals.total - deposit),
    status: paid ? 'paid' : deposit > 0 ? 'deposit' : 'pending',
    job_status: 'pending',
    is_draft: false,
    notes: fields.notes ?? null,
    reference_doc: fields.project ?? null,
    payment_method: fields.paymentMethod ?? null,
    paid_at: paid ? new Date().toISOString() : null,
    document_date: new Date().toISOString(),
    due_date: fields.dueAtISO ?? null,
    created_via: source === 'voice' ? 'voice_command' : source === 'line' ? 'line_command' : 'text_command',
  };

  const { data, error } = await db.from('film_invoices').insert(payload).select('id').single();
  if (error) throw error;
  return data?.id ?? null;
}
