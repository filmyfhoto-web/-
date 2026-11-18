import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/film-shop/lib/supabase';
import { reportChannelStatus, unregisterChannel, onGlobalRefresh, getRealtimeState, markSynced } from '@/film-shop/lib/realtimeStatus';
import {
  FilmOrder,
  FilmOrderEvent,
  FilmOrderItem,
  FilmOrderJob,
  OrderDraftInput,
  OrderStatus,
  computeOrderTotals,
  initialOrderStatus,
  orderItemTotal,
} from '@/film-shop/types/order';

const db = supabase as any;

function mapItem(row: any): FilmOrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    description: row.description ?? '',
    quantity: Number(row.quantity) || 0,
    unit: row.unit ?? 'ชิ้น',
    unitPrice: Number(row.unit_price) || 0,
    total: Number(row.total) || 0,
    notes: row.notes ?? undefined,
    sortOrder: Number(row.sort_order) || 0,
  };
}

function mapJob(row: any): FilmOrderJob {
  return {
    id: row.id,
    orderId: row.order_id,
    orderItemId: row.order_item_id ?? undefined,
    title: row.title ?? '',
    status: (row.status ?? 'waiting_info') as OrderStatus,
    sortOrder: Number(row.sort_order) || 0,
    doneAt: row.done_at ? new Date(row.done_at) : undefined,
  };
}

function mapOrder(row: any, items: FilmOrderItem[], jobs: FilmOrderJob[]): FilmOrder {
  return {
    id: row.id,
    orderNo: row.order_no,
    customerId: row.customer_id ?? undefined,
    customerName: row.customer_name ?? '',
    customerPhone: row.customer_phone ?? undefined,
    orgName: row.org_name ?? undefined,
    assignee: row.assignee ?? undefined,
    channel: (row.channel ?? 'walkin') as FilmOrder['channel'],
    title: row.title ?? '',
    dueAt: row.due_at ? new Date(row.due_at) : undefined,
    isUrgent: !!row.is_urgent,
    hasDesign: !!row.has_design,
    status: (row.status ?? 'waiting_info') as OrderStatus,
    paymentStatus: (row.payment_status ?? 'unpaid') as FilmOrder['paymentStatus'],
    subtotal: Number(row.subtotal) || 0,
    discount: Number(row.discount) || 0,
    deposit: Number(row.deposit) || 0,
    vatRate: Number(row.vat_rate) || 0,
    vatAmount: Number(row.vat_amount) || 0,
    paidAmount: Number(row.paid_amount) || 0,
    total: Number(row.total) || 0,
    notes: row.notes ?? undefined,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    isDraft: !!row.is_draft,
    sourceJobRequestId: row.source_job_request_id ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at ?? row.created_at),
    items,
    jobs,
  };
}

