import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { Ban, FileText, Loader2, Trash2, Wallet, Receipt, Undo2, Paperclip, MessageSquareText, Users } from 'lucide-react';
import { openOrderChat } from '@/film-shop/lib/filmNav';
import { openAdminGroupChat } from '@/film-shop/lib/adminGroupChat';
import { useFilmStoreScope } from '@/film-shop/hooks/useFilmStoreScope';
import { toast } from 'sonner';
import { useAppData } from '@/film-shop/hooks/useAppData';
import { OrderStatusBadge } from './OrderStatusBadge';
import { OrderNotifyStatusCard } from './OrderNotifyStatusCard';
import { useJobSchedule } from '@/film-shop/hooks/useJobSchedule';
import { formatBkk } from '@/film-shop/lib/queueScheduler';
import {
  ORDER_CHANNEL_LABELS,
  ORDER_PAYMENT_LABELS,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  nextOrderStatus,
  type FilmOrder,
  type FilmOrderEvent,
  type OrderStatus,
} from '@/film-shop/types/order';
import { useOrderPayments } from '@/film-shop/hooks/useOrderPayments';
import { PaymentDialog } from './PaymentDialog';
import {
  PAYMENT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  outstanding,
} from '@/film-shop/lib/filmPayments';
import {
  ORDER_DOC_LABELS,
  buildDocumentFromOrder,
  linkDocumentToOrder,
  type OrderDocType,
} from '@/film-shop/lib/orderDocuments';

