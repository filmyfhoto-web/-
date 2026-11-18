import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/film-shop/lib/supabase';
import {
  canDeliverOrder, computeTotals, defaultDept, deliverBlockReason, initialJobStatus, isWorkStatus,
  jobStatusForOutsource, missingFieldsForStatus,
  type OutsourceStatus, type WorkItemDraft, type WorkStatus,
} from '@/film-shop/workcenter/lib/workcenter';
import { refreshLineQueueCard } from '@/film-shop/lib/queueLineRefresh';

const db = supabase as any;

export interface WorkJob {
  id: string;
  jobNo: string | null;
  queueCode: string | null;
  priorityScore: number;
  priorityReason: string | null;
  pausedAt: string | null;
  qcStatus: string | null;
  orderId: string;
  orderNo: string;
  internalJobNo: string | null;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  paymentStatus: string | null;
  isUrgent: boolean;
  title: string;
  notes: string | null;
  category: string | null;
  dept: string | null;
  size: string | null;
  unit: string | null;
  quantity: number;
  costPrice: number;
  status: WorkStatus;
  dueAt: string | null;
  isOutsourced: boolean;
  outsourceId: string | null;
  assignedEmployeeId: string | null;
  assignedName: string | null;
  attachments: { name?: string; url?: string }[];
  orderTotal: number;
  orderDeposit: number;
  /** เงินที่รับไว้แล้วของออเดอร์ (มัดจำ/ชำระบางส่วน) */
  orderPaidAmount: number;
  orderDueAt: string | null;
  /** เวลาที่งานถูกสร้าง (ใช้เรียง “งานล่าสุด” บนหน้าภาพรวม) */
  createdAt: string | null;
}

export interface JobHistoryRow {
  id: string; action: string; fromStatus: string | null; toStatus: string | null;
  note: string | null; createdAt: string; createdBy: string | null;
}

export interface WorkEmployee { id: string; name: string; isActive: boolean }
export interface WorkSupplier { id: string; name: string; phone: string | null; isActive: boolean }

export interface DraftOrder {
  id: string; orderNo: string; internalJobNo: string | null;
  customerName: string; total: number; createdAt: string; itemCount: number;
}

export interface OutsourceItemRow {
  id: string; jobId: string | null; title: string; size: string | null;
  quantity: number; unit: string | null; material: string | null;
  finishing: string | null; costPrice: number; note: string | null;
}

export interface OutsourceOrder {
  id: string; woNo: string; supplierId: string | null; supplierName: string | null;
  orderId: string | null; status: OutsourceStatus; dueAt: string | null;
  note: string | null; totalCost: number; createdAt: string; items: OutsourceItemRow[];
}

export interface IntakeInput {
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  title: string;
  notes: string;
  dueAt: string;
  isUrgent: boolean;
  discount: string;
  deposit: string;
  items: WorkItemDraft[];
  isDraft: boolean;
}

function mapJob(r: any): WorkJob {
  return {
    id: r.id,
    jobNo: r.job_no ?? null,
    queueCode: r.queue_code ?? null,
    priorityScore: Number(r.priority_score) || 0,
    priorityReason: r.priority_reason ?? null,
    pausedAt: r.paused_at ?? null,
    qcStatus: r.qc_status ?? null,
    orderId: r.order_id,
    orderNo: r.film_orders?.order_no ?? '',
    internalJobNo: r.film_orders?.internal_job_no ?? null,
    customerId: r.film_orders?.customer_id ?? null,
    customerName: r.film_orders?.customer_name ?? '',
    customerPhone: r.film_orders?.customer_phone ?? null,
    paymentStatus: r.film_orders?.payment_status ?? null,
    isUrgent: !!r.film_orders?.is_urgent,
    title: r.title ?? '',
    notes: r.notes ?? null,
    category: r.category ?? null,
    dept: r.dept ?? null,
    size: r.size ?? null,
    unit: r.unit ?? null,
    quantity: Number(r.quantity) || 0,
    costPrice: Number(r.cost_price) || 0,
    status: isWorkStatus(r.status) ? r.status : 'new',
    dueAt: r.due_at ?? null,
    isOutsourced: !!r.is_outsourced,
    outsourceId: r.outsource_id ?? null,
    assignedEmployeeId: r.assigned_employee_id ?? null,
    assignedName: r.film_employees?.name ?? null,
    attachments: Array.isArray(r.attachments) ? r.attachments : [],
    orderTotal: Number(r.film_orders?.total) || 0,
    orderDeposit: Number(r.film_orders?.deposit) || 0,
    orderPaidAmount: Number(r.film_orders?.paid_amount) || 0,
    orderDueAt: r.film_orders?.due_at ?? null,
    createdAt: r.created_at ?? null,
  };
}

