import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/film-shop/lib/supabase';
import {
  canFinalize,
  computeDraftTotals,
  missingFields,
  parseDocCommand,
  type DraftFields,
} from '@/film-shop/lib/docCommand';

const db = supabase as any;

const FINALIZE_ERRORS: Record<string, string> = {
  forbidden: 'ไม่มีสิทธิ์ออกเอกสาร',
  draft_not_found: 'ไม่พบฉบับร่าง',
  draft_cancelled: 'ฉบับร่างนี้ถูกยกเลิกแล้ว',
  missing_customer: 'ยังไม่ได้ระบุลูกค้า',
  missing_shop: 'ยังไม่ได้เลือกร้าน',
  missing_items: 'ยังไม่มีรายการ',
  missing_price: 'ยังไม่ได้ใส่จำนวนหรือราคาต่อหน่วย',
  receipt_unpaid: 'ออกใบเสร็จได้เมื่อสถานะเป็น “ชำระแล้ว” เท่านั้น',
};

export const EMPTY_FIELDS: DraftFields = {
  docType: 'receipt',
  shopKey: null,
  items: [],
  discount: 0,
  vatMode: 'none',
  vatRate: 7,
  whtRate: 0,
  deposit: 0,
  paymentStatus: 'unpaid',
  missing: [],
};

/**
 * Draft state for the voice/text document command workspace.
 * Totals are always recomputed in code; the draft is only ever saved as
 * DRAFT until document_command_finalize() allocates the real number.
 */
export function useDocCommandDraft() {
  const [fields, setFieldsState] = useState<DraftFields>({ ...EMPTY_FIELDS });
  const [draftId, setDraftId] = useState<string | null>(null);
  const [docNo, setDocNo] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [source, setSource] = useState<'typed' | 'voice' | 'line'>('typed');
  const [busy, setBusy] = useState(false);

  const totals = useMemo(() => computeDraftTotals(fields.items, fields), [fields]);
  const gate = useMemo(() => canFinalize(fields), [fields]);

  const setFields = useCallback((next: DraftFields | ((f: DraftFields) => DraftFields)) => {
    setFieldsState((prev) => {
      const value = typeof next === 'function' ? (next as (f: DraftFields) => DraftFields)(prev) : next;
      return { ...value, missing: missingFields(value) };
    });
  }, []);

  const applyCommand = useCallback((text: string, src: 'typed' | 'voice' | 'line' = 'typed') => {
    const parsed = parseDocCommand(text);
    setTranscript(text);
    setSource(src);
    setFields(parsed);
    return parsed;
  }, [setFields]);

  const reset = useCallback(() => {
    setFieldsState({ ...EMPTY_FIELDS });
    setDraftId(null);
    setDocNo(null);
    setTranscript('');
  }, []);

  const saveDraft = useCallback(async (): Promise<string | null> => {
    setBusy(true);
    try {
      const { data: auth } = await db.auth.getUser();
      const t = computeDraftTotals(fields.items, fields);
      const payload = {
        doc_type: fields.docType,
        shop_key: fields.shopKey,
        customer_name: fields.customerName ?? null,
        customer_phone: fields.customerPhone ?? null,
        customer_address: fields.customerAddress ?? null,
        customer_tax_id: fields.customerTaxId ?? null,
        project: fields.project ?? null,
        notes: fields.notes ?? null,
        discount: fields.discount,
        vat_mode: fields.vatMode,
        vat_rate: fields.vatRate,
        wht_rate: fields.whtRate,
        deposit: fields.deposit,
        payment_status: fields.paymentStatus,
        payment_method: fields.paymentMethod ?? null,
        due_at: fields.dueAtISO ?? null,
        subtotal: t.subtotal,
        vat_amount: t.vatAmount,
        wht_amount: t.whtAmount,
        total: t.total,
        missing_fields: fields.missing,
        source,
        transcript: transcript || null,
        raw_command: transcript || null,
        parsed: fields as unknown as Record<string, unknown>,
      };

      let id = draftId;
      if (id) {
        const { error } = await db.from('document_command_drafts').update(payload).eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await db
          .from('document_command_drafts')
          .insert({ ...payload, status: 'draft', created_by: auth?.user?.id ?? null })
          .select('id')
          .single();
        if (error) throw error;
        id = data.id as string;
        setDraftId(id);
      }

      await db.from('document_command_items').delete().eq('draft_id', id);
      if (fields.items.length) {
        const { error } = await db.from('document_command_items').insert(
          fields.items.map((i, idx) => ({
            draft_id: id,
            description: i.description,
            quantity: i.quantity,
            unit: i.unit,
            unit_price: i.unitPrice,
            discount: i.discount,
            total: (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0) - (Number(i.discount) || 0),
            sort_order: idx,
          })),
        );
        if (error) throw error;
      }

      await db.from('document_command_audit').insert({
        draft_id: id,
        event: 'draft_saved',
        detail: { total: t.total, missing: fields.missing },
        actor_id: auth?.user?.id ?? null,
        source,
      });
      toast.success('บันทึกฉบับร่างแล้ว');
      return id;
    } catch (err: any) {
      toast.error(`บันทึกฉบับร่างไม่สำเร็จ: ${err?.message ?? err}`);
      return null;
    } finally {
      setBusy(false);
    }
  }, [fields, draftId, source, transcript]);

  /** Explicit staff confirmation — idempotent, allocates the real number. */
  const finalize = useCallback(async (): Promise<string | null> => {
    if (busy) return null;
    if (!gate.ok) {
      toast.error(gate.reasons[0]);
      return null;
    }
    setBusy(true);
    try {
      const id = await (async () => {
        setBusy(false);
        const saved = await saveDraft();
        setBusy(true);
        return saved;
      })();
      if (!id) return null;
      const { data, error } = await db.rpc('document_command_finalize', { p_draft_id: id });
      if (error) {
        const key = Object.keys(FINALIZE_ERRORS).find((k) => String(error.message).includes(k));
        toast.error(key ? FINALIZE_ERRORS[key] : `ออกเอกสารไม่สำเร็จ: ${error.message}`);
        return null;
      }
      const row = Array.isArray(data) ? data[0] : data;
      const no = row?.doc_no ?? null;
      setDocNo(no);
      toast.success(row?.already ? `เอกสารนี้ออกเลขแล้ว: ${no}` : `ออกเอกสารสำเร็จ: ${no}`);
      return no;
    } finally {
      setBusy(false);
    }
  }, [busy, gate, saveDraft]);

  const cancelDraft = useCallback(async (reason: string) => {
    if (!draftId) { reset(); return; }
    await db.from('document_command_drafts')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: reason })
      .eq('id', draftId)
      .eq('status', 'draft');
    await db.from('document_command_audit').insert({ draft_id: draftId, event: 'cancelled', detail: { reason }, source });
    toast.success('ยกเลิกฉบับร่างแล้ว');
    reset();
  }, [draftId, reset, source]);

  const history = useCallback(async () => {
    if (!draftId) return [];
    const { data } = await db.from('document_command_audit')
      .select('*').eq('draft_id', draftId).order('created_at', { ascending: false }).limit(50);
    return data ?? [];
  }, [draftId]);

  return {
    fields, setFields, applyCommand, totals, gate, busy,
    draftId, docNo, transcript, setTranscript, source, setSource,
    saveDraft, finalize, cancelDraft, reset, history,
  };
}