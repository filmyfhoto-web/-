import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/film-shop/lib/supabase';
import { toast } from 'sonner';

export interface DailyReportSnapshot {
  sales: {
    total: number;
    count: number;
    byStatus: Record<string, { count: number; total: number }>;
    byPaymentType: Record<string, { count: number; total: number }>;
    receipts: Array<{ id: string; number: string; customer: string; total: number; status: string; paymentType: string }>;
    byCategory: Array<{ category: string; itemCount: number; quantity: number; total: number; topItems: Array<{ name: string; quantity: number; total: number }> }>;
    receiptsDetailed: Array<{
      id: string;
      number: string;
      customer: string;
      total: number;
      status: string;
      paymentType: string;
      receiptDate: string;
      items: Array<{ name: string; quantity: number; total: number; category: string }>;
    }>;
  };
  invoices: {
    total: number;
    count: number;
    byStatus: Record<string, { count: number; total: number }>;
    byType: Record<string, { count: number; total: number }>;
    byPaymentMethod: Record<string, { count: number; total: number }>;
    unpaidTotal: number;       // outstanding receivable (pending+deposit balance+credit)
    depositCollected: number;  // deposit amounts already received
    creditTotal: number;       // total recorded on account (เครดิต)
    paidTotal: number;         // fully paid amount
    items: Array<{ id: string; number: string; customer: string; type: string; total: number; due: number; status: string }>;
  };
  outstanding: {
    count: number;
    totalDue: number;
    byStatus: Record<string, { count: number; totalDue: number }>;
    items: Array<{ id: string; number: string; customer: string; type: string; documentDate: string; ageDays: number; total: number; due: number; status: string }>;
  };
  expenses: {
    total: number;
    income: number;
    items: Array<{ category: string; description: string; amount: number; type: string }>;
  };
  cashAdvances: {
    newCount: number;
    newAmount: number;
    repaidCount: number;
    repaidAmount: number;
    items: Array<{ borrower: string; purpose: string; amount: number; status: string }>;
  };
  cashDrawer: Array<{
    openingAmount: number;
    expectedAmount: number;
    actualAmount: number | null;
    difference: number | null;
    status: string;
    openedAt: string;
    closedAt: string | null;
    txCount: number;
  }>;
  topProducts: Array<{ name: string; count: number; total: number }>;
  paperWithdrawals: {
    count: number;
    items: Array<{ paperType: string; quantity: number; unit: string; withdrawnBy: string; purpose: string | null; withdrawnAt: string }>;
  };
}

export interface DailyReportAttachment { name: string; path: string; size?: number; type?: string }

export interface DailyReportRow {
  id: string;
  report_date: string;
  snapshot: DailyReportSnapshot;
  notes: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  attachments?: DailyReportAttachment[];
}

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const dayBounds = (dateStr: string) => {
  const start = new Date(`${dateStr}T00:00:00`);
  const end = new Date(`${dateStr}T23:59:59.999`);
  return { startISO: start.toISOString(), endISO: end.toISOString(), start, end };
};

