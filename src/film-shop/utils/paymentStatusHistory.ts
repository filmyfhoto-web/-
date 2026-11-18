import { supabase } from '@/film-shop/lib/supabase';

export interface StatusHistoryEntry {
  id: string;
  doc_type: 'invoice' | 'pos_receipt';
  doc_id: string;
  doc_number: string;
  status_from: string | null;
  status_to: string;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_at: string;
  notes: string | null;
}

export async function logStatusChange(args: {
  docType: 'invoice' | 'pos_receipt';
  docId: string;
  docNumber: string;
  statusFrom: string | null;
  statusTo: string;
  notes?: string;
}) {
  try {
    const { data: userRes } = await supabase.auth.getUser();
    const u = userRes?.user;
    const name = (u?.user_metadata?.full_name as string) || u?.email || null;
    await supabase.from('payment_status_history').insert({
      doc_type: args.docType,
      doc_id: args.docId,
      doc_number: args.docNumber,
      status_from: args.statusFrom,
      status_to: args.statusTo,
      changed_by: u?.id || null,
      changed_by_name: name,
      notes: args.notes || null,
    } as any);
  } catch (e) {
    // best-effort logging
    console.warn('logStatusChange failed', e);
  }
}

export async function fetchStatusHistory(docType: 'invoice' | 'pos_receipt', docId: string): Promise<StatusHistoryEntry[]> {
  const { data, error } = await supabase
    .from('payment_status_history')
    .select('*')
    .eq('doc_type', docType)
    .eq('doc_id', docId)
    .order('changed_at', { ascending: false });
  if (error) return [];
  return (data || []) as any;
}

/**
 * Fetch all status changes between two ISO timestamps (inclusive of `from`, exclusive of `to`).
 */
export async function fetchStatusHistoryRange(fromISO: string, toISO: string): Promise<StatusHistoryEntry[]> {
  const { data, error } = await supabase
    .from('payment_status_history')
    .select('*')
    .gte('changed_at', fromISO)
    .lt('changed_at', toISO)
    .order('changed_at', { ascending: false })
    .limit(1000);
  if (error) {
    console.warn('fetchStatusHistoryRange failed', error);
    return [];
  }
  return (data || []) as any;
}