const money = (n: number) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
const dt = (d?: Date) => (d ? new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

interface Props {
  order: FilmOrder | null;
  onOpenChange: (open: boolean) => void;
  onStatusChange: (order: FilmOrder, to: OrderStatus) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  /** ยกเลิกออเดอร์ (เก็บประวัติไว้) */
  onCancel?: (order: FilmOrder, reason?: string) => Promise<void> | void;
  /** ตรวจว่าลบได้ปลอดภัยไหมก่อนยืนยัน */
  checkDeletable?: (id: string) => Promise<{ ok: boolean; blockers: string[] }>;
  fetchEvents: (orderId: string) => Promise<FilmOrderEvent[]>;
  onOpenDocument?: (invoiceId: string) => void;
}

export function OrderDetailDialog({ order, onOpenChange, onStatusChange, onDelete, onCancel, checkDeletable, fetchEvents, onOpenDocument }: Props) {
  const { addInvoice, generateInvoiceNumber } = useAppData();
  const { isOwner, isAdmin } = useAuth();
  const canManage = !!(isOwner || isAdmin);
  const { storeId } = useFilmStoreScope();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [blockers, setBlockers] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [groupSending, setGroupSending] = useState(false);
  const [events, setEvents] = useState<FilmOrderEvent[]>([]);
  const [creating, setCreating] = useState<OrderDocType | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const { payments, receivePayment, voidPayment } = useOrderPayments(order?.id);

  useEffect(() => {
    if (!order) { setEvents([]); return; }
    let alive = true;
    fetchEvents(order.id).then((rows) => { if (alive) setEvents(rows); });
    return () => { alive = false; };
  }, [order, fetchEvents]);

  if (!order) return null;
  const next = nextOrderStatus(order.status);
  const due = outstanding(order, payments);
  const paid = Math.max(0, order.total - due);

  const createDoc = async (docType: OrderDocType) => {
    if (order.items.length === 0) {
      toast.error('ออเดอร์นี้ยังไม่มีรายการงาน');
      return;
    }
    setCreating(docType);
    const number = generateInvoiceNumber(docType === 'invoice' ? 'invoice' : 'job_order');
    const payload = buildDocumentFromOrder(order, docType, number);
    const created = await addInvoice(payload as never);
    setCreating(null);
    if (!created?.id) return;
    await linkDocumentToOrder(order.id, created.id, docType);
    toast.success(`สร้าง${ORDER_DOC_LABELS[docType]} ${created.invoiceNumber} แล้ว`);
    onOpenDocument?.(created.id);
  };

  return (
    <Sheet open={!!order} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto pb-28 sm:max-w-xl">
        <SheetHeader className="text-left">
          <SheetTitle className="flex flex-wrap items-center gap-2">
            <span>{order.orderNo}</span>
            <OrderStatusBadge status={order.status} />
            {order.isUrgent && <Badge className="bg-warning text-warning-foreground hover:bg-warning">ด่วน</Badge>}
            {order.isDraft && <Badge variant="outline" className="border-warning text-warning">ร่าง</Badge>}
          </SheetTitle>
        </SheetHeader>

        <Button
          type="button" variant="outline"
          className="mt-3 h-11 w-full gap-2 rounded-xl"
          data-testid="order-open-chat"
          onClick={() => {
            openOrderChat({
              customerId: order.customerId ?? null,
              orderId: order.id,
              orderNo: order.orderNo,
              orderTitle: order.title,
            });
            onOpenChange(false);
          }}
        >
          <MessageSquareText className="h-4 w-4" /> คุยกับลูกค้าในกล่องข้อความ
        </Button>

        <Button
          type="button" variant="outline"
          className="mt-2 h-11 w-full gap-2 rounded-xl"
          data-testid="order-open-admin-group"
          disabled={groupSending}
          onClick={async () => {
            setGroupSending(true);
            const res = await openAdminGroupChat({
              orderId: order.id,
              orderNo: order.orderNo,
              title: order.title,
              customerName: order.customerName,
              customerPhone: order.customerPhone,
              total: order.total,
              storeId,
            });
            setGroupSending(false);
            if (!res.ok) {
              toast.error(res.reason === 'no_group'
                ? 'ยังไม่ได้เชื่อมกลุ่มแอดมินของร้านนี้ — พิมพ์ “เชื่อมห้องแอดมิน” ในกลุ่ม LINE'
                : 'ส่งเข้ากลุ่มแอดมินไม่สำเร็จ');
              return;
            }
            toast.success(`ส่งบริบทออเดอร์เข้ากลุ่ม${res.groupName ? ` “${res.groupName}”` : 'แอดมิน'} แล้ว`);
          }}
        >
          {groupSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />} เปิดแชทกลุ่มแอดมินของร้านนี้
        </Button>

        <div className="mt-4 space-y-4 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <div><span className="text-muted-foreground">ลูกค้า: </span>{order.customerName}</div>
            <div><span className="text-muted-foreground">เบอร์โทร: </span>{order.customerPhone || '—'}</div>
            <div><span className="text-muted-foreground">หน่วยงาน: </span>{order.orgName || '—'}</div>
            <div><span className="text-muted-foreground">ผู้รับผิดชอบ: </span>{order.assignee || '—'}</div>
            <div><span className="text-muted-foreground">ช่องทาง: </span>{ORDER_CHANNEL_LABELS[order.channel] ?? order.channel}</div>
            <div><span className="text-muted-foreground">กำหนดรับ: </span>{dt(order.dueAt)}</div>
            <div><span className="text-muted-foreground">งาน: </span>{order.title || '—'}</div>
            <div><span className="text-muted-foreground">การชำระ: </span>{ORDER_PAYMENT_LABELS[order.paymentStatus]}</div>
          </div>

          <ScheduleSummary orderId={order.id} receivedAt={order.createdAt} dueAt={order.dueAt} />

          <OrderNotifyStatusCard orderId={order.id} />

          <Separator />

          <div className="space-y-1">
            {order.items.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-3">
                <span className="truncate">{i.description} × {i.quantity} {i.unit}</span>
                <span className="tabular-nums">{money(i.total)}</span>
              </div>
            ))}
            {order.items.length === 0 && <p className="text-muted-foreground">ยังไม่มีรายการงาน</p>}
            {order.vatAmount > 0 && (
              <div className="flex items-center justify-between text-muted-foreground">
                <span>ภาษีมูลค่าเพิ่ม {order.vatRate}%</span>
                <span className="tabular-nums">{money(order.vatAmount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-2 font-semibold">
              <span>ยอดสุทธิ</span>
              <span className="tabular-nums">{money(order.total)} บาท</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>ชำระแล้ว</span><span className="tabular-nums" data-testid="order-paid">{money(paid)} บาท</span>
            </div>
            <div className="flex items-center justify-between font-medium">
              <span>คงเหลือ</span><span className="tabular-nums" data-testid="order-balance">{money(due)} บาท</span>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="font-medium">การรับเงิน</p>
              <Button size="sm" className="min-h-11 rounded-xl" disabled={due <= 0} onClick={() => setPayOpen(true)}>
                <Wallet className="mr-1 h-4 w-4" /> {due <= 0 ? 'ชำระครบแล้ว' : 'รับเงิน'}
              </Button>
            </div>
            {payments.length === 0 && <p className="text-xs text-muted-foreground">ยังไม่มีการรับเงิน</p>}
            {payments.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className={p.voidedAt ? 'line-through text-muted-foreground' : ''}>
                  {PAYMENT_KIND_LABELS[p.kind]} · {PAYMENT_METHOD_LABELS[p.method]} · {dt(p.paidAt)}
                  {p.receivedBy ? ` · ${p.receivedBy}` : ''}
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">{money(p.amount)}</span>
                  {p.receiptInvoiceId && (
                    <Button variant="ghost" size="sm" className="h-8 px-2"
                      onClick={() => onOpenDocument?.(p.receiptInvoiceId!)}>
                      <Receipt className="mr-1 h-3.5 w-3.5" /> ใบเสร็จ
                    </Button>
                  )}
                  {!p.voidedAt && (
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-destructive"
                      onClick={() => voidPayment(p)}>
                      <Undo2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </span>
              </div>
            ))}
          </div>

          {order.notes && (
            <div className="whitespace-pre-wrap rounded-xl bg-muted p-3">{order.notes}</div>
          )}

          {order.attachments.length > 0 && (
            <div className="space-y-1 rounded-xl border border-border p-3" data-testid="order-attachments">
              <p className="font-medium">ไฟล์แนบ</p>
              {order.attachments.map((f) => (
                <a
                  key={f.url}
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-11 items-center gap-2 text-xs text-primary underline-offset-2 hover:underline"
                >
                  <Paperclip className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{f.name}</span>
                </a>
              ))}
            </div>
          )}

          <Separator />

          <div className="flex flex-wrap gap-2">
            {(Object.keys(ORDER_DOC_LABELS) as OrderDocType[]).map((docType) => (
              <Button key={docType} variant="outline" size="sm" disabled={!!creating} onClick={() => createDoc(docType)}>
                {creating === docType ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
                {ORDER_DOC_LABELS[docType]}
              </Button>
            ))}
          </div>

          {events.length > 0 && (
            <div className="space-y-1">
              <p className="text-muted-foreground">ประวัติ</p>
              {events.slice(0, 8).map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 text-xs">
                  <span>
                    {e.note || `${ORDER_STATUS_LABELS[e.fromStatus as OrderStatus] ?? e.fromStatus ?? 'เริ่มต้น'} → ${ORDER_STATUS_LABELS[e.toStatus as OrderStatus] ?? e.toStatus}`}
                  </span>
                  <span className="text-muted-foreground shrink-0">{dt(e.createdAt)}</span>
                </div>
              ))}
            </div>
          )}

          {canManage && (
            <div className="flex flex-wrap justify-end gap-2">
              {order.status !== 'cancelled' && onCancel && (
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="order-cancel"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => { setCancelReason(''); setCancelOpen(true); }}
                >
                  <Ban className="mr-1 h-4 w-4" /> ยกเลิกออเดอร์
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                data-testid="order-delete"
                onClick={async () => {
                  setBlockers(null);
                  setDeleteOpen(true);
                  if (checkDeletable) {
                    const res = await checkDeletable(order.id);
                    setBlockers(res.blockers);
                  } else {
                    setBlockers([]);
                  }
                }}
              >
                <Trash2 className="mr-1 h-4 w-4" /> ลบออเดอร์
              </Button>
            </div>
          )}

          {/* ยืนยันการยกเลิก */}
          <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>ยกเลิกออเดอร์ {order.orderNo}?</AlertDialogTitle>
                <AlertDialogDescription>
                  ออเดอร์จะเปลี่ยนสถานะเป็น “ยกเลิก” และยังเก็บประวัติทั้งหมดไว้ ไม่มีการลบข้อมูล
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Textarea
                data-testid="order-cancel-reason"
                placeholder="เหตุผลการยกเลิก (ไม่บังคับ)"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
              <AlertDialogFooter>
                <AlertDialogCancel>ไม่ยกเลิก</AlertDialogCancel>
                <AlertDialogAction
                  data-testid="order-cancel-confirm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await onCancel?.(order, cancelReason);
                    setBusy(false);
                    setCancelOpen(false);
                    onOpenChange(false);
                  }}
                >
                  ยืนยันยกเลิก
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* ยืนยันการลบถาวร */}
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>ลบออเดอร์ {order.orderNo} ถาวร?</AlertDialogTitle>
                <AlertDialogDescription data-testid="order-delete-desc">
                  {blockers === null
                    ? 'กำลังตรวจสอบข้อมูลที่เกี่ยวข้อง…'
                    : blockers.length > 0
                      ? `ลบไม่ได้ เพราะมี${blockers.join(' / ')}ผูกอยู่กับออเดอร์นี้ — ใช้ “ยกเลิกออเดอร์” แทนเพื่อรักษาความถูกต้องของเอกสารและบัญชี`
                      : 'การลบจะนำออเดอร์ รายการงาน และประวัติออกถาวร กู้คืนไม่ได้'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>ปิด</AlertDialogCancel>
                <AlertDialogAction
                  data-testid="order-delete-confirm"
                  disabled={busy || blockers === null || blockers.length > 0}
                  onClick={async () => {
                    setBusy(true);
                    await onDelete(order.id);
                    setBusy(false);
                    setDeleteOpen(false);
                    onOpenChange(false);
                  }}
                >
                  ลบถาวร
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* แถบเปลี่ยนสถานะ — เห็นเสมอ ใช้ง่ายบนมือถือ */}
        <div
          className="sticky bottom-0 -mx-6 mt-2 flex items-center gap-2 border-t border-border bg-background/95 px-6 py-3 backdrop-blur"
          data-testid="order-status-bar"
        >
          <Select value={order.status} onValueChange={(v) => onStatusChange(order, v as OrderStatus)}>
            <SelectTrigger className="h-11 flex-1 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ORDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{ORDER_STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          {next && (
            <Button className="min-h-11 shrink-0 rounded-xl" onClick={() => onStatusChange(order, next)}>
              → {ORDER_STATUS_LABELS[next]}
            </Button>
          )}
        </div>

        <PaymentDialog
          order={order}
          payments={payments}
          open={payOpen}
          onOpenChange={setPayOpen}
          onSubmit={async (input) => {
            const res = await receivePayment(order, input, addInvoice as never);
            if (res?.receipt?.id) onOpenDocument?.(res.receipt.id);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

export default OrderDetailDialog;
/**
 * "รับงานเมื่อ / คาดว่าเริ่ม / คาดว่าเสร็จ / นัดรับ" for the order's queue jobs.
 */
function ScheduleSummary({ orderId, receivedAt, dueAt }: { orderId: string; receivedAt?: Date; dueAt?: Date }) {
  const { byOrder } = useJobSchedule();
  const jobs = byOrder[orderId] ?? [];
  const first = jobs[0];
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-1">
      <div><span className="text-muted-foreground">รับงานเมื่อ: </span>{formatBkk(receivedAt ?? null)}</div>
      <div><span className="text-muted-foreground">คาดว่าเริ่ม: </span>{formatBkk(first?.plannedStartAt ?? null)}</div>
      <div>
        <span className="text-muted-foreground">คาดว่าเสร็จ: </span>{formatBkk(first?.plannedFinishAt ?? null)}
        {first?.estimatedMinutes ? ` (~${first.estimatedMinutes} นาที)` : ''}
        {first?.scheduleLocked ? ' · ล็อกคิวไว้' : ''}
      </div>
      <div><span className="text-muted-foreground">นัดรับ: </span>{formatBkk(dueAt ?? null)}</div>
    </div>
  );
}