export async function buildDailyReportSnapshot(dateStr: string): Promise<DailyReportSnapshot> {
  const { startISO, endISO } = dayBounds(dateStr);

  const [receiptsRes, txRes, advRes, repayRes, shiftsRes, invRes, outstandingRes, paperRes, productsRes] = await Promise.all([
    supabase.from('pos_receipts').select('*').gte('receipt_date', startISO).lte('receipt_date', endISO),
    supabase.from('transactions').select('*').gte('date', startISO).lte('date', endISO),
    supabase.from('cash_advances').select('*').gte('borrowed_at', startISO).lte('borrowed_at', endISO).is('deleted_at', null),
    supabase.from('cash_advance_repayments').select('*').gte('repaid_at', startISO).lte('repaid_at', endISO).is('deleted_at', null),
    supabase.from('cash_drawer_shifts').select('id, opening_amount, expected_amount, actual_amount, difference, status, opened_at, closed_at').gte('opened_at', startISO).lte('opened_at', endISO),
    // Filter invoices by document_date (preferred) — coalesce to created_at for legacy rows.
    supabase.from('invoices').select('*').or(`and(document_date.gte.${startISO},document_date.lte.${endISO}),and(document_date.is.null,created_at.gte.${startISO},created_at.lte.${endISO})`),
    // Outstanding bills (all dates) — pending / deposit / credit / partial that still owe money.
    supabase.from('invoices').select('id, invoice_number, customer_name, type, total, amount_due, status, document_date, created_at, is_draft').in('status', ['pending', 'deposit', 'partial', 'credit']),
    supabase.from('paper_withdrawals').select('paper_type, quantity, unit, withdrawn_by, purpose, withdrawn_at').gte('withdrawn_at', startISO).lte('withdrawn_at', endISO),
    supabase.from('pos_products').select('id, name, category'),
  ]);

  // Build product → category lookup (by id and by name)
  const productCategoryById: Record<string, string> = {};
  const productCategoryByName: Record<string, string> = {};
  (productsRes.data || []).forEach((p: any) => {
    if (p.id) productCategoryById[p.id] = p.category || 'อื่น ๆ';
    if (p.name) productCategoryByName[p.name] = p.category || 'อื่น ๆ';
  });

  // Sales
  const receipts = receiptsRes.data || [];
  const byStatus: Record<string, { count: number; total: number }> = {
    pending: { count: 0, total: 0 },
    deposit: { count: 0, total: 0 },
    paid: { count: 0, total: 0 },
    credit: { count: 0, total: 0 },
  };
  const byPaymentType: Record<string, { count: number; total: number }> = {
    cash: { count: 0, total: 0 },
    credit: { count: 0, total: 0 },
  };
  let salesTotal = 0;
  const productMap: Record<string, { count: number; total: number }> = {};
  const categoryMap: Record<string, { itemCount: number; quantity: number; total: number; items: Record<string, { quantity: number; total: number }> }> = {};
  const receiptsDetailed: DailyReportSnapshot['sales']['receiptsDetailed'] = [];
  receipts.forEach((r: any) => {
    const status = r.payment_status || 'pending';
    const pt = r.payment_type || 'cash';
    const total = Number(r.total) || 0;
    salesTotal += total;
    if (!byStatus[status]) byStatus[status] = { count: 0, total: 0 };
    byStatus[status].count += 1;
    byStatus[status].total += total;
    if (!byPaymentType[pt]) byPaymentType[pt] = { count: 0, total: 0 };
    byPaymentType[pt].count += 1;
    byPaymentType[pt].total += total;
    const detailItems: Array<{ name: string; quantity: number; total: number; category: string }> = [];
    (r.items || []).forEach((it: any) => {
      const name = it.name || 'ไม่ระบุ';
      const qty = Number(it.quantity) || 1;
      const itemTotal = Number(it.total) || 0;
      if (!productMap[name]) productMap[name] = { count: 0, total: 0 };
      productMap[name].count += qty;
      productMap[name].total += itemTotal;
      const cat = (it.category as string) || productCategoryById[it.productId || it.id] || productCategoryByName[name] || 'อื่น ๆ';
      if (!categoryMap[cat]) categoryMap[cat] = { itemCount: 0, quantity: 0, total: 0, items: {} };
      categoryMap[cat].itemCount += 1;
      categoryMap[cat].quantity += qty;
      categoryMap[cat].total += itemTotal;
      if (!categoryMap[cat].items[name]) categoryMap[cat].items[name] = { quantity: 0, total: 0 };
      categoryMap[cat].items[name].quantity += qty;
      categoryMap[cat].items[name].total += itemTotal;
      detailItems.push({ name, quantity: qty, total: itemTotal, category: cat });
    });
    receiptsDetailed.push({
      id: r.id,
      number: r.receipt_number,
      customer: r.customer_name || '-',
      total,
      status,
      paymentType: pt,
      receiptDate: r.receipt_date,
      items: detailItems,
    });
  });

  const byCategory = Object.entries(categoryMap)
    .map(([category, v]) => ({
      category,
      itemCount: v.itemCount,
      quantity: v.quantity,
      total: v.total,
      topItems: Object.entries(v.items)
        .map(([name, x]) => ({ name, quantity: x.quantity, total: x.total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 3),
    }))
    .sort((a, b) => b.total - a.total);

  const topProducts = Object.entries(productMap)
    .map(([name, v]) => ({ name, count: v.count, total: v.total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // Transactions (income/expense)
  const txs = txRes.data || [];
  let expenseTotal = 0, incomeTotal = 0;
  const txItems = txs.map((t: any) => {
    const amt = Number(t.amount) || 0;
    if (t.type === 'expense') expenseTotal += amt;
    else incomeTotal += amt;
    return { category: t.category, description: t.description, amount: amt, type: t.type };
  });

  // Cash advances
  const advs = advRes.data || [];
  const reps = repayRes.data || [];
  const cashAdvances = {
    newCount: advs.length,
    newAmount: advs.reduce((s, a: any) => s + (Number(a.amount) || 0), 0),
    repaidCount: reps.length,
    repaidAmount: reps.reduce((s, r: any) => s + (Number(r.amount) || 0), 0),
    items: advs.map((a: any) => ({
      borrower: a.borrower_name,
      purpose: a.purpose,
      amount: Number(a.amount) || 0,
      status: a.status,
    })),
  };

  // Shifts
  const shifts = shiftsRes.data || [];
  const shiftIds = shifts.map((s: any) => s.id);
  let txCountByShift: Record<string, number> = {};
  if (shiftIds.length > 0) {
    const { data: txData } = await supabase
      .from('cash_drawer_transactions')
      .select('shift_id')
      .in('shift_id', shiftIds);
    (txData || []).forEach((t: any) => {
      txCountByShift[t.shift_id] = (txCountByShift[t.shift_id] || 0) + 1;
    });
  }
  const cashDrawer = shifts.map((s: any) => ({
    openingAmount: Number(s.opening_amount) || 0,
    expectedAmount: Number(s.expected_amount) || 0,
    actualAmount: s.actual_amount != null ? Number(s.actual_amount) : null,
    difference: s.difference != null ? Number(s.difference) : null,
    status: s.status,
    openedAt: s.opened_at,
    closedAt: s.closed_at,
    txCount: txCountByShift[s.id] || 0,
  }));

  // Invoices (quotation/invoice/receipt) created today — exclude drafts
  const invs = (invRes.data || []).filter((i: any) => !i.is_draft);
  const invByStatus: Record<string, { count: number; total: number }> = {
    pending: { count: 0, total: 0 }, deposit: { count: 0, total: 0 }, credit: { count: 0, total: 0 }, paid: { count: 0, total: 0 },
  };
  const invByType: Record<string, { count: number; total: number }> = {
    quotation: { count: 0, total: 0 }, invoice: { count: 0, total: 0 }, receipt: { count: 0, total: 0 },
  };
  const invByPaymentMethod: Record<string, { count: number; total: number }> = {
    cash: { count: 0, total: 0 }, transfer: { count: 0, total: 0 }, credit: { count: 0, total: 0 },
  };
  let invTotal = 0, unpaidTotal = 0, depositCollected = 0, creditTotal = 0, paidTotal = 0;
  const invItems = invs.map((i: any) => {
    const total = Number(i.total) || 0;
    const due = Number(i.amount_due) || 0;
    const dep = Number(i.deposit) || 0;
    let s = i.status || 'pending';
    if (s === 'partial') s = 'deposit';
    invTotal += total;
    if (!invByStatus[s]) invByStatus[s] = { count: 0, total: 0 };
    invByStatus[s].count += 1; invByStatus[s].total += total;
    if (invByType[i.type]) { invByType[i.type].count += 1; invByType[i.type].total += total; }
    if (s === 'paid') paidTotal += total;
    else if (s === 'deposit') { depositCollected += dep; unpaidTotal += due; }
    else if (s === 'credit') { creditTotal += total; unpaidTotal += total; }
    else unpaidTotal += due;
    // Aggregate by payment method (only paid/deposit count toward actual money received)
    if (s === 'paid' || s === 'deposit') {
      const pm = (i.payment_method as string) || 'cash';
      const received = s === 'paid' ? total : dep;
      if (!invByPaymentMethod[pm]) invByPaymentMethod[pm] = { count: 0, total: 0 };
      invByPaymentMethod[pm].count += 1;
      invByPaymentMethod[pm].total += received;
    }
    return { id: i.id, number: i.invoice_number, customer: i.customer_name || '-', type: i.type, total, due, status: s };
  });

  // Outstanding bills (all dates)
  const outRows = (outstandingRes.data || []).filter((r: any) => !r.is_draft && (Number(r.amount_due) || 0) > 0);
  const outByStatus: Record<string, { count: number; totalDue: number }> = {
    pending: { count: 0, totalDue: 0 }, deposit: { count: 0, totalDue: 0 }, credit: { count: 0, totalDue: 0 },
  };
  const now = Date.now();
  const outItems = outRows.map((r: any) => {
    let s = r.status || 'pending';
    if (s === 'partial') s = 'deposit';
    const due = Number(r.amount_due) || 0;
    if (!outByStatus[s]) outByStatus[s] = { count: 0, totalDue: 0 };
    outByStatus[s].count += 1;
    outByStatus[s].totalDue += due;
    const docDate = r.document_date || r.created_at;
    const ageDays = Math.max(0, Math.floor((now - new Date(docDate).getTime()) / 86400000));
    return {
      id: r.id,
      number: r.invoice_number,
      customer: r.customer_name || '-',
      type: r.type,
      documentDate: docDate,
      ageDays,
      total: Number(r.total) || 0,
      due,
      status: s,
    };
  }).sort((a, b) => b.ageDays - a.ageDays);
  const outstanding = {
    count: outRows.length,
    totalDue: outItems.reduce((s, it) => s + it.due, 0),
    byStatus: outByStatus,
    items: outItems,
  };

  // Paper withdrawals
  const paperRows = paperRes.data || [];
  const paperWithdrawals = {
    count: paperRows.length,
    items: paperRows.map((p: any) => ({
      paperType: p.paper_type,
      quantity: Number(p.quantity) || 0,
      unit: p.unit,
      withdrawnBy: p.withdrawn_by,
      purpose: p.purpose,
      withdrawnAt: p.withdrawn_at,
    })),
  };

  return {
    sales: {
      total: salesTotal,
      count: receipts.length,
      byStatus,
      byPaymentType,
      receipts: receipts.map((r: any) => ({
        id: r.id,
        number: r.receipt_number,
        customer: r.customer_name || '-',
        total: Number(r.total) || 0,
        status: r.payment_status || 'pending',
        paymentType: r.payment_type || 'cash',
      })),
      byCategory,
      receiptsDetailed,
    },
    invoices: {
      total: invTotal, count: invs.length,
      byStatus: invByStatus, byType: invByType, byPaymentMethod: invByPaymentMethod,
      unpaidTotal, depositCollected, creditTotal, paidTotal,
      items: invItems,
    },
    outstanding,
    expenses: { total: expenseTotal, income: incomeTotal, items: txItems },
    cashAdvances,
    cashDrawer,
    topProducts,
    paperWithdrawals,
  };
}

export function useDailyReport(date?: string) {
  const reportDate = date || todayStr();
  const [snapshot, setSnapshot] = useState<DailyReportSnapshot | null>(null);
  const [savedReport, setSavedReport] = useState<DailyReportRow | null>(null);
  const [history, setHistory] = useState<DailyReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refreshSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await buildDailyReportSnapshot(reportDate);
      setSnapshot(snap);
      setLastUpdated(new Date());
    } catch (e: any) {
      toast.error('สร้างรายงานล้มเหลว: ' + (e?.message || 'unknown'));
    } finally {
      setLoading(false);
    }
  }, [reportDate]);

  const fetchSaved = useCallback(async () => {
    const { data } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('report_date', reportDate)
      .maybeSingle();
    if (data) {
      setSavedReport(data as any);
      setNotes(data.notes || '');
    } else {
      setSavedReport(null);
      setNotes('');
    }
  }, [reportDate]);

  const fetchHistory = useCallback(async () => {
    const { data, error } = await supabase
      .from('daily_reports')
      .select('*')
      .order('report_date', { ascending: false })
      .limit(90);
    if (error) {
      toast.error('โหลดประวัติล้มเหลว');
      return;
    }
    setHistory((data as any) || []);
  }, []);

  useEffect(() => {
    refreshSnapshot();
    fetchSaved();
  }, [refreshSnapshot, fetchSaved]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // Realtime: auto-refresh snapshot when source tables change (debounced)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { refreshSnapshot(); }, 800);
    };
    const tables = [
      'pos_receipts', 'invoices', 'transactions',
      'cash_advances', 'cash_advance_repayments',
      'cash_drawer_shifts', 'cash_drawer_transactions',
      'paper_withdrawals', 'payment_status_history',
    ];
    const channel = supabase.channel(`daily-report-live-${reportDate}`);
    tables.forEach((tbl) => {
      channel.on('postgres_changes' as any, { event: '*', schema: 'public', table: tbl }, trigger);
    });
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [reportDate, refreshSnapshot]);


  const save = useCallback(async (extraAttachments?: DailyReportAttachment[]) => {
    if (!snapshot) return false;
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const merged = extraAttachments ?? (savedReport?.attachments || []);
    const { error } = await supabase
      .from('daily_reports')
      .upsert({
        report_date: reportDate,
        snapshot: snapshot as any,
        notes: notes || null,
        attachments: merged as any,
        closed_by: userRes.user?.id || null,
        closed_at: new Date().toISOString(),
      }, { onConflict: 'report_date' });
    setSaving(false);
    if (error) {
      toast.error('บันทึกล้มเหลว: ' + error.message);
      return false;
    }
    toast.success('บันทึกรายงานประจำวันแล้ว');
    await fetchSaved();
    await fetchHistory();
    return true;
  }, [snapshot, notes, reportDate, fetchSaved, fetchHistory, savedReport]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from('daily_reports').delete().eq('id', id);
    if (error) { toast.error('ลบไม่สำเร็จ'); return false; }
    toast.success('ลบรายงานแล้ว');
    await fetchHistory();
    if (savedReport?.id === id) await fetchSaved();
    return true;
  }, [fetchHistory, fetchSaved, savedReport]);
  const uploadAttachments = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    const uploaded: DailyReportAttachment[] = [];
    for (const f of files) {
      const safeName = f.name.replace(/[^\w.\-]+/g, '_');
      const path = `${reportDate}/${Date.now()}_${safeName}`;
      const { error } = await supabase.storage.from('daily-report-attachments').upload(path, f);
      if (error) { toast.error(`อัปโหลด ${f.name} ล้มเหลว`); continue; }
      uploaded.push({ name: f.name, path, size: f.size, type: f.type });
    }
    if (uploaded.length === 0) return;
    const merged = [...((savedReport?.attachments) || []), ...uploaded];
    // Ensure we have a snapshot to upsert with
    let snap = snapshot;
    if (!snap) snap = await buildDailyReportSnapshot(reportDate);
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase.from('daily_reports').upsert({
      report_date: reportDate,
      snapshot: snap as any,
      notes: notes || null,
      attachments: merged as any,
      closed_by: userRes.user?.id || null,
      closed_at: new Date().toISOString(),
    }, { onConflict: 'report_date' });
    if (error) { toast.error('บันทึกไฟล์แนบล้มเหลว'); return; }
    toast.success(`แนบไฟล์ ${uploaded.length} ไฟล์`);
    await fetchSaved();
    await fetchHistory();
  }, [reportDate, savedReport, snapshot, notes, fetchSaved, fetchHistory]);

  const removeAttachment = useCallback(async (path: string) => {
    if (!savedReport) return;
    await supabase.storage.from('daily-report-attachments').remove([path]);
    const merged = (savedReport.attachments || []).filter((a) => a.path !== path);
    const { error } = await supabase.from('daily_reports').update({ attachments: merged as any }).eq('id', savedReport.id);
    if (error) { toast.error('ลบไฟล์ล้มเหลว'); return; }
    toast.success('ลบไฟล์แนบแล้ว');
    await fetchSaved();
    await fetchHistory();
  }, [savedReport, fetchSaved, fetchHistory]);

  return {
    reportDate,
    snapshot,
    savedReport,
    history,
    loading,
    saving,
    notes,
    setNotes,
    refreshSnapshot,
    fetchHistory,
    save,
    remove,
    uploadAttachments,
    removeAttachment,
    lastUpdated,
  };
}
