// ระบบอัตโนมัติของศูนย์รันคิวงาน: ประเมินกฎแจ้งเตือน → สร้าง in-app notification (ฝั่งเซิร์ฟเวอร์เท่านั้น)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Sev = 'info' | 'watch' | 'urgent' | 'critical';

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Cron/internal caller proof — token stored in DB, readable only by service_role. */
async function hasWorkerToken(req: Request): Promise<boolean> {
  const presented = req.headers.get('x-worker-token') || '';
  if (!presented) return false;
  const { data } = await admin
    .from('internal_worker_tokens')
    .select('token,name')
    .in('name', ['film_queue_automation', 'notify_dispatch']);
  for (const row of (data ?? []) as { token?: string }[]) {
    const expected = String(row?.token || '');
    if (!expected || expected.length !== presented.length) continue;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ presented.charCodeAt(i);
    if (diff === 0) return true;
  }
  return false;
}

/** Signed-in owner/admin caller (the Control Room button). */
async function isAdminCaller(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  const supa = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: auth } } },
  );
  const { data: claims, error } = await supa.auth.getClaims(auth.replace('Bearer ', ''));
  const uid = claims?.claims?.sub as string | undefined;
  if (error || !uid) return false;
  const { data } = await admin.from('user_roles').select('role').eq('user_id', uid);
  return (data ?? []).some((r: { role?: string }) => r.role === 'owner' || r.role === 'admin');
}

/** provider abstraction — วันนี้ใช้ in-app อย่างเดียว, LINE ต่อทีหลังฝั่งเซิร์ฟเวอร์ */
const providers = {
  in_app: async (p: Record<string, unknown>) => {
    const { error } = await admin.rpc('film_raise_ops_notification', p);
    if (error) throw new Error(error.message);
  },
};

async function raise(
  kind: string, severity: Sev, title: string, body: string,
  opts: { orderId?: string | null; jobId?: string | null; dept?: string | null; cooldown?: number } = {},
) {
  await providers.in_app({
    p_kind: kind, p_severity: severity, p_title: title, p_body: body,
    p_order_id: opts.orderId ?? null, p_job_id: opts.jobId ?? null, p_dept: opts.dept ?? null,
    p_assignee: null, p_dedup_key: null, p_cooldown_minutes: opts.cooldown ?? 120,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  // Auth: cron worker token OR signed-in owner/admin. Never anonymous.
  if (!(await hasWorkerToken(req)) && !(await isAdminCaller(req))) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  const startedKey = `automation:${new Date().toISOString().slice(0, 16)}`;
  let created = 0;

  try {
    const { data: settings } = await admin.from('film_queue_settings').select('*').eq('id', 'default').maybeSingle();
    const warnMin = settings?.warn_before_minutes ?? 120;
    const staleHours = settings?.stale_hours ?? 12;
    const escalateMin = settings?.escalate_after_minutes ?? 60;
    const outsourceLate = settings?.outsource_late_hours ?? 24;
    const requireDeposit = !!settings?.require_deposit_before_production;

    const { data: jobs, error } = await admin
      .from('film_order_jobs')
      .select('id,order_id,job_no,queue_code,title,status,dept,due_at,assigned_employee_id,attachments,updated_at,qc_status,is_outsourced,film_orders(order_no,customer_name,deposit,total,is_urgent)')
      .not('status', 'in', '("done","cancelled")');
    if (error) throw new Error(error.message);

    const now = Date.now();
    for (const j of jobs ?? []) {
      const o = (j as Record<string, any>).film_orders ?? {};
      const label = `${j.queue_code ?? j.job_no ?? ''} ${j.title ?? ''} · ${o.customer_name ?? '-'}`.trim();
      const due = j.due_at ? new Date(j.due_at).getTime() : null;
      const stale = (now - new Date(j.updated_at as string).getTime()) / 3600000;

      if (!j.assigned_employee_id && j.status === 'new') {
        await raise('unassigned', 'watch', 'งานใหม่ยังไม่มีผู้รับผิดชอบ', label, { orderId: j.order_id, jobId: j.id, dept: j.dept });
        created++;
      }
      if (j.status === 'waiting_info' || !(Array.isArray(j.attachments) && j.attachments.length)) {
        if (j.status === 'waiting_info') {
          await raise('missing_info', 'urgent', 'ข้อมูล/ไฟล์งานไม่ครบ', label, { orderId: j.order_id, jobId: j.id, dept: j.dept });
          created++;
        }
      }
      if (due && due < now) {
        await raise('overdue', 'critical', 'งานเลยกำหนดส่ง', label, { orderId: j.order_id, jobId: j.id, dept: j.dept, cooldown: 180 });
        created++;
      } else if (due && due - now < warnMin * 60000) {
        await raise('sla_soon', 'urgent', 'ใกล้ครบกำหนด (SLA)', label, { orderId: j.order_id, jobId: j.id, dept: j.dept });
        created++;
      }
      if (stale > staleHours) {
        await raise('stalled', 'watch', `งานหยุดนิ่งเกิน ${staleHours} ชั่วโมง`, label, { orderId: j.order_id, jobId: j.id, dept: j.dept });
        created++;
      }
      if (j.is_outsourced && j.status === 'waiting_outsource' && stale > outsourceLate) {
        await raise('outsource_late', 'urgent', 'ร้านใหญ่ส่งงานคืนช้า', label, { orderId: j.order_id, jobId: j.id, dept: 'outsource' });
        created++;
      }
      if (j.qc_status === 'fail') {
        await raise('qc_fail', 'critical', 'งานไม่ผ่าน QC', label, { orderId: j.order_id, jobId: j.id, dept: j.dept });
        created++;
      }
      if (requireDeposit && j.status === 'producing' && Number(o.deposit ?? 0) <= 0) {
        await raise('deposit_missing', 'urgent', 'เริ่มผลิตโดยยังไม่ได้รับมัดจำ', label, { orderId: j.order_id, jobId: j.id, dept: j.dept });
        created++;
      }
    }

    // escalation: แจ้งเตือนที่ยังไม่ acknowledge เกินเวลา → ยกระดับ
    const cutoff = new Date(now - escalateMin * 60000).toISOString();
    const { data: escalated } = await admin
      .from('film_ops_notifications')
      .update({ severity: 'critical', escalated_at: new Date().toISOString() })
      .eq('status', 'new')
      .is('escalated_at', null)
      .in('severity', ['watch', 'urgent'])
      .lt('created_at', cutoff)
      .select('id');

    await admin.from('film_automation_runs').insert({
      kind: 'notify_scan', idempotency_key: startedKey, status: 'ok', finished_at: new Date().toISOString(),
      result: { scanned: jobs?.length ?? 0, raised: created, escalated: escalated?.length ?? 0 },
    });

    return new Response(JSON.stringify({ ok: true, scanned: jobs?.length ?? 0, raised: created, escalated: escalated?.length ?? 0 }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.from('film_automation_runs').insert({
      kind: 'notify_scan', idempotency_key: `${startedKey}:err`, status: 'failed', error: message, finished_at: new Date().toISOString(),
    });
    return new Response(JSON.stringify({ ok: false, error: message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
