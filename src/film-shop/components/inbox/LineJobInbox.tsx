import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/film-shop/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Inbox, Loader2, CheckCircle2, XCircle, Copy, ExternalLink, AlertTriangle, Clock, MessageSquareText } from 'lucide-react';
import { useFilmOrders } from '@/film-shop/hooks/useFilmOrders';
import { formatBkk } from '@/film-shop/lib/queueScheduler';
import { buildDraftReply } from '@/film-shop/lib/lineJobParser';
import type { OrderChannel } from '@/film-shop/types/order';
import { useLineProfiles } from '@/film-shop/hooks/useLineProfiles';
import { CustomerAvatar } from '@/film-shop/components/common/CustomerAvatar';

const db = supabase as any;

type IntakeStatus = 'needs_review' | 'ready' | 'created' | 'not_a_job';

const TAB_LABELS: Record<IntakeStatus, string> = {
  needs_review: 'รอตรวจข้อมูล',
  ready: 'พร้อมสร้างออเดอร์',
  created: 'สร้างแล้ว',
  not_a_job: 'ไม่ใช่งาน',
};

interface RequestRow {
  id: string;
  intake_status: IntakeStatus;
  received_at: string | null;
  created_at: string;
  customer_name: string | null;
  title: string | null;
  job_type: string | null;
  quantity: number | null;
  size_text: string | null;
  has_design: boolean | null;
  is_urgent: boolean | null;
  requested_due_at: string | null;
  notes: string | null;
  raw_text: string | null;
  description: string | null;
  missing_fields: string[] | null;
  draft_reply: string | null;
  linked_order_id: string | null;
  line_display_name: string | null;
  line_user_id: string | null;
  parsed: { channel_id?: string | null } | null;
}

interface EditState {
  row: RequestRow;
  customerName: string;
  title: string;
  jobType: string;
  quantity: string;
  sizeText: string;
  hasDesign: boolean;
  isUrgent: boolean;
  dueAt: string;
  notes: string;
}

/** datetime-local value ⇄ ISO, using the browser's local (shop) time. */
function toLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface Props {
  onOpenOrder?: (orderId: string) => void;
  /** 'all' | 'default' | 'shop2' — กรองตามร้านที่ลูกค้าทักเข้ามา */
  shopFilter?: string;
  /** ชื่อร้านจริงจากฐานข้อมูล (store id → display_name) */
  storeNames?: Record<string, string>;
}

const shopIdOf = (r: RequestRow) => String(r.parsed?.channel_id ?? 'default');