/** ชั้นข้อมูลเดียวของโมดูลศูนย์รับงาน — โหลดงาน พนักงาน ซัพพลายเออร์ และใบสั่งผลิต */
export function useWorkcenter() {
  const [jobs, setJobs] = useState<WorkJob[]>([]);
  const [employees, setEmployees] = useState<WorkEmployee[]>([]);
  const [suppliers, setSuppliers] = useState<WorkSupplier[]>([]);
  const [outsource, setOutsource] = useState<OutsourceOrder[]>([]);
  const [drafts, setDrafts] = useState<DraftOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef<Set<string>>(new Set());
  const [liveStatus, setLiveStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [lastSyncAt, setLastSyncAt] = useState<number>(() => Date.now());
  const [newJobIds, setNewJobIds] = useState<string[]>([]);
  const [changedJobIds, setChangedJobIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    const [jobsRes, empRes, supRes, woRes, draftRes] = await Promise.all([
      db.from('film_order_jobs')
        .select('*, film_orders!inner(id,order_no,internal_job_no,customer_id,customer_name,customer_phone,is_urgent,payment_status,is_draft,total,deposit,paid_amount,due_at), film_employees(id,name)')
        .order('created_at', { ascending: false })
        .limit(500),
      db.from('film_employees').select('id,name,is_active').order('name'),
      db.from('suppliers').select('id,name,phone,is_active').order('name'),
      db.from('film_outsource_orders')
        .select('*, suppliers(name), film_outsource_items(*)')
        .order('created_at', { ascending: false })
        .limit(200),
      db.from('film_orders')
        .select('id,order_no,internal_job_no,customer_name,total,created_at,film_order_items(id)')
        .eq('is_draft', true)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);
    setDrafts((draftRes.data ?? []).map((o: any): DraftOrder => ({
      id: o.id,
      orderNo: o.order_no ?? '',
      internalJobNo: o.internal_job_no ?? null,
      customerName: o.customer_name ?? '',
      total: Number(o.total) || 0,
      createdAt: o.created_at,
      itemCount: (o.film_order_items ?? []).length,
    })));
    setJobs((jobsRes.data ?? []).filter((r: any) => r.film_orders && !r.film_orders.is_draft).map(mapJob));
    setEmployees((empRes.data ?? []).map((e: any) => ({ id: e.id, name: e.name ?? '', isActive: e.is_active !== false })));
    setSuppliers((supRes.data ?? []).map((s: any) => ({ id: s.id, name: s.name ?? '', phone: s.phone ?? null, isActive: s.is_active !== false })));
    setOutsource((woRes.data ?? []).map((w: any): OutsourceOrder => ({
      id: w.id,
      woNo: w.wo_no,
      supplierId: w.supplier_id ?? null,
      supplierName: w.suppliers?.name ?? null,
      orderId: w.order_id ?? null,
      status: (w.status ?? 'pending') as OutsourceStatus,
      dueAt: w.due_at ?? null,
      note: w.note ?? null,
      totalCost: Number(w.total_cost) || 0,
      createdAt: w.created_at,
      items: (w.film_outsource_items ?? []).map((i: any): OutsourceItemRow => ({
        id: i.id, jobId: i.job_id ?? null, title: i.title ?? '', size: i.size ?? null,
        quantity: Number(i.quantity) || 0, unit: i.unit ?? null, material: i.material ?? null,
        finishing: i.finishing ?? null, costPrice: Number(i.cost_price) || 0, note: i.note ?? null,
      })),
    })));
    setLoading(false);
    setLastSyncAt(Date.now());
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const ch = db
      .channel(`workcenter-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'film_order_jobs' }, (payload: any) => {
        const id = payload?.new?.id ?? payload?.old?.id;
        if (payload?.eventType === 'INSERT' && id) {
          setNewJobIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
        } else if (payload?.eventType === 'UPDATE' && id) {
          setChangedJobIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
        }
        void load();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'film_outsource_orders' }, () => void load())
      .subscribe((status: string) => {
        setLiveStatus(status === 'SUBSCRIBED' ? 'live' : status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'offline' : 'connecting');
      });
    const poll = window.setInterval(() => void load(), 60000);
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      db.removeChannel(ch);
    };
  }, [load]);

  /** เคลียร์ตัวนับ “งานใหม่/อัปเดต” หลังแอดมินรับรู้แล้ว */
  const markSeen = useCallback(() => { setNewJobIds([]); setChangedJobIds([]); }, []);

  const logEvent = useCallback(async (
    orderId: string, jobId: string | null, action: string, from: string | null, to: string | null, note?: string,
  ) => {
    const { data: auth } = await db.auth.getUser();
    await db.from('film_order_events').insert({
      order_id: orderId, order_job_id: jobId, action,
      from_status: from, to_status: to, note: note ?? null,
      created_by: auth?.user?.id ?? null,
    });
  }, []);

  /** สร้างออเดอร์ + รายการ + งานย่อยแยกฝ่ายผลิต (ฉบับร่างหรือเข้าคิว) */
  const createIntake = useCallback(async (input: IntakeInput) => {
    setBusy(true);
    try {
      const items = input.items.filter((i) => i.category && i.title.trim());
      const totals = computeTotals(items, Number(input.discount), Number(input.deposit));
      const { data: auth } = await db.auth.getUser();
      const uid = auth?.user?.id ?? null;

      const { data: orderNo } = await db.rpc('film_next_order_number');
      const { data: jobNo } = await db.rpc('film_next_internal_job_no');

      const { data: order, error: orderErr } = await db.from('film_orders').insert({
        order_no: orderNo || `OR-${Date.now().toString().slice(-8)}`,
        internal_job_no: jobNo || null,
        customer_id: input.customerId,
        customer_name: input.customerName.trim(),
        customer_phone: input.customerPhone || null,
        channel: 'walkin',
        title: input.title.trim() || items[0]?.title || 'งานภายในร้าน',
        due_at: input.dueAt ? new Date(input.dueAt).toISOString() : null,
        is_urgent: input.isUrgent,
        status: input.isDraft ? 'waiting_info' : 'in_progress',
        payment_status: totals.deposit > 0 ? 'partial' : 'unpaid',
        subtotal: totals.subtotal,
        discount: totals.discount,
        deposit: totals.deposit,
        total: totals.total,
        notes: input.notes || null,
        is_draft: input.isDraft,
        created_by: uid,
      }).select('id, order_no, internal_job_no').single();
      if (orderErr || !order) throw orderErr ?? new Error('สร้างออเดอร์ไม่สำเร็จ');

      for (const [idx, it] of items.entries()) {
        const dept = it.dept || defaultDept(it.category);
        const qty = Number(it.quantity) || 1;
        const attachments = it.fileUrl ? [{ name: 'ไฟล์งาน', url: it.fileUrl }] : [];
        const { data: itemRow } = await db.from('film_order_items').insert({
          order_id: order.id,
          description: it.description || it.title,
          title: it.title,
          category: it.category,
          size: it.size || null,
          quantity: qty,
          unit: it.unit || 'ชิ้น',
          unit_price: Number(it.unitPrice) || 0,
          cost_price: Number(it.costPrice) || 0,
          total: qty * (Number(it.unitPrice) || 0),
          notes: it.notes || null,
          dept,
          is_outsourced: it.isOutsourced,
          assigned_employee_id: it.assignedEmployeeId || null,
          due_at: it.dueAt ? new Date(it.dueAt).toISOString() : null,
          attachments,
          sort_order: idx,
        }).select('id').single();

        void itemRow;
      }

      // สร้างงานย่อยผ่านฟังก์ชันฐานข้อมูลแบบ transaction + idempotent (ยืนยันซ้ำไม่สร้างซ้ำ)
      if (!input.isDraft) {
        const { error: confirmErr } = await db.rpc('film_confirm_order', { p_order_id: order.id });
        if (confirmErr) throw confirmErr;
      }

      await logEvent(order.id, null, 'create', null, input.isDraft ? 'draft' : 'queued',
        input.isDraft ? 'บันทึกฉบับร่าง' : 'ยืนยันและเข้าคิว');
      await load();
      return order as { id: string; order_no: string; internal_job_no: string | null };
    } catch (e: any) {
      toast.error(e?.message || 'บันทึกไม่สำเร็จ');
      return null;
    } finally { setBusy(false); }
  }, [load, logEvent]);

  /**
   * เปลี่ยนสถานะงานย่อย: กันกดซ้ำ, ตรวจฟิลด์ที่จำเป็น, optimistic update
   * และ rollback ทันทีเมื่อฐานข้อมูลผิดพลาด พร้อมบันทึกประวัติสถานะทุกครั้ง
   */
  const setJobStatus = useCallback(async (job: WorkJob, status: WorkStatus, note?: string) => {
    if (job.status === status) return false;
    if (inFlight.current.has(job.id)) return false;
    const miss = missingFieldsForStatus(job, status);
    if (miss.length) {
      toast.error(`ยังกรอกข้อมูลไม่ครบ: ${miss.join(', ')}`);
      return false;
    }
    inFlight.current.add(job.id);
    const prevStatus = job.status;
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status } : j)));
    try {
      const { error } = await db.from('film_order_jobs')
        .update({ status, done_at: status === 'done' ? new Date().toISOString() : null })
        .eq('id', job.id);
      if (error) {
        setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status: prevStatus } : j)));
        toast.error(`เปลี่ยนสถานะไม่สำเร็จ: ${error.message ?? ''}`.trim());
        return false;
      }
      await logEvent(job.orderId, job.id, 'status', prevStatus, status, note);
      refreshLineQueueCard();
      toast.success('เปลี่ยนสถานะแล้ว');
      void load();
      return true;
    } finally {
      inFlight.current.delete(job.id);
    }
  }, [load, logEvent]);

  /** แก้ไขข้อมูลงานย่อย (ชื่อ ขนาด จำนวน หมายเหตุ กำหนดส่ง ฝ่ายผลิต) */
  const updateJob = useCallback(async (job: WorkJob, patch: Partial<{
    title: string; size: string | null; quantity: number; unit: string | null;
    notes: string | null; dueAt: string | null; dept: string | null;
  }>) => {
    const before = jobs.find((j) => j.id === job.id) ?? job;
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, ...patch } as WorkJob : j)));
    const { error } = await db.from('film_order_jobs').update({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.size !== undefined ? { size: patch.size } : {}),
      ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
      ...(patch.unit !== undefined ? { unit: patch.unit } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.dept !== undefined ? { dept: patch.dept } : {}),
      ...(patch.dueAt !== undefined ? { due_at: patch.dueAt } : {}),
    }).eq('id', job.id);
    if (error) {
      setJobs((prev) => prev.map((j) => (j.id === job.id ? before : j)));
      toast.error('บันทึกการแก้ไขไม่สำเร็จ');
      return false;
    }
    await logEvent(job.orderId, job.id, 'edit', null, null, 'แก้ไขข้อมูลงาน');
    toast.success('บันทึกการแก้ไขแล้ว');
    void load();
    return true;
  }, [jobs, load, logEvent]);

  /** ประวัติสถานะของงานย่อย (จาก film_order_events) */
  // ประวัติอ่านตรงจากตารางเหตุการณ์ ไม่ต้องแคช
  const loadJobHistory = useCallback(async (jobId: string): Promise<JobHistoryRow[]> => {
    const { data } = await db.from('film_order_events')
      .select('id,action,from_status,to_status,note,created_at,created_by')
      .eq('order_job_id', jobId)
      .order('created_at', { ascending: false })
      .limit(100);
    return (data ?? []).map((r: any): JobHistoryRow => ({
      id: r.id, action: r.action, fromStatus: r.from_status, toStatus: r.to_status,
      note: r.note, createdAt: r.created_at, createdBy: r.created_by,
    }));
  }, []);

  /** แจ้งลูกค้าว่างานพร้อมรับ — บันทึกเหตุการณ์และอัปเดตออเดอร์เป็นพร้อมส่งมอบ */
  /** พนักงานกดรับงาน — ระบบไม่ข้ามขั้นเอง ต้องมีการกดรับจึงเข้าสู่กำลังผลิต */
  const acceptJob = useCallback(async (job: WorkJob, employeeId: string) => {
    const now = new Date().toISOString();
    const { error } = await db.from('film_order_jobs').update({
      assigned_employee_id: employeeId, assigned_at: now, accepted_at: now, status: 'producing',
    }).eq('id', job.id);
    if (error) { toast.error('รับงานไม่สำเร็จ'); return false; }
    refreshLineQueueCard();
    await logEvent(job.orderId, job.id, 'accept', job.status, 'producing', 'พนักงานกดรับงาน');
    toast.success('รับงานแล้ว');
    await load();
    return true;
  }, [load, logEvent]);

  /** หยุด/กลับมาทำต่อ — ต้องมีเหตุผลและบันทึก audit เสมอ */
  const pauseJob = useCallback(async (job: WorkJob, reason: string) => {
    if (!reason.trim()) { toast.error('ต้องระบุเหตุผลการหยุดงาน'); return false; }
    const { error } = await db.from('film_order_jobs')
      .update({ paused_at: new Date().toISOString(), pause_reason: reason.trim() }).eq('id', job.id);
    if (error) { toast.error('หยุดงานไม่สำเร็จ'); return false; }
    await logEvent(job.orderId, job.id, 'pause', job.status, job.status, reason.trim());
    await load();
    return true;
  }, [load, logEvent]);

  const resumeJob = useCallback(async (job: WorkJob) => {
    const { error } = await db.from('film_order_jobs')
      .update({ paused_at: null, pause_reason: null }).eq('id', job.id);
    if (error) { toast.error('กลับมาทำต่อไม่สำเร็จ'); return false; }
    await logEvent(job.orderId, job.id, 'resume', job.status, job.status, 'กลับมาทำต่อ');
    await load();
    return true;
  }, [load, logEvent]);

  /** เข้าคิวใหม่ — ออกเลขคิวใหม่ตามฝ่ายและคำนวณลำดับใหม่ */
  const requeueJob = useCallback(async (job: WorkJob, reason: string) => {
    const dept = job.dept ?? 'front';
    const { data: code } = await db.rpc('film_next_queue_code', { p_dept: dept });
    const { error } = await db.from('film_order_jobs').update({
      queue_code: code ?? job.queueCode,
      requeue_count: 0,
      status: 'new',
      accepted_at: null,
      priority_reason: reason || 'เข้าคิวใหม่',
    }).eq('id', job.id);
    if (error) { toast.error('เข้าคิวใหม่ไม่สำเร็จ'); return false; }
    refreshLineQueueCard();
    await logEvent(job.orderId, job.id, 'requeue', job.status, 'new', reason || 'เข้าคิวใหม่');
    toast.success('เข้าคิวใหม่แล้ว');
    await load();
    return true;
  }, [load, logEvent]);

  /** ย้ายฝ่าย — ออกเลขคิวใหม่ของฝ่ายปลายทางและบันทึกเหตุผล */
  const moveJobDept = useCallback(async (job: WorkJob, dept: string, reason: string) => {
    const { data: code } = await db.rpc('film_next_queue_code', { p_dept: dept });
    const { error } = await db.from('film_order_jobs')
      .update({ dept, queue_code: code ?? job.queueCode }).eq('id', job.id);
    if (error) { toast.error('ย้ายฝ่ายไม่สำเร็จ'); return false; }
    await logEvent(job.orderId, job.id, 'move_dept', job.dept, dept, reason || 'ย้ายฝ่าย');
    toast.success('ย้ายฝ่ายแล้ว');
    await load();
    return true;
  }, [load, logEvent]);

  const sendToOutsource = useCallback(async (job: WorkJob) => {
    if (inFlight.current.has(job.id)) return false;
    inFlight.current.add(job.id);
    const before = job;
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, isOutsourced: true, status: 'waiting_outsource' } : j)));
    try {
      const { error } = await db.from('film_order_jobs')
        .update({ is_outsourced: true, status: 'waiting_outsource' }).eq('id', job.id);
      if (error) {
        setJobs((prev) => prev.map((j) => (j.id === job.id ? before : j)));
        toast.error('ส่งงานเข้าคิวร้านใหญ่ไม่สำเร็จ');
        return false;
      }
      await logEvent(job.orderId, job.id, 'outsource', job.status, 'waiting_outsource', 'ตั้งเป็นงานส่งร้านใหญ่');
      toast.success('ย้ายเข้าคิวรอส่งร้านใหญ่แล้ว');
      void load();
      return true;
    } finally { inFlight.current.delete(job.id); }
  }, [load, logEvent]);

  const notifyReady = useCallback(async (orderId: string) => {
    const siblings = jobs.filter((j) => j.orderId === orderId);
    const reason = deliverBlockReason(siblings);
    if (reason) { toast.error(reason); return false; }
    const { error } = await db.from('film_orders').update({ status: 'ready' }).eq('id', orderId);
    if (error) { toast.error('อัปเดตออเดอร์ไม่สำเร็จ'); return false; }
    await db.from('film_order_jobs')
      .update({ status: 'ready' })
      .eq('order_id', orderId)
      .in('status', ['reviewing']);
    await logEvent(orderId, null, 'notify', null, 'ready', 'แจ้งลูกค้าว่างานพร้อมรับ');
    toast.success('แจ้งพร้อมรับและตั้งออเดอร์เป็นพร้อมส่งมอบแล้ว');
    await load();
    return true;
  }, [jobs, load, logEvent]);

  /** ปิดงานทั้งออเดอร์ (ส่งมอบเสร็จสิ้น) */
  const closeOrder = useCallback(async (orderId: string) => {
    const siblings = jobs.filter((j) => j.orderId === orderId);
    if (!canDeliverOrder(siblings)) { toast.error(deliverBlockReason(siblings) || 'ยังปิดงานไม่ได้'); return false; }
    const { error } = await db.from('film_orders').update({ status: 'completed' }).eq('id', orderId);
    if (error) { toast.error('ปิดงานไม่สำเร็จ'); return false; }
    await db.from('film_order_jobs')
      .update({ status: 'done', done_at: new Date().toISOString() })
      .eq('order_id', orderId)
      .neq('status', 'cancelled');
    await logEvent(orderId, null, 'status', null, 'done', 'ปิดงานและส่งมอบลูกค้า');
    toast.success('ปิดงานแล้ว');
    await load();
    return true;
  }, [jobs, load, logEvent]);

  /** ยืนยันฉบับร่างให้เข้าคิว — สร้างงานย่อยแยกฝ่ายจากรายการที่บันทึกไว้ */
  const confirmDraft = useCallback(async (draft: DraftOrder) => {
    setBusy(true);
    try {
      const { data: items } = await db.from('film_order_items')
        .select('*').eq('order_id', draft.id).order('sort_order');
      const rows = items ?? [];
      if (rows.length === 0) { toast.error('ฉบับร่างนี้ยังไม่มีรายการงาน'); return false; }
      // ยืนยันผ่านฟังก์ชันฐานข้อมูล — idempotent, ยืนยันซ้ำไม่สร้างงานซ้ำ
      const { error } = await db.rpc('film_confirm_order', { p_order_id: draft.id });
      if (error) throw error;
      await logEvent(draft.id, null, 'create', 'draft', 'queued', 'ยืนยันฉบับร่างเข้าคิว');
      await load();
      toast.success(`เข้าคิวแล้ว (${draft.internalJobNo ?? draft.orderNo})`);
      return true;
    } catch (e: any) {
      toast.error(e?.message || 'ยืนยันฉบับร่างไม่สำเร็จ');
      return false;
    } finally { setBusy(false); }
  }, [load, logEvent]);

  const deleteDraft = useCallback(async (draft: DraftOrder) => {
    const { error } = await db.from('film_orders').delete().eq('id', draft.id).eq('is_draft', true);
    if (error) { toast.error('ลบฉบับร่างไม่สำเร็จ'); return false; }
    await load();
    toast.success('ลบฉบับร่างแล้ว');
    return true;
  }, [load]);

  const assignJob = useCallback(async (job: WorkJob, employeeId: string | null) => {
    const { error } = await db.from('film_order_jobs').update({
      assigned_employee_id: employeeId,
      assigned_at: employeeId ? new Date().toISOString() : null,
    }).eq('id', job.id);
    if (error) { toast.error('มอบหมายงานไม่สำเร็จ'); return false; }
    await logEvent(job.orderId, job.id, 'assign', job.assignedEmployeeId, employeeId, 'มอบหมายผู้รับผิดชอบ');
    await load();
    return true;
  }, [load, logEvent]);

  /** สร้างใบสั่งผลิตร้านใหญ่จากงานย่อยที่เลือก */
  const createOutsourceOrder = useCallback(async (
    supplierId: string, jobIds: string[], opts: { dueAt?: string; note?: string; material?: string; finishing?: string },
  ) => {
    setBusy(true);
    try {
      const picked = jobs.filter((j) => jobIds.includes(j.id));
      if (picked.length === 0) { toast.error('ยังไม่ได้เลือกงาน'); return null; }
      const { data: auth } = await db.auth.getUser();
      const { data: woNo } = await db.rpc('film_next_outsource_no');
      const totalCost = picked.reduce((s, j) => s + j.costPrice * j.quantity, 0);
      const { data: wo, error } = await db.from('film_outsource_orders').insert({
        wo_no: woNo || `WO-${Date.now().toString().slice(-8)}`,
        supplier_id: supplierId,
        order_id: picked[0].orderId,
        status: 'pending',
        due_at: opts.dueAt ? new Date(opts.dueAt).toISOString() : null,
        note: opts.note || null,
        total_cost: totalCost,
        created_by: auth?.user?.id ?? null,
      }).select('id, wo_no').single();
      if (error || !wo) throw error ?? new Error('สร้างใบสั่งผลิตไม่สำเร็จ');

      for (const j of picked) {
        await db.from('film_outsource_items').insert({
          outsource_id: wo.id, job_id: j.id, title: j.title, size: j.size,
          quantity: j.quantity, unit: j.unit, material: opts.material || null,
          finishing: opts.finishing || null, cost_price: j.costPrice, note: j.notes,
          attachments: j.attachments,
        });
        await db.from('film_order_jobs')
          .update({ outsource_id: wo.id, is_outsourced: true, status: 'waiting_outsource' })
          .eq('id', j.id);
        await logEvent(j.orderId, j.id, 'outsource', j.status, 'waiting_outsource', `ส่งร้านใหญ่ ${wo.wo_no}`);
      }
      await load();
      toast.success(`สร้างใบสั่งผลิต ${wo.wo_no} แล้ว`);
      return wo.id as string;
    } catch (e: any) {
      toast.error(e?.message || 'สร้างใบสั่งผลิตไม่สำเร็จ');
      return null;
    } finally { setBusy(false); }
  }, [jobs, load, logEvent]);

  const setOutsourceStatus = useCallback(async (wo: OutsourceOrder, status: OutsourceStatus) => {
    const patch: Record<string, unknown> = { status };
    if (status === 'sent') patch.sent_at = new Date().toISOString();
    if (status === 'received') patch.received_at = new Date().toISOString();
    const { error } = await db.from('film_outsource_orders').update(patch).eq('id', wo.id);
    if (error) { toast.error('อัปเดตสถานะไม่สำเร็จ'); return false; }
    const jobStatus = jobStatusForOutsource(status);
    if (jobStatus) {
      const ids = wo.items.map((i) => i.jobId).filter(Boolean) as string[];
      if (ids.length) await db.from('film_order_jobs').update({ status: jobStatus }).in('id', ids);
      for (const j of jobs.filter((x) => ids.includes(x.id))) {
        await logEvent(j.orderId, j.id, 'outsource', j.status, jobStatus, `ใบสั่งผลิต ${wo.woNo}: ${status}`);
      }
    }
    await load();
    return true;
  }, [jobs, load, logEvent]);

  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const active = jobs.filter((j) => j.status !== 'done' && j.status !== 'cancelled');
    return {
      newToday: jobs.filter((j) => j.status === 'new').length,
      orderReview: jobs.filter((j) => j.status === 'order_review').length,
      designQueue: jobs.filter((j) => j.status === 'design_queue').length,
      urgent: active.filter((j) => j.isUrgent).length,
      dueSoon: active.filter((j) => {
        if (!j.dueAt) return false;
        const diff = new Date(j.dueAt).getTime() - Date.now();
        return diff <= 24 * 60 * 60 * 1000;
      }).length,
      problem: active.filter((j) => j.status === 'waiting_info' || j.status === 'waiting_approval').length,
      atSupplier: active.filter((j) => j.isOutsourced && j.status !== 'ready').length,
      ready: jobs.filter((j) => j.status === 'ready').length,
    };
  }, [jobs]);

  return {
    jobs, employees, suppliers, outsource, drafts, loading, busy, stats,
    liveStatus, lastSyncAt, newJobIds, changedJobIds,
    newJobCount: newJobIds.length, changedJobCount: changedJobIds.length, markSeen,
    reload: load, createIntake, confirmDraft, deleteDraft,
    setJobStatus, assignJob, createOutsourceOrder, setOutsourceStatus,
    updateJob, loadJobHistory, notifyReady, closeOrder, sendToOutsource,
    acceptJob, pauseJob, resumeJob, requeueJob, moveJobDept,
  };
}