export function useFilmOrders() {
  const [orders, setOrders] = useState<FilmOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setError(null);
    const [{ data: orderRows, error: oErr }, { data: itemRows }, { data: jobRows }] = await Promise.all([
      db.from('film_orders').select('*').order('created_at', { ascending: false }).limit(500),
      db.from('film_order_items').select('*').order('sort_order', { ascending: true }),
      db.from('film_order_jobs').select('*').order('sort_order', { ascending: true }),
    ]);
    if (oErr) {
      console.error('fetch film_orders failed', oErr);
      setError('โหลดข้อมูลออเดอร์ไม่สำเร็จ');
      setLoading(false);
      return;
    }
    const items = (itemRows ?? []).map(mapItem);
    const jobs = (jobRows ?? []).map(mapJob);
    setOrders(
      (orderRows ?? []).map((row: any) =>
        mapOrder(
          row,
          items.filter((i) => i.orderId === row.id),
          jobs.filter((j) => j.orderId === row.id),
        ),
      ),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOrders();
    const id = Math.random().toString(36).slice(2, 10);
    const channelName = `film-orders-${id}`;
    const channel = db
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'film_orders' }, () => fetchOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'film_order_items' }, () => fetchOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'film_order_jobs' }, () => fetchOrders())
      .subscribe((status: string) => reportChannelStatus(channelName, status));
    const offGlobal = onGlobalRefresh(() => { void fetchOrders(); });
    const onVisible = () => { if (document.visibilityState === 'visible') void fetchOrders(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    const poll = window.setInterval(() => {
      if (getRealtimeState() !== 'connected') void fetchOrders();
    }, 30000);
    return () => {
      offGlobal();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      window.clearInterval(poll);
      unregisterChannel(channelName);
      db.removeChannel(channel);
    };
  }, [fetchOrders]);

  const createOrder = useCallback(async (input: OrderDraftInput): Promise<FilmOrder | null> => {
    const items = (input.items || []).filter((i) => i.description?.trim());
    const { subtotal, total, vatAmount, vatRate } = computeOrderTotals(items, input.discount, input.vatRate);
    const status = input.isDraft ? 'waiting_info' : initialOrderStatus({ ...input, items });

    let orderNo = '';
    const { data: nextNo, error: rpcErr } = await db.rpc('film_next_order_number');
    if (!rpcErr && typeof nextNo === 'string' && nextNo) orderNo = nextNo;
    else orderNo = `OR-${Date.now().toString().slice(-8)}`;

    const { data: orderRow, error: insErr } = await db
      .from('film_orders')
      .insert({
        order_no: orderNo,
        customer_id: input.customerId || null,
        customer_name: input.customerName?.trim() || '',
        customer_phone: input.customerPhone || null,
        org_name: input.orgName || null,
        assignee: input.assignee || null,
        channel: input.channel,
        title: input.title?.trim() || '',
        due_at: input.dueAt ? new Date(input.dueAt).toISOString() : null,
        is_urgent: input.isUrgent,
        has_design: input.hasDesign,
        status,
        payment_status: input.paymentStatus,
        subtotal,
        discount: Number(input.discount) || 0,
        deposit: Number(input.deposit) || 0,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        total,
        notes: input.notes || null,
        attachments: input.attachments ?? [],
        is_draft: !!input.isDraft,
        source_job_request_id: input.sourceJobRequestId || null,
      })
      .select()
      .single();

    if (insErr || !orderRow) {
      console.error('create film order failed', insErr);
      toast.error('บันทึกออเดอร์ไม่สำเร็จ');
      return null;
    }

    let createdItems: FilmOrderItem[] = [];
    if (items.length > 0) {
      const { data: itemRows, error: itemErr } = await db
        .from('film_order_items')
        .insert(
          items.map((i, idx) => ({
            order_id: orderRow.id,
            description: i.description.trim(),
            quantity: Number(i.quantity) || 0,
            unit: i.unit || 'ชิ้น',
            unit_price: Number(i.unitPrice) || 0,
            total: orderItemTotal(i),
            notes: i.notes || null,
            sort_order: idx,
          })),
        )
        .select();
      if (itemErr) console.error('create film order items failed', itemErr);
      createdItems = (itemRows ?? []).map(mapItem);

      // One queue job per item so each line can be finished separately.
      if (itemRows?.length) {
        await db.from('film_order_jobs').insert(
          itemRows.map((r: any, idx: number) => ({
            order_id: orderRow.id,
            order_item_id: r.id,
            title: r.description || `งานที่ ${idx + 1}`,
            status,
            sort_order: idx,
          })),
        );
      }
    }

    await db.from('film_order_events').insert({
      order_id: orderRow.id,
      to_status: status,
      note: input.isDraft ? 'บันทึกร่างออเดอร์' : 'รับออเดอร์ใหม่',
    });

    await fetchOrders();
    return mapOrder(orderRow, createdItems, []);
  }, [fetchOrders]);

  const setOrderStatus = useCallback(async (order: FilmOrder, to: OrderStatus, note?: string) => {
    const from = order.status;
    if (from === to) return;
    const { error: upErr } = await db
      .from('film_orders')
      .update({ status: to, is_draft: false })
      .eq('id', order.id);
    if (upErr) {
      toast.error('เปลี่ยนสถานะไม่สำเร็จ');
      return;
    }
    await db.from('film_order_events').insert({
      order_id: order.id,
      from_status: from,
      to_status: to,
      note: note || null,
    });
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: to, isDraft: false } : o)));
    fetchOrders();
  }, [fetchOrders]);

  const setJobStatus = useCallback(async (job: FilmOrderJob, to: OrderStatus, note?: string) => {
    const from = job.status;
    if (from === to) return;
    const { error: upErr } = await db
      .from('film_order_jobs')
      .update({ status: to, done_at: to === 'delivered' ? new Date().toISOString() : null })
      .eq('id', job.id);
    if (upErr) {
      toast.error('เปลี่ยนสถานะงานย่อยไม่สำเร็จ');
      return;
    }
    await db.from('film_order_events').insert({
      order_id: job.orderId,
      order_job_id: job.id,
      from_status: from,
      to_status: to,
      note: note || null,
    });
    fetchOrders();
  }, [fetchOrders]);

  const updateOrder = useCallback(async (id: string, patch: Partial<Record<string, unknown>>) => {
    const { error: upErr } = await db.from('film_orders').update(patch).eq('id', id);
    if (upErr) {
      toast.error('บันทึกไม่สำเร็จ');
      return;
    }
    fetchOrders();
  }, [fetchOrders]);

  /** ยกเลิกออเดอร์ — เก็บประวัติไว้ครบ ไม่ลบข้อมูล */
  const cancelOrder = useCallback(async (order: FilmOrder, reason?: string) => {
    if (order.status === 'cancelled') return;
    const { error: upErr } = await db
      .from('film_orders')
      .update({ status: 'cancelled', is_draft: false })
      .eq('id', order.id);
    if (upErr) {
      toast.error('ยกเลิกออเดอร์ไม่สำเร็จ');
      return;
    }
    await db.from('film_order_events').insert({
      order_id: order.id,
      from_status: order.status,
      to_status: 'cancelled',
      note: reason?.trim() ? `ยกเลิกออเดอร์: ${reason.trim()}` : 'ยกเลิกออเดอร์',
    });
    toast.success('ยกเลิกออเดอร์แล้ว');
    fetchOrders();
  }, [fetchOrders]);

  /**
   * ตรวจว่าลบออเดอร์นี้ได้อย่างปลอดภัยไหม — ถ้ามีเอกสาร/การเงินผูกอยู่ ให้ยกเลิกแทนการลบ
   */
  const checkOrderDeletable = useCallback(async (id: string): Promise<{ ok: boolean; blockers: string[] }> => {
    const blockers: string[] = [];
    const checks: [string, PromiseLike<{ count: number | null }>][] = [
      ['ใบแจ้งหนี้/ใบเสร็จ', db.from('film_invoices').select('id', { count: 'exact', head: true }).eq('source_order_id', id)],
      ['รายการชำระเงิน', db.from('film_order_payments').select('id', { count: 'exact', head: true }).eq('order_id', id)],
      ['งานส่งนอก', db.from('film_outsource_orders').select('id', { count: 'exact', head: true }).eq('order_id', id)],
    ];
    for (const [label, q] of checks) {
      const { count } = await q;
      if ((count ?? 0) > 0) blockers.push(label);
    }
    return { ok: blockers.length === 0, blockers };
  }, []);

  const deleteOrder = useCallback(async (id: string) => {
    const { ok, blockers } = await checkOrderDeletable(id);
    if (!ok) {
      toast.error(`ลบไม่ได้ เพราะมี${blockers.join(' / ')}ผูกอยู่ — ให้ใช้ “ยกเลิกออเดอร์” แทน`);
      return;
    }
    // ลบข้อมูลลูกก่อน กัน foreign key ค้าง
    await db.from('film_order_events').delete().eq('order_id', id);
    await db.from('film_order_jobs').delete().eq('order_id', id);
    await db.from('film_order_items').delete().eq('order_id', id);
    const { error: delErr } = await db.from('film_orders').delete().eq('id', id);
    if (delErr) {
      toast.error('ลบออเดอร์ไม่สำเร็จ');
      return;
    }
    toast.success('ลบออเดอร์แล้ว');
    fetchOrders();
  }, [fetchOrders, checkOrderDeletable]);

  const fetchEvents = useCallback(async (orderId: string): Promise<FilmOrderEvent[]> => {
    const { data } = await db
      .from('film_order_events')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });
    return (data ?? []).map((r: any) => ({
      id: r.id,
      orderId: r.order_id,
      orderJobId: r.order_job_id ?? undefined,
      fromStatus: r.from_status ?? undefined,
      toStatus: r.to_status,
      note: r.note ?? undefined,
      createdAt: new Date(r.created_at),
    }));
  }, []);

  const stats = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const active = orders.filter((o) => o.status !== 'delivered');
    return {
      today: orders.filter((o) => o.createdAt >= startOfToday).length,
      todayAmount: orders.filter((o) => o.createdAt >= startOfToday).reduce((s, o) => s + o.total, 0),
      active: active.length,
      urgent: active.filter((o) => o.isUrgent).length,
      ready: orders.filter((o) => o.status === 'ready').length,
    };
  }, [orders]);

  return {
    orders,
    loading,
    error,
    refresh: fetchOrders,
    createOrder,
    updateOrder,
    deleteOrder,
    cancelOrder,
    checkOrderDeletable,
    setOrderStatus,
    setJobStatus,
    fetchEvents,
    stats,
  };
}