/** กล่องงานจาก LINE — ตรวจ ยืนยัน หรือปิดคำขอที่เข้ามาทาง LINE OA */
export function LineJobInbox({ onOpenOrder, shopFilter = 'all', storeNames = {} }: Props) {
  const shopLabelOf = (id: string) => storeNames[id] || id;
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<IntakeStatus>('needs_review');
  const [edit, setEdit] = useState<EditState | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { createOrder } = useFilmOrders();

  const load = useCallback(async () => {
    const { data } = await db
      .from('film_job_requests')
      .select('*')
      .eq('source', 'line')
      .order('received_at', { ascending: false })
      .limit(200);
    setRows((data ?? []) as RequestRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = db
      .channel(`film-line-inbox-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'film_job_requests' }, () => load())
      .subscribe();
    return () => { db.removeChannel(ch); };
  }, [load]);

  const scoped = useMemo(
    () => (shopFilter === 'all' ? rows : rows.filter((r) => shopIdOf(r) === shopFilter)),
    [rows, shopFilter],
  );

  const counts = useMemo(() => {
    const c: Record<IntakeStatus, number> = { needs_review: 0, ready: 0, created: 0, not_a_job: 0 };
    for (const r of scoped) if (c[r.intake_status] !== undefined) c[r.intake_status]++;
    return c;
  }, [scoped]);

  const visible = scoped.filter((r) => r.intake_status === tab);
  const active = visible.find((r) => r.id === selectedId) ?? visible[0] ?? null;
  const lineProfiles = useLineProfiles(visible.map((r) => r.line_user_id));
  /** ชื่อจริงจากโปรไฟล์ LINE มาก่อนเสมอ — ชื่อทั่วไปอย่าง "ลูกค้า LINE" ใช้เป็นตัวสำรองสุดท้าย */
  const GENERIC_NAMES = ['ลูกค้า line', 'ลูกค้า', 'งานจาก line', ''];
  const isGeneric = (v?: string | null) => GENERIC_NAMES.includes((v ?? '').trim().toLowerCase());
  const nameOf = (r: RequestRow) => {
    const fromProfile = r.line_user_id ? lineProfiles[r.line_user_id]?.displayName : null;
    const candidates = [fromProfile, r.line_display_name, r.customer_name];
    return candidates.find((v) => v && !isGeneric(v))?.trim() || r.customer_name || 'ลูกค้า LINE';
  };
  const pictureOf = (r: RequestRow) => (r.line_user_id ? lineProfiles[r.line_user_id]?.pictureUrl : null);
  /** หน้าตอบกลับลูกค้า (LINE OA inbox) — เปิดห้องแชทของลูกค้าคนนี้โดยตรง */
  const replyHref = (r: RequestRow) =>
    r.line_user_id ? `/admin/inbox?u=${encodeURIComponent(r.line_user_id)}` : '/admin/inbox';
  const mobileDetail = !!selectedId && !!active;

  const openEdit = (row: RequestRow) => setEdit({
    row,
    customerName: row.customer_name ?? '',
    title: row.title ?? '',
    jobType: row.job_type ?? 'other',
    quantity: row.quantity != null ? String(row.quantity) : '',
    sizeText: row.size_text ?? '',
    hasDesign: !!row.has_design,
    isUrgent: !!row.is_urgent,
    dueAt: toLocalInput(row.requested_due_at),
    notes: row.notes ?? '',
  });

  const markNotJob = async (row: RequestRow) => {
    await db.from('film_job_requests').update({ intake_status: 'not_a_job' }).eq('id', row.id);
    toast.success('ทำเครื่องหมายว่าไม่ใช่งานแล้ว');
    load();
  };

  const confirmCreate = async () => {
    if (!edit) return;
    const missing: string[] = [];
    if (!edit.customerName.trim()) missing.push('ชื่อลูกค้า');
    if (!edit.title.trim()) missing.push('หัวข้องาน');
    if (!edit.quantity.trim()) missing.push('จำนวน');
    if (!edit.dueAt) missing.push('วันและเวลานัดรับ');
    if (missing.length) { toast.error(`ยังขาด: ${missing.join(', ')}`); return; }

    setBusy(true);
    try {
      const due = new Date(edit.dueAt);
      const order = await createOrder({
        customerName: edit.customerName.trim(),
        channel: 'line' as OrderChannel,
        title: edit.title.trim(),
        dueAt: due,
        isUrgent: edit.isUrgent,
        hasDesign: edit.hasDesign,
        paymentStatus: 'unpaid',
        deposit: 0,
        discount: 0,
        notes: edit.notes || undefined,
        sourceJobRequestId: edit.row.id,
        items: [{
          description: [edit.title.trim(), edit.sizeText].filter(Boolean).join(' '),
          quantity: Number(edit.quantity) || 1,
          unit: 'ชิ้น',
          unitPrice: 0,
        }],
      });
      if (!order) return;

      await db.from('film_order_events').insert({
        order_id: order.id,
        to_status: order.status,
        note: [
          `ยืนยันจากคำขอ LINE (รับเมื่อ ${formatBkk(edit.row.received_at ?? edit.row.created_at)})`,
          '',
          'ข้อความต้นฉบับ:',
          (edit.row.raw_text || edit.row.description || '').slice(0, 1500),
        ].join('\n'),
      });

      await db.from('film_job_requests').update({
        intake_status: 'created',
        linked_order_id: order.id,
        customer_name: edit.customerName.trim(),
        title: edit.title.trim(),
        job_type: edit.jobType,
        quantity: Number(edit.quantity) || 1,
        size_text: edit.sizeText || null,
        has_design: edit.hasDesign,
        is_urgent: edit.isUrgent,
        requested_due_at: due.toISOString(),
        notes: edit.notes || null,
        missing_fields: [],
        draft_reply: buildDraftReply({ orderNo: order.orderNo, finishAtText: formatBkk(due) }),
      }).eq('id', edit.row.id);

      toast.success(`สร้างออเดอร์ ${order.orderNo} แล้ว`);
      setEdit(null);
      load();
    } finally {
      setBusy(false);
    }
  };

  const copyDraft = async (row: RequestRow) => {
    const text = row.draft_reply || buildDraftReply({ missing: row.missing_fields ?? [] });
    try {
      await navigator.clipboard.writeText(text);
      toast.success('คัดลอกข้อความตอบกลับแล้ว (ส่งเองใน LINE)');
    } catch {
      toast.error('คัดลอกไม่สำเร็จ');
    }
  };

  const detail = (r: RequestRow) => (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <CustomerAvatar name={nameOf(r)} pictureUrl={pictureOf(r)} className="h-8 w-8" />
        <span className="text-sm font-semibold">{nameOf(r)}</span>
        <Badge variant="outline" className="text-[10px]">{shopLabelOf(shopIdOf(r))}</Badge>
        {r.is_urgent && <Badge className="bg-warning text-[10px] text-warning-foreground hover:bg-warning">ด่วน</Badge>}
        {r.job_type && <Badge variant="outline" className="text-[10px]">{r.job_type}</Badge>}
      </div>
      <p className="text-sm font-medium">{r.title || '(ไม่มีหัวข้อ)'}</p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> รับงานเมื่อ {formatBkk(r.received_at ?? r.created_at)}</span>
        {r.requested_due_at && <span>นัดรับ {formatBkk(r.requested_due_at)}</span>}
        {r.quantity != null && <span>จำนวน {r.quantity}</span>}
        {r.size_text && <span>ขนาด {r.size_text}</span>}
      </p>
      {(r.missing_fields?.length ?? 0) > 0 && (
        <p className="flex items-start gap-1.5 rounded-xl border border-warning/40 bg-warning/10 p-2 text-[11px] text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ข้อมูลที่ยังขาด: {r.missing_fields!.join(', ')}
        </p>
      )}
      <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap rounded-xl bg-muted p-2.5 text-[11px]">
        {r.raw_text || r.description || '(ว่าง)'}
      </pre>
      <div className="flex flex-wrap gap-1.5">
        {r.intake_status !== 'created' && (
          <Button size="sm" className="min-h-11 rounded-xl" onClick={() => openEdit(r)}>
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> สร้างออเดอร์
          </Button>
        )}
        {r.linked_order_id && onOpenOrder && (
          <Button size="sm" variant="outline" className="min-h-11 rounded-xl" onClick={() => onOpenOrder(r.linked_order_id!)}>
            <ExternalLink className="mr-1 h-3.5 w-3.5" /> เปิดออเดอร์
          </Button>
        )}
        <Button size="sm" variant="outline" className="min-h-11 rounded-xl" onClick={() => copyDraft(r)}>
          <Copy className="mr-1 h-3.5 w-3.5" /> คัดลอกข้อความตอบกลับ
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="min-h-11 rounded-xl border-primary/50 text-primary hover:bg-primary/5"
          data-testid="reply-customer-line"
          onClick={() => window.open(replyHref(r), '_blank', 'noopener')}
        >
          <MessageSquareText className="mr-1 h-3.5 w-3.5" /> ตอบลูกค้าใน LINE OA
        </Button>
        {r.intake_status !== 'not_a_job' && r.intake_status !== 'created' && (
          <Button size="sm" variant="ghost" className="min-h-11 rounded-xl" onClick={() => markNotJob(r)}>
            <XCircle className="mr-1 h-3.5 w-3.5" /> ไม่ใช่งาน
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="animate-fade-in space-y-3" data-testid="line-job-inbox">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Inbox className="h-4 w-4 text-primary" /> กล่องงานจาก LINE
        </h2>
        <p className="text-[11px] text-muted-foreground">ระบบไม่ตอบกลับลูกค้าเอง — ข้อความตอบกลับเป็นแบบร่างให้คัดลอกส่งเอง</p>
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="สถานะคำขอ">
        {(Object.keys(TAB_LABELS) as IntakeStatus[]).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => { setTab(k); setSelectedId(null); }}
            className={
              'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ' +
              (tab === k
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:text-foreground')
            }
          >
            {TAB_LABELS[k]} {counts[k]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">ไม่มีรายการในหมวดนี้</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
          {/* List pane */}
          <div className={(mobileDetail ? 'hidden ' : '') + 'space-y-1.5 lg:block'}>
            {visible.map((r) => {
              const isActive = active?.id === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  aria-current={isActive ? 'true' : undefined}
                  className={
                    'w-full rounded-xl border p-2.5 text-left transition-colors duration-150 ' +
                    (isActive ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/60')
                  }
                >
                  <div className="flex items-start gap-2">
                    <CustomerAvatar name={nameOf(r)} pictureUrl={pictureOf(r)} className="h-9 w-9" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{nameOf(r)}</span>
                        {r.is_urgent && <Badge className="bg-warning text-[10px] text-warning-foreground hover:bg-warning">ด่วน</Badge>}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{r.title || '(ไม่มีหัวข้อ)'}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {shopLabelOf(shopIdOf(r))} · {formatBkk(r.received_at ?? r.created_at)}
                      </p>
                      {(r.missing_fields?.length ?? 0) > 0 && (
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-warning">
                          <AlertTriangle className="h-3 w-3" /> ข้อมูลไม่ครบ
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detail pane */}
          <div className={(mobileDetail ? '' : 'hidden ') + 'rounded-2xl border border-border bg-card p-3 lg:block'}>
            {mobileDetail && (
              <Button variant="ghost" className="-ml-2 mb-2 min-h-11 lg:hidden" onClick={() => setSelectedId(null)}>
                ← กลับไปที่รายการ
              </Button>
            )}
            {active ? detail(active) : <p className="py-10 text-center text-sm text-muted-foreground">เลือกคำขอทางซ้ายเพื่อดูรายละเอียด</p>}
          </div>
        </div>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => { if (!o) setEdit(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>ตรวจข้อมูลก่อนสร้างออเดอร์</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div>
                <Label>ชื่อลูกค้า</Label>
                <Input value={edit.customerName} onChange={(e) => setEdit({ ...edit, customerName: e.target.value })} />
              </div>
              <div>
                <Label>หัวข้องาน</Label>
                <Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>ประเภทงาน</Label>
                  <Input value={edit.jobType} onChange={(e) => setEdit({ ...edit, jobType: e.target.value })} />
                </div>
                <div>
                  <Label>จำนวน</Label>
                  <Input type="number" min={1} value={edit.quantity} onChange={(e) => setEdit({ ...edit, quantity: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>ขนาด</Label>
                <Input value={edit.sizeText} onChange={(e) => setEdit({ ...edit, sizeText: e.target.value })} />
              </div>
              <div>
                <Label>วันและเวลานัดรับ</Label>
                <Input type="datetime-local" value={edit.dueAt} onChange={(e) => setEdit({ ...edit, dueAt: e.target.value })} />
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch id="ji-design" checked={edit.hasDesign} onCheckedChange={(v) => setEdit({ ...edit, hasDesign: v })} />
                  <Label htmlFor="ji-design">มีไฟล์แบบแล้ว</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="ji-urgent" checked={edit.isUrgent} onCheckedChange={(v) => setEdit({ ...edit, isUrgent: v })} />
                  <Label htmlFor="ji-urgent">งานด่วน</Label>
                </div>
              </div>
              <div>
                <Label>หมายเหตุ</Label>
                <Textarea rows={2} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>ยกเลิก</Button>
            <Button onClick={confirmCreate} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} ยืนยันสร้างออเดอร์
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default LineJobInbox;
