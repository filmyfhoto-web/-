import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Calendar as CalendarIcon, Printer, Save, RefreshCcw, Trash2, FileText, History, Wallet, Receipt, TrendingUp, AlertCircle, Paperclip, Download, BarChart3, X, Search, FileDown, ChevronDown, Radio, FileStack, CheckSquare, Clock, Loader2, ArrowDownCircle } from 'lucide-react';
import { useCashDrawer } from '@/film-shop/hooks/useCashDrawer';
import { CashDrawerTransaction } from '@/film-shop/components/pos/CashDrawerTransactionDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { logStatusChange, fetchStatusHistory, type StatusHistoryEntry } from '@/film-shop/utils/paymentStatusHistory';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useDailyReport, type DailyReportSnapshot, type DailyReportAttachment } from '@/film-shop/hooks/useDailyReport';
import { useAppData } from '@/film-shop/hooks/useAppData';
import { usePOSData } from '@/film-shop/hooks/usePOSData';
import type { POSReceipt, PaymentStatus as POSPaymentStatus, POSPaymentType } from '@/film-shop/types/pos';
import { printDailyReport } from '@/film-shop/utils/dailyReportPrint';
import { AttachmentInput } from '@/film-shop/components/scanner/AttachmentInput';
import { PeriodSummary } from '@/film-shop/components/daily-report/PeriodSummary';
import { StatusHistoryPanel } from '@/film-shop/components/daily-report/StatusHistoryPanel';
import { InvoicePreviewNew } from '@/film-shop/components/invoices/InvoicePreviewNew';
import type { Invoice } from '@/film-shop/types';
import { supabase } from '@/film-shop/lib/supabase';
import { toast } from 'sonner';
import { PAY_STATUS, PAY_STATUS_OPTIONS, normalizePaymentStatus, type PaymentStatusKey } from '@/film-shop/utils/paymentStatus';

const fmt = (n: number) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);

const STATUS_LABEL: Record<string, string> = {
  pending: 'ยังไม่จ่าย', deposit: 'มัดจำ', paid: 'จ่ายแล้ว', credit: 'ลงบัญชี',
};

const TYPE_LABEL: Record<string, string> = {
  quotation: 'ใบเสนอราคา', invoice: 'ใบวางบิล', receipt: 'ใบเสร็จ',
};

function dateToStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function SummaryRow({ snapshot }: { snapshot: DailyReportSnapshot }) {
  const invIncome = (snapshot.invoices?.paidTotal || 0) + (snapshot.invoices?.depositCollected || 0);
  const grandIncome = snapshot.sales.total + snapshot.expenses.income + invIncome;
  const advOut = snapshot.cashAdvances.newAmount;
  const net = grandIncome - snapshot.expenses.total - advOut;
  const cards = [
    { label: 'หน้าร้าน (POS)', value: fmt(snapshot.sales.total), sub: `${snapshot.sales.count} บิล`, icon: Receipt, color: 'text-primary' },
    { label: 'รายจ่าย', value: fmt(snapshot.expenses.total), sub: `${snapshot.expenses.items.filter(i=>i.type==='expense').length} รายการ`, icon: TrendingUp, color: 'text-destructive' },
    { label: 'เบิกเงินคลัง', value: fmt(advOut), sub: `${snapshot.cashAdvances.newCount} รายการ`, icon: Wallet, color: 'text-orange-600' },
    { label: 'รายได้รวม', value: fmt(grandIncome), sub: `POS + ใบเสร็จ + รายรับอื่น`, icon: TrendingUp, color: 'text-blue-600' },
    { label: 'กำไรสุทธิ', value: fmt(net), sub: `รายได้ − รายจ่าย − เบิก`, icon: TrendingUp, color: net >= 0 ? 'text-green-600' : 'text-destructive' },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" />{c.label}</div>
              <div className={cn('text-xl font-bold mt-1', c.color)}>{c.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{c.sub}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function InlineStatusSelect({
  invoiceId,
  invoiceNumber,
  currentStatus,
  currentTotal = 0,
  invoicesAll,
  onChange,
  isSaving = false,
}: {
  invoiceId?: string;
  invoiceNumber: string;
  currentStatus: string;
  currentTotal?: number;
  invoicesAll: Invoice[];
  onChange: (invoice: Invoice, next: PaymentStatusKey) => void | Promise<void>;
  isSaving?: boolean;
}) {
  const inv = invoicesAll.find(i => (invoiceId && i.id === invoiceId) || i.invoiceNumber === invoiceNumber);
  const cur = normalizePaymentStatus(currentStatus);
  const meta = PAY_STATUS[cur];
  if (!inv && !invoiceId) {
    return <span className={cn('text-xs px-1.5 py-0.5 rounded border', meta.className)}>{meta.label}</span>;
  }
  const target = inv || ({
    id: invoiceId!,
    invoiceNumber,
    type: 'receipt',
    customerName: '-',
    items: [],
    subtotal: currentTotal,
    deposit: 0,
    discount: 0,
    total: currentTotal,
    amountDue: cur === 'paid' ? 0 : currentTotal,
    status: cur,
    jobStatus: 'pending',
    createdAt: new Date(),
  } as Invoice);
  return (
    <Select value={cur} disabled={isSaving} onValueChange={(v) => { void Promise.resolve(onChange(target, v as PaymentStatusKey)).catch(() => undefined); }}>
      <SelectTrigger className={cn('h-7 px-2 text-xs w-[110px]', meta.className, isSaving && 'opacity-70')}>
        {isSaving ? (
          <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />กำลังบันทึก…</span>
        ) : <SelectValue />}
      </SelectTrigger>
      <SelectContent>
        {PAY_STATUS_OPTIONS.map(s => (
          <SelectItem key={s} value={s}>{PAY_STATUS[s].label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function InlinePOSStatusSelect({
  receiptId,
  receiptNumber,
  currentStatus,
  currentTotal = 0,
  paymentType = 'cash',
  receiptsAll,
  onChange,
  isSaving = false,
}: {
  receiptId?: string;
  receiptNumber: string;
  currentStatus: string;
  currentTotal?: number;
  paymentType?: POSPaymentType;
  receiptsAll: POSReceipt[];
  onChange: (receipt: POSReceipt, next: PaymentStatusKey) => void | Promise<void>;
  isSaving?: boolean;
}) {
  const r = receiptsAll.find(x => (receiptId && x.id === receiptId) || x.receiptNumber === receiptNumber);
  const cur = normalizePaymentStatus(currentStatus);
  const meta = PAY_STATUS[cur];
  if (!r && !receiptId) {
    return <span className={cn('text-xs px-1.5 py-0.5 rounded border', meta.className)}>{meta.label}</span>;
  }
  const target = r || ({
    id: receiptId!,
    receiptNumber,
    customerName: '-',
    receiptDate: new Date(),
    paymentType,
    paymentStatus: cur as POSPaymentStatus,
    items: [],
    subtotal: currentTotal,
    deposit: 0,
    total: currentTotal,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as POSReceipt);
  return (
    <Select value={cur} disabled={isSaving} onValueChange={(v) => { void Promise.resolve(onChange(target, v as PaymentStatusKey)).catch(() => undefined); }}>
      <SelectTrigger className={cn('h-7 px-2 text-xs w-[110px]', meta.className, isSaving && 'opacity-70')}>
        {isSaving ? (
          <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />กำลังบันทึก…</span>
        ) : <SelectValue />}
      </SelectTrigger>
      <SelectContent>
        {PAY_STATUS_OPTIONS.map(s => (
          <SelectItem key={s} value={s}>{PAY_STATUS[s].label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function HistoryButton({ docType, docId, docNumber }: { docType: 'invoice' | 'pos_receipt'; docId: string | null; docNumber: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<StatusHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  if (!docId) return null;
  const load = async () => {
    setLoading(true);
    const r = await fetchStatusHistory(docType, docId);
    setRows(r);
    setLoading(false);
  };
  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        title="ประวัติการเปลี่ยนสถานะ"
        onClick={(e) => { e.stopPropagation(); setOpen(true); load(); }}
      >
        <Clock className="h-3.5 w-3.5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>ประวัติการเปลี่ยนสถานะ — {docNumber}</DialogTitle>
          </DialogHeader>
          {loading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">กำลังโหลด...</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">ยังไม่มีประวัติการเปลี่ยนสถานะ</div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>เวลา</TableHead>
                    <TableHead>จาก → ถึง</TableHead>
                    <TableHead>ผู้ทำรายการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const fromMeta = r.status_from ? PAY_STATUS[normalizePaymentStatus(r.status_from)] : null;
                    const toMeta = PAY_STATUS[normalizePaymentStatus(r.status_to)];
                    const d = new Date(r.changed_at);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs">
                          {d.toLocaleDateString('th-TH')}<br />
                          <span className="text-muted-foreground">{d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 flex-wrap">
                            {fromMeta && <span className={cn('text-xs px-1.5 py-0.5 rounded border', fromMeta.className)}>{fromMeta.label}</span>}
                            <span className="text-muted-foreground">→</span>
                            <span className={cn('text-xs px-1.5 py-0.5 rounded border', toMeta.className)}>{toMeta.label}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{r.changed_by_name || '-'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function SnapshotPreview({
  snapshot,
  invoicesAll,
  posReceiptsAll,
  onPrintInvoice,
  onChangeStatus,
  onChangePOSStatus,
  savingIds,
  onOpenInvoice,
  posCatFilter,
  onPosCatFilterChange,
  filteredByCategory,
}: {
  snapshot: DailyReportSnapshot;
  invoicesAll: Invoice[];
  posReceiptsAll: POSReceipt[];
  onPrintInvoice: (number: string) => void;
  onChangeStatus: (invoice: Invoice, next: PaymentStatusKey) => void | Promise<void>;
  onChangePOSStatus: (receipt: POSReceipt, next: PaymentStatusKey) => void | Promise<void>;
  savingIds: Set<string>;
  onOpenInvoice?: (invoiceId: string) => void;
  posCatFilter: 'all' | 'paid' | 'unpaid';
  onPosCatFilterChange: (v: 'all' | 'paid' | 'unpaid') => void;
  filteredByCategory: DailyReportSnapshot['sales']['byCategory'];
}) {
  const [fType, setFType] = useState<'all' | 'quotation' | 'invoice' | 'receipt'>('all');
  const [fStatus, setFStatus] = useState<'all' | PaymentStatusKey>('all');
  const [fSearch, setFSearch] = useState('');

  // POS card filters
  const [posFStatus, setPosFStatus] = useState<'all' | PaymentStatusKey>('all');
  const [posFPayType, setPosFPayType] = useState<'all' | 'cash' | 'credit' | 'transfer'>('all');

  // Bulk selection
  const [posSelected, setPosSelected] = useState<Set<string>>(new Set());
  const [invSelected, setInvSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<PaymentStatusKey>('paid');
  const [bulkPosStatus, setBulkPosStatus] = useState<PaymentStatusKey>('paid');

  const filteredItems = useMemo(() => {
    const items = snapshot.invoices?.items || [];
    const q = fSearch.trim().toLowerCase();
    return items.filter(it => {
      if (fType !== 'all' && it.type !== fType) return false;
      if (fStatus !== 'all' && normalizePaymentStatus(it.status) !== fStatus) return false;
      if (q && !`${it.number} ${it.customer}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [snapshot.invoices, fType, fStatus, fSearch]);

  const filteredPosReceipts = useMemo(() => {
    const items = snapshot.sales.receipts || [];
    return items.filter(r => {
      if (posFStatus !== 'all' && normalizePaymentStatus(r.status) !== posFStatus) return false;
      if (posFPayType !== 'all' && (r.paymentType || 'cash') !== posFPayType) return false;
      return true;
    });
  }, [snapshot.sales.receipts, posFStatus, posFPayType]);

  const togglePos = (id: string) => {
    setPosSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAllPos = () => {
    if (posSelected.size === filteredPosReceipts.length) setPosSelected(new Set());
    else setPosSelected(new Set(filteredPosReceipts.map(r => r.id)));
  };
  const toggleInv = (id: string) => {
    setInvSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAllInv = () => {
    if (invSelected.size === filteredItems.length) setInvSelected(new Set());
    else setInvSelected(new Set(filteredItems.map(it => it.id)));
  };

  const [bulkRunning, setBulkRunning] = useState(false);

  const runBulk = async <T,>(
    label: string,
    items: T[],
    getMeta: (t: T) => { id: string; number: string },
    apply: (t: T) => Promise<void>,
  ) => {
    if (items.length === 0 || bulkRunning) return { ok: 0, fail: 0 };
    setBulkRunning(true);
    const progressId = toast.loading(`กำลังอัปเดต ${label} 0/${items.length}…`);
    let ok = 0, fail = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const meta = getMeta(it);
      try {
        await apply(it);
        ok++;
        toast.success(`✓ ${meta.number}`, { duration: 1800 });
      } catch (e) {
        fail++;
        const msg = e instanceof Error ? e.message : 'ไม่ทราบสาเหตุ';
        toast.error(`✗ ${meta.number}: ${msg}`, { duration: 4000 });
      }
      toast.loading(`กำลังอัปเดต ${label} ${i + 1}/${items.length}…`, { id: progressId });
    }
    toast.dismiss(progressId);
    if (fail === 0) toast.success(`อัปเดต ${label} สำเร็จทั้งหมด ${ok} รายการ`);
    else toast.message(`สรุป ${label}: สำเร็จ ${ok} · ล้มเหลว ${fail}`);
    setBulkRunning(false);
    return { ok, fail };
  };

  const applyBulkPos = async () => {
    if (posSelected.size === 0) return;
    const items = filteredPosReceipts.filter(r => posSelected.has(r.id));
    await runBulk(
      'POS',
      items,
      (row) => ({ id: row.id, number: row.number }),
      async (row) => {
        const r = posReceiptsAll.find(x => x.id === row.id) || ({
          id: row.id,
          receiptNumber: row.number,
          customerName: row.customer || '-',
          receiptDate: new Date(),
          paymentType: (row.paymentType || 'cash') as POSPaymentType,
          paymentStatus: normalizePaymentStatus(row.status) as POSPaymentStatus,
          items: [],
          subtotal: row.total || 0,
          deposit: 0,
          total: row.total || 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as POSReceipt);
        await onChangePOSStatus(r, bulkPosStatus);
      },
    );
    setPosSelected(new Set());
  };
  const applyBulkInv = async () => {
    if (invSelected.size === 0) return;
    const items = filteredItems.filter(it => invSelected.has(it.id));
    await runBulk(
      'ใบกำกับ',
      items,
      (row) => ({ id: row.id, number: row.number }),
      async (row) => {
        const inv = invoicesAll.find(i => i.id === row.id) || ({
          id: row.id,
          invoiceNumber: row.number,
          type: row.type as Invoice['type'],
          customerName: row.customer || '-',
          items: [],
          subtotal: row.total || 0,
          deposit: 0,
          discount: 0,
          total: row.total || 0,
          amountDue: row.due || 0,
          status: normalizePaymentStatus(row.status),
          jobStatus: 'pending',
          createdAt: new Date(),
        } as Invoice);
        await onChangeStatus(inv, bulkStatus);
      },
    );
    setInvSelected(new Set());
  };

  const filteredTotal = filteredItems.reduce((s, it) => s + (it.total || 0), 0);
  const filteredDue = filteredItems.reduce((s, it) => s + (it.due || 0), 0);
  const byType = snapshot.invoices?.byType || {};
  const byStatus = snapshot.invoices?.byStatus || {};

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">ยอดขายตามสถานะ</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>สถานะ</TableHead><TableHead className="text-center">จำนวนบิล</TableHead><TableHead className="text-right">ยอดรวม</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {(['pending','deposit','paid','credit'] as const).map(s => (
                <TableRow key={s}>
                  <TableCell>{STATUS_LABEL[s]}</TableCell>
                  <TableCell className="text-center">{snapshot.sales.byStatus[s]?.count || 0}</TableCell>
                  <TableCell className="text-right">{fmt(snapshot.sales.byStatus[s]?.total || 0)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-bold">
                <TableCell>รวม</TableCell>
                <TableCell className="text-center">{snapshot.sales.count}</TableCell>
                <TableCell className="text-right">{fmt(snapshot.sales.total)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {snapshot.sales.receipts && snapshot.sales.receipts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              ใบเสร็จหน้าร้าน (POS) ({snapshot.sales.receipts.length} บิล)
            </CardTitle>
            <p className="text-xs text-muted-foreground">เปลี่ยนสถานะการชำระได้ทันที — ซิงก์เรียลไทม์ทุกตาราง</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <Select value={posFStatus} onValueChange={(v) => setPosFStatus(v as any)}>
                <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทุกสถานะ</SelectItem>
                  {PAY_STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{PAY_STATUS[s].label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={posFPayType} onValueChange={(v) => setPosFPayType(v as any)}>
                <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทุกประเภทจ่าย</SelectItem>
                  <SelectItem value="cash">เงินสด</SelectItem>
                  <SelectItem value="transfer">เงินโอน</SelectItem>
                  <SelectItem value="credit">ลงบัญชี</SelectItem>
                </SelectContent>
              </Select>
              {(posFStatus !== 'all' || posFPayType !== 'all') && (
                <Button variant="ghost" size="sm" onClick={() => { setPosFStatus('all'); setPosFPayType('all'); }} className="gap-1">
                  <X className="h-4 w-4" />ล้าง
                </Button>
              )}
              <span className="text-xs text-muted-foreground ml-auto">{filteredPosReceipts.length} / {snapshot.sales.receipts.length} บิล</span>
            </div>

            {/* Bulk action bar */}
            {posSelected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-2">
                <CheckSquare className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">เลือก {posSelected.size} บิล</span>
                <Select value={bulkPosStatus} onValueChange={(v) => setBulkPosStatus(v as PaymentStatusKey)}>
                  <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAY_STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{PAY_STATUS[s].label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={applyBulkPos} disabled={bulkRunning} className="gap-2">
                  {bulkRunning && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  อัปเดตทั้งหมด
                </Button>
                <Button size="sm" variant="ghost" disabled={bulkRunning} onClick={() => setPosSelected(new Set())}>ยกเลิก</Button>
              </div>
            )}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox
                        checked={filteredPosReceipts.length > 0 && posSelected.size === filteredPosReceipts.length}
                        onCheckedChange={toggleAllPos}
                      />
                    </TableHead>
                    <TableHead>เลขที่</TableHead>
                    <TableHead>ลูกค้า</TableHead>
                    <TableHead>ประเภทจ่าย</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead className="text-right">ยอดรวม</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPosReceipts.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">ไม่มีข้อมูลตามตัวกรอง</TableCell></TableRow>
                  ) : filteredPosReceipts.map((r) => {
                    const posRec = posReceiptsAll.find(x => x.id === r.id);
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <Checkbox
                            checked={posSelected.has(r.id)}
                            onCheckedChange={() => togglePos(r.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{r.number}</TableCell>
                        <TableCell>{r.customer || '-'}</TableCell>
                        <TableCell className="text-xs">{r.paymentType === 'credit' ? 'ลงบัญชี' : r.paymentType === 'transfer' ? 'เงินโอน' : 'เงินสด'}</TableCell>
                        <TableCell>
                          <InlinePOSStatusSelect
                            receiptId={r.id}
                            receiptNumber={r.number}
                            currentStatus={r.status}
                            currentTotal={r.total}
                            paymentType={(r.paymentType || 'cash') as POSPaymentType}
                            receiptsAll={posReceiptsAll}
                            onChange={onChangePOSStatus}
                            isSaving={savingIds.has(r.id)}
                          />
                        </TableCell>
                        <TableCell className="text-right">{fmt(r.total)}</TableCell>
                        <TableCell>
                          <HistoryButton docType="pos_receipt" docId={r.id || posRec?.id || null} docNumber={r.number} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="font-bold bg-muted/30">
                    <TableCell colSpan={5}>รวมตามตัวกรอง</TableCell>
                    <TableCell className="text-right">{fmt(filteredPosReceipts.reduce((s, r) => s + r.total, 0))}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {snapshot.invoices && snapshot.invoices.count > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">ใบเสนอราคา / ใบเสร็จ / ใบวางบิล ({snapshot.invoices.count} ฉบับ)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {/* Per-type cards (clickable) */}
            <div className="grid grid-cols-3 gap-2">
              {(['quotation','invoice','receipt'] as const).map(t => {
                const active = fType === t;
                const v = byType[t] || { count: 0, total: 0 };
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFType(active ? 'all' : t)}
                    className={cn(
                      'rounded-lg border p-3 text-left transition hover:border-primary/50 hover:bg-muted/50',
                      active && 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    )}
                  >
                    <div className="text-xs text-muted-foreground">{TYPE_LABEL[t]}</div>
                    <div className="text-lg font-bold">{fmt(v.total)}</div>
                    <div className="text-xs text-muted-foreground">{v.count} ฉบับ</div>
                  </button>
                );
              })}
            </div>

            {/* Per-status cards (clickable) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {(['paid','deposit','credit','pending'] as const).map(s => {
                const active = fStatus === s;
                const v = byStatus[s] || { count: 0, total: 0 };
                const meta = PAY_STATUS[s];
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setFStatus(active ? 'all' : s)}
                    className={cn(
                      'rounded-lg border p-2 text-left transition hover:border-primary/50',
                      active && 'border-primary ring-1 ring-primary/30'
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className={cn('text-xs px-1.5 py-0.5 rounded border', meta.className)}>{meta.label}</span>
                      <span className="text-xs text-muted-foreground">{v.count}</span>
                    </div>
                    <div className="text-base font-bold mt-1">{fmt(v.total)}</div>
                  </button>
                );
              })}
            </div>

            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={fSearch} onChange={e => setFSearch(e.target.value)} placeholder="ค้นหาเลขที่หรือลูกค้า..." className="pl-8 h-9" />
              </div>
              <Select value={fType} onValueChange={(v) => setFType(v as any)}>
                <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทุกประเภท</SelectItem>
                  <SelectItem value="quotation">ใบเสนอราคา</SelectItem>
                  <SelectItem value="invoice">ใบวางบิล</SelectItem>
                  <SelectItem value="receipt">ใบเสร็จ</SelectItem>
                </SelectContent>
              </Select>
              <Select value={fStatus} onValueChange={(v) => setFStatus(v as any)}>
                <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทุกสถานะ</SelectItem>
                  {PAY_STATUS_OPTIONS.map(s => (
                    <SelectItem key={s} value={s}>{PAY_STATUS[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(fType !== 'all' || fStatus !== 'all' || fSearch) && (
                <Button variant="ghost" size="sm" onClick={() => { setFType('all'); setFStatus('all'); setFSearch(''); }} className="gap-1">
                  <X className="h-4 w-4" />ล้าง
                </Button>
              )}
            </div>

            {/* Bulk action bar */}
            {invSelected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-2">
                <CheckSquare className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">เลือก {invSelected.size} ฉบับ</span>
                <Select value={bulkStatus} onValueChange={(v) => setBulkStatus(v as PaymentStatusKey)}>
                  <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAY_STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{PAY_STATUS[s].label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={applyBulkInv} disabled={bulkRunning} className="gap-2">
                  {bulkRunning && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  อัปเดตทั้งหมด
                </Button>
                <Button size="sm" variant="ghost" disabled={bulkRunning} onClick={() => setInvSelected(new Set())}>ยกเลิก</Button>
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      checked={filteredItems.length > 0 && invSelected.size === filteredItems.length}
                      onCheckedChange={toggleAllInv}
                    />
                  </TableHead>
                  <TableHead>เลขที่</TableHead>
                  <TableHead>ประเภท</TableHead>
                  <TableHead>ลูกค้า</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead className="text-right">ยอด</TableHead>
                  <TableHead className="text-right">ค้าง</TableHead>
                  <TableHead className="text-right">การจัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">ไม่มีข้อมูลตามตัวกรอง</TableCell></TableRow>
                ) : filteredItems.map((it) => {
                  const inv = invoicesAll.find(x => x.id === it.id);
                  return (
                    <TableRow key={it.id}>
                      <TableCell>
                        <Checkbox
                          checked={invSelected.has(it.id)}
                          onCheckedChange={() => toggleInv(it.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{it.number}</TableCell>
                      <TableCell className="text-xs">{TYPE_LABEL[it.type] || it.type}</TableCell>
                      <TableCell>{it.customer}</TableCell>
                      <TableCell><InlineStatusSelect invoiceId={it.id} invoiceNumber={it.number} currentStatus={it.status} currentTotal={it.total} invoicesAll={invoicesAll} onChange={onChangeStatus} isSaving={savingIds.has(it.id)} /></TableCell>
                      <TableCell className="text-right">{fmt(it.total)}</TableCell>
                      <TableCell className="text-right text-destructive">{it.due > 0 ? fmt(it.due) : '-'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-0.5">
                          <HistoryButton docType="invoice" docId={it.id || inv?.id || null} docNumber={it.number} />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            disabled={!inv}
                            title={inv ? 'พิมพ์ / บันทึก PDF (A4)' : 'ไม่พบเอกสารในระบบ'}
                            onClick={() => onPrintInvoice(it.number)}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="font-bold bg-muted/30">
                  <TableCell colSpan={5}>รวมตามตัวกรอง ({filteredItems.length} ฉบับ)</TableCell>
                  <TableCell className="text-right">{fmt(filteredTotal)}</TableCell>
                  <TableCell className="text-right text-destructive">{filteredDue > 0 ? fmt(filteredDue) : '-'}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <FileDown className="h-3 w-3" />
              กดปุ่มพิมพ์เพื่อเปิดมุมมอง A4 — เลือก "บันทึกเป็น PDF" จากกล่องพิมพ์ของเบราว์เซอร์เพื่อดาวน์โหลด
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bills grouped by payment status — explicit list of bill numbers */}
      {snapshot.invoices && snapshot.invoices.count > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">ยอดขายตามบิล — แยกตามสถานะการชำระ</CardTitle>
            <p className="text-xs text-muted-foreground">รายชื่อบิล (เลขที่ + ลูกค้า) แยกตามสถานะ อัปเดตอัตโนมัติเมื่อมีการเปลี่ยนสถานะ</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {(['pending','deposit','credit','paid'] as const).map((s) => {
              const items = (snapshot.invoices.items || []).filter(it => normalizePaymentStatus(it.status) === s);
              const total = items.reduce((sum, it) => sum + (it.total || 0), 0);
              const due = items.reduce((sum, it) => sum + (it.due || 0), 0);
              const meta = PAY_STATUS[s];
              return (
                <Collapsible key={s} defaultOpen={items.length > 0 && (s === 'pending' || s === 'deposit' || s === 'credit')}>
                  <CollapsibleTrigger className={cn(
                    'w-full flex items-center justify-between gap-2 rounded-md border px-3 py-2 hover:bg-muted/40 transition',
                    items.length === 0 && 'opacity-60'
                  )}>
                    <div className="flex items-center gap-2">
                      <span className={cn('text-xs px-2 py-0.5 rounded border font-medium', meta.className)}>{meta.label}</span>
                      <span className="text-sm text-muted-foreground">{items.length} ฉบับ</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="font-semibold">{fmt(total)} ฿</span>
                      {due > 0 && <span className="text-destructive text-xs">ค้าง {fmt(due)}</span>}
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {items.length === 0 ? (
                      <div className="text-xs text-muted-foreground px-3 py-2">— ไม่มีบิลในกลุ่มนี้ —</div>
                    ) : (
                      <div className="px-2 pb-2">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="h-8">เลขที่บิล</TableHead>
                              <TableHead className="h-8">ลูกค้า</TableHead>
                              <TableHead className="h-8">ประเภท</TableHead>
                              <TableHead className="h-8">สถานะ</TableHead>
                              <TableHead className="h-8 text-right">ยอดรวม</TableHead>
                              <TableHead className="h-8 text-right">ค้างชำระ</TableHead>
                              <TableHead className="h-8 text-right w-12"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {items.map((it) => {
                              const inv = invoicesAll.find(x => x.id === it.id);
                              return (
                                <TableRow key={it.id}>
                                  <TableCell className="font-medium">{it.number}</TableCell>
                                  <TableCell>{it.customer}</TableCell>
                                  <TableCell className="text-xs">{TYPE_LABEL[it.type] || it.type}</TableCell>
                                  <TableCell><InlineStatusSelect invoiceId={it.id} invoiceNumber={it.number} currentStatus={it.status} currentTotal={it.total} invoicesAll={invoicesAll} onChange={onChangeStatus} isSaving={savingIds.has(it.id)} /></TableCell>
                                  <TableCell className="text-right">{fmt(it.total)}</TableCell>
                                  <TableCell className="text-right text-destructive">{it.due > 0 ? fmt(it.due) : '-'}</TableCell>
                                  <TableCell className="text-right">
                                    <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!inv} onClick={() => onPrintInvoice(it.number)} title="พิมพ์ A4">
                                      <Printer className="h-3.5 w-3.5" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Document type breakdown — invoices/receipts/quotations only */}
      {(snapshot.invoices?.byType && Object.values(snapshot.invoices.byType).some(v => v.count > 0)) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">แจงยอดตามประเภทเอกสาร</CardTitle>
            <p className="text-xs text-muted-foreground">รวมจาก ใบเสนอราคา / ใบวางบิล / ใบเสร็จ ที่ออกในวันนี้</p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ประเภทเอกสาร</TableHead>
                  <TableHead className="text-center">จำนวนบิล</TableHead>
                  <TableHead className="text-right">ยอดรวม</TableHead>
                  <TableHead className="text-right">% ของยอดรวม</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const rows: Array<{ key: string; name: string; count: number; amount: number }> = [];
                  (['quotation','invoice','receipt'] as const).forEach(t => {
                    const v = snapshot.invoices?.byType?.[t];
                    if (v && v.count > 0) {
                      rows.push({ key: `inv-${t}`, name: TYPE_LABEL[t], count: v.count, amount: v.total });
                    }
                  });
                  const grandTotal = rows.reduce((s, r) => s + r.amount, 0);
                  return (
                    <>
                      {rows.map(r => (
                        <TableRow key={r.key}>
                          <TableCell>{r.name}</TableCell>
                          <TableCell className="text-center">{r.count > 0 ? r.count : '-'}</TableCell>
                          <TableCell className="text-right">{fmt(r.amount)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {grandTotal > 0 ? ((r.amount / grandTotal) * 100).toFixed(1) + '%' : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-bold bg-muted/30">
                        <TableCell>รวม</TableCell>
                        <TableCell className="text-center">{rows.reduce((s, r) => s + r.count, 0) || '-'}</TableCell>
                        <TableCell className="text-right">{fmt(grandTotal)}</TableCell>
                        <TableCell className="text-right">100%</TableCell>
                      </TableRow>
                    </>
                  );
                })()}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {snapshot.expenses.items.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">รายรับ/รายจ่าย</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>ประเภท</TableHead><TableHead>หมวด</TableHead><TableHead>รายละเอียด</TableHead><TableHead className="text-right">จำนวน</TableHead></TableRow></TableHeader>
              <TableBody>
                {snapshot.expenses.items.map((it, i) => (
                  <TableRow key={i}>
                    <TableCell><Badge variant={it.type === 'expense' ? 'destructive' : 'default'}>{it.type === 'expense' ? 'รายจ่าย' : 'รายรับ'}</Badge></TableCell>
                    <TableCell>{it.category}</TableCell>
                    <TableCell className="text-sm">{it.description}</TableCell>
                    <TableCell className="text-right">{fmt(it.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
        </CardContent>
      </Card>
      )}

      {(snapshot.cashAdvances.newCount > 0 || snapshot.cashAdvances.repaidCount > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              การเบิกเงินคลัง ({snapshot.cashAdvances.newCount} รายการ • คืน {fmt(snapshot.cashAdvances.repaidAmount)} ฿)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>ผู้เบิก</TableHead><TableHead>วัตถุประสงค์</TableHead><TableHead>สถานะ</TableHead><TableHead className="text-right">จำนวน</TableHead></TableRow></TableHeader>
              <TableBody>
                {snapshot.cashAdvances.items.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-4">— ไม่มีรายการเบิกใหม่ —</TableCell></TableRow>
                ) : snapshot.cashAdvances.items.map((a, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{a.borrower}</TableCell>
                    <TableCell className="text-sm">{a.purpose}</TableCell>
                    <TableCell><Badge variant={a.status === 'settled' ? 'default' : 'secondary'}>{a.status === 'settled' ? 'ชำระแล้ว' : a.status === 'partial' ? 'ชำระบางส่วน' : 'ค้าง'}</Badge></TableCell>
                    <TableCell className="text-right text-orange-600 font-medium">{fmt(a.amount)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold bg-muted/30">
                  <TableCell colSpan={3}>รวมยอดเบิกใหม่</TableCell>
                  <TableCell className="text-right text-orange-600">{fmt(snapshot.cashAdvances.newAmount)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {snapshot.cashDrawer.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">กะเงินสด</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>สถานะ</TableHead><TableHead className="text-right">เริ่ม</TableHead><TableHead className="text-right">คาด</TableHead><TableHead className="text-right">จริง</TableHead><TableHead className="text-right">ต่าง</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {snapshot.cashDrawer.map((s, i) => (
                    <TableRow key={i}>
                      <TableCell><Badge variant={s.status === 'closed' ? 'default' : 'secondary'}>{s.status === 'closed' ? 'ปิดแล้ว' : 'เปิดอยู่'}</Badge></TableCell>
                      <TableCell className="text-right">{fmt(s.openingAmount)}</TableCell>
                      <TableCell className="text-right">{fmt(s.expectedAmount)}</TableCell>
                      <TableCell className="text-right">{s.actualAmount != null ? fmt(s.actualAmount) : '-'}</TableCell>
                      <TableCell className={cn('text-right font-medium', (s.difference || 0) === 0 ? 'text-green-600' : 'text-destructive')}>{s.difference != null ? fmt(s.difference) : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {snapshot.paperWithdrawals && snapshot.paperWithdrawals.count > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileStack className="h-4 w-4" />
              การเบิกกระดาษ ({snapshot.paperWithdrawals.count} รายการ)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>เวลา</TableHead>
                  <TableHead>ประเภทกระดาษ</TableHead>
                  <TableHead className="text-right">จำนวน</TableHead>
                  <TableHead>หน่วย</TableHead>
                  <TableHead>ผู้เบิก</TableHead>
                  <TableHead>วัตถุประสงค์</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshot.paperWithdrawals.items.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(p.withdrawnAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</TableCell>
                    <TableCell className="font-medium">{p.paperType}</TableCell>
                    <TableCell className="text-right">{fmt(p.quantity)}</TableCell>
                    <TableCell className="text-xs">{p.unit}</TableCell>
                    <TableCell>{p.withdrawnBy}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.purpose || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* POS sales by category */}
      <PosCategoryCard
        snapshot={snapshot}
        filter={posCatFilter}
        onFilterChange={onPosCatFilterChange}
        byCategory={filteredByCategory}
      />


      {snapshot.outstanding && snapshot.outstanding.count > 0 && (
        <Card className="border-destructive/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              บิลค้างชำระทั้งหมด ({snapshot.outstanding.count} ฉบับ)
            </CardTitle>
            <p className="text-xs text-muted-foreground">รวมบิลทุกวันที่ยังเก็บเงินไม่ครบ — เรียงตามอายุหนี้มากสุด</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div className="text-xs text-muted-foreground">รวมยอดค้าง</div>
                <div className="text-xl font-bold text-destructive mt-1">{fmt(snapshot.outstanding.totalDue)}</div>
                <div className="text-xs text-muted-foreground mt-1">{snapshot.outstanding.count} ฉบับ</div>
              </div>
              {(['pending','deposit','credit'] as const).map(s => {
                const v = snapshot.outstanding.byStatus?.[s] || { count: 0, totalDue: 0 };
                const meta = PAY_STATUS[s];
                return (
                  <div key={s} className="rounded-lg border p-3">
                    <span className={cn('text-xs px-1.5 py-0.5 rounded border', meta.className)}>{meta.label}</span>
                    <div className="text-lg font-bold mt-1">{fmt(v.totalDue)}</div>
                    <div className="text-xs text-muted-foreground mt-1">{v.count} ฉบับ</div>
                  </div>
                );
              })}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>เลขที่</TableHead>
                    <TableHead>ลูกค้า</TableHead>
                    <TableHead>ประเภท</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead className="text-right">วันที่เอกสาร</TableHead>
                    <TableHead className="text-right">อายุ (วัน)</TableHead>
                    <TableHead className="text-right">ยอดรวม</TableHead>
                    <TableHead className="text-right">ค้างชำระ</TableHead>
                    <TableHead className="text-right w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshot.outstanding.items.map((it) => {
                    const inv = invoicesAll.find(x => x.id === it.id);
                    const clickable = !!onOpenInvoice;
                    return (
                      <TableRow key={it.id} className={clickable ? 'cursor-pointer hover:bg-muted/50' : ''} onClick={clickable ? () => onOpenInvoice!(it.id) : undefined}>
                        <TableCell className="font-medium">
                          {clickable ? (
                            <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={(e) => { e.stopPropagation(); onOpenInvoice!(it.id); }}>{it.number}</button>
                          ) : it.number}
                        </TableCell>
                        <TableCell>{it.customer}</TableCell>
                        <TableCell className="text-xs">{TYPE_LABEL[it.type] || it.type}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}><InlineStatusSelect invoiceId={it.id} invoiceNumber={it.number} currentStatus={it.status} currentTotal={it.total} invoicesAll={invoicesAll} onChange={onChangeStatus} isSaving={savingIds.has(it.id)} /></TableCell>
                        <TableCell className="text-right text-xs">{new Date(it.documentDate).toLocaleDateString('th-TH')}</TableCell>
                        <TableCell className={cn('text-right font-medium', it.ageDays > 30 ? 'text-destructive' : it.ageDays > 14 ? 'text-orange-600' : 'text-muted-foreground')}>{it.ageDays}</TableCell>
                        <TableCell className="text-right">{fmt(it.total)}</TableCell>
                        <TableCell className="text-right text-destructive font-semibold">{fmt(it.due)}</TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!inv} onClick={() => onPrintInvoice(it.number)} title={inv ? 'พิมพ์ A4' : 'ต้องเปิดหน้าใบกำกับเพื่อพิมพ์'}>
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="font-bold bg-destructive/5">
                    <TableCell colSpan={7}>รวมค้างชำระ ({snapshot.outstanding.count} ฉบับ)</TableCell>
                    <TableCell className="text-right text-destructive">{fmt(snapshot.outstanding.totalDue)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PosCategoryCard({
  snapshot,
  filter,
  onFilterChange,
  byCategory,
}: {
  snapshot: DailyReportSnapshot;
  filter: 'all' | 'paid' | 'unpaid';
  onFilterChange: (v: 'all' | 'paid' | 'unpaid') => void;
  byCategory: DailyReportSnapshot['sales']['byCategory'];
}) {
  const [openCat, setOpenCat] = useState<string | null>(null);
  const totalAmount = byCategory.reduce((s, c) => s + c.total, 0);
  const totalItems = byCategory.reduce((s, c) => s + c.itemCount, 0);

  const drilldown = useMemo(() => {
    if (!openCat) return null;
    const details = snapshot.sales.receiptsDetailed || [];
    const isPaid = (s: string) => s === 'paid';
    const isUnpaid = (s: string) => s === 'pending' || s === 'deposit' || s === 'credit';
    const include = (s: string) => filter === 'all' || (filter === 'paid' ? isPaid(s) : isUnpaid(s));
    const matchingReceipts = details
      .filter(r => include(r.status) && r.items.some(it => (it.category || 'อื่น ๆ') === openCat))
      .map(r => {
        const catItems = r.items.filter(it => (it.category || 'อื่น ๆ') === openCat);
        return {
          ...r,
          categoryTotal: catItems.reduce((s, it) => s + it.total, 0),
          categoryItems: catItems,
        };
      })
      .sort((a, b) => b.categoryTotal - a.categoryTotal);
    const productMap: Record<string, { quantity: number; total: number }> = {};
    matchingReceipts.forEach(r => r.categoryItems.forEach(it => {
      if (!productMap[it.name]) productMap[it.name] = { quantity: 0, total: 0 };
      productMap[it.name].quantity += it.quantity;
      productMap[it.name].total += it.total;
    }));
    const products = Object.entries(productMap)
      .map(([name, v]) => ({ name, quantity: v.quantity, total: v.total }))
      .sort((a, b) => b.total - a.total);
    return {
      receipts: matchingReceipts,
      products,
      totalAmount: products.reduce((s, p) => s + p.total, 0),
      totalQuantity: products.reduce((s, p) => s + p.quantity, 0),
    };
  }, [openCat, snapshot.sales.receiptsDetailed, filter]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          ขายหน้าร้าน (POS) — แยกตามประเภทสินค้า
        </CardTitle>
        <p className="text-xs text-muted-foreground">คลิกแถวเพื่อดูใบเสร็จและรายการสินค้าในหมวดนั้น</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filter} onValueChange={(v) => onFilterChange(v as any)}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกสถานะการชำระ</SelectItem>
              <SelectItem value="paid">เฉพาะชำระแล้ว</SelectItem>
              <SelectItem value="unpaid">เฉพาะยังไม่จ่าย</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto">
            {byCategory.length} หมวด · {totalItems} รายการ · รวม {fmt(totalAmount)} บาท
          </span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ประเภทสินค้า</TableHead>
                <TableHead className="text-center">จำนวนรายการ</TableHead>
                <TableHead className="text-center">จำนวนชิ้น</TableHead>
                <TableHead className="text-right">ยอดรวม (บาท)</TableHead>
                <TableHead>สินค้ายอดนิยม</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byCategory.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">ไม่มีข้อมูลตามตัวกรอง</TableCell></TableRow>
              ) : byCategory.map((c) => (
                <TableRow key={c.category} className="cursor-pointer hover:bg-muted/50" onClick={() => setOpenCat(c.category)}>
                  <TableCell className="font-medium">{c.category}</TableCell>
                  <TableCell className="text-center">{c.itemCount}</TableCell>
                  <TableCell className="text-center">{fmt(c.quantity)}</TableCell>
                  <TableCell className="text-right font-semibold">{fmt(c.total)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.topItems.length === 0 ? '-' : c.topItems.slice(0, 3).map(t => t.name).join(', ')}
                  </TableCell>
                </TableRow>
              ))}
              {byCategory.length > 0 && (
                <TableRow className="font-bold bg-muted/30">
                  <TableCell>รวม</TableCell>
                  <TableCell className="text-center">{totalItems}</TableCell>
                  <TableCell />
                  <TableCell className="text-right">{fmt(totalAmount)}</TableCell>
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={!!openCat} onOpenChange={(o) => !o && setOpenCat(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ขายหน้าร้าน — หมวด "{openCat}"</DialogTitle>
          </DialogHeader>
          {drilldown && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-md border p-2"><div className="text-muted-foreground text-xs">จำนวนใบเสร็จ</div><div className="font-bold text-base mt-1">{drilldown.receipts.length}</div></div>
                <div className="rounded-md border p-2"><div className="text-muted-foreground text-xs">จำนวนชิ้น</div><div className="font-bold text-base mt-1">{fmt(drilldown.totalQuantity)}</div></div>
                <div className="rounded-md border p-2"><div className="text-muted-foreground text-xs">ยอดรวมในหมวด</div><div className="font-bold text-base mt-1">{fmt(drilldown.totalAmount)}</div></div>
              </div>

              <div>
                <div className="text-sm font-medium mb-1">รายการสินค้าในหมวดนี้</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>สินค้า</TableHead>
                      <TableHead className="text-center">จำนวน</TableHead>
                      <TableHead className="text-right">ยอด (บาท)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drilldown.products.map(p => (
                      <TableRow key={p.name}>
                        <TableCell>{p.name}</TableCell>
                        <TableCell className="text-center">{fmt(p.quantity)}</TableCell>
                        <TableCell className="text-right">{fmt(p.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div>
                <div className="text-sm font-medium mb-1">ใบเสร็จ POS ที่มีสินค้าในหมวดนี้</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>เลขที่</TableHead>
                      <TableHead>ลูกค้า</TableHead>
                      <TableHead>สถานะ</TableHead>
                      <TableHead className="text-right">ยอดในหมวด</TableHead>
                      <TableHead className="text-right">ยอดรวมบิล</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drilldown.receipts.map(r => {
                      const meta = PAY_STATUS[normalizePaymentStatus(r.status)];
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.number}</TableCell>
                          <TableCell>{r.customer}</TableCell>
                          <TableCell><span className={cn('text-xs px-1.5 py-0.5 rounded border', meta.className)}>{meta.label}</span></TableCell>
                          <TableCell className="text-right">{fmt(r.categoryTotal)}</TableCell>
                          <TableCell className="text-right">{fmt(r.total)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

interface DailyReportManagerProps {
  onPageChange?: (page: string, filter?: { paymentStatus?: string; openCashDrawer?: boolean; previewInvoiceId?: string }) => void;
}

export function DailyReportManager({ onPageChange }: DailyReportManagerProps = {}) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const dateStr = dateToStr(selectedDate);
  const { snapshot, savedReport, history, loading, saving, notes, setNotes, refreshSnapshot, save, remove, uploadAttachments, removeAttachment, lastUpdated } =
    useDailyReport(dateStr);
  const { settings, invoices, updateInvoice } = useAppData();
  const { receipts: posReceipts, updateReceipt: updatePOSReceipt } = usePOSData();
  const [tab, setTab] = useState('today');
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [depositDialog, setDepositDialog] = useState<{ invoice: Invoice; amount: string } | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [showCashInDialog, setShowCashInDialog] = useState(false);
  const [showTransferInDialog, setShowTransferInDialog] = useState(false);
  const [posCatFilter, setPosCatFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const { currentShift, addCashIn } = useCashDrawer();

  const handleAddTransferIn = async (amount: number, description: string) => {
    if (!amount || amount <= 0 || !Number.isFinite(amount)) {
      toast.error('กรุณากรอกจำนวนเงินที่ถูกต้อง');
      return;
    }
    if (!description?.trim()) {
      toast.error('กรุณากรอกคำอธิบาย');
      return;
    }
    try {
      const { error } = await supabase.from('transactions').insert({
        type: 'income',
        category: 'เงินโอน',
        description: description || 'รับเงินโอน',
        amount,
        date: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success(`บันทึกเงินโอนเข้า ฿${amount.toLocaleString('th-TH')} แล้ว`);
      setShowTransferInDialog(false);
      await refreshSnapshot();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'ไม่ทราบสาเหตุ';
      toast.error(`บันทึกไม่สำเร็จ: ${msg}`);
    }
  };

  // Re-aggregate POS receipts → category according to filter
  const filteredByCategory = useMemo(() => {
    if (!snapshot?.sales?.receiptsDetailed) return snapshot?.sales?.byCategory || [];
    const isPaid = (s: string) => s === 'paid';
    const isUnpaid = (s: string) => s === 'pending' || s === 'deposit' || s === 'credit';
    const include = (s: string) => posCatFilter === 'all' || (posCatFilter === 'paid' ? isPaid(s) : isUnpaid(s));
    const map: Record<string, { itemCount: number; quantity: number; total: number; items: Record<string, { quantity: number; total: number }> }> = {};
    snapshot.sales.receiptsDetailed.forEach(r => {
      if (!include(r.status)) return;
      r.items.forEach(it => {
        const cat = it.category || 'อื่น ๆ';
        if (!map[cat]) map[cat] = { itemCount: 0, quantity: 0, total: 0, items: {} };
        map[cat].itemCount += 1;
        map[cat].quantity += it.quantity;
        map[cat].total += it.total;
        if (!map[cat].items[it.name]) map[cat].items[it.name] = { quantity: 0, total: 0 };
        map[cat].items[it.name].quantity += it.quantity;
        map[cat].items[it.name].total += it.total;
      });
    });
    return Object.entries(map)
      .map(([category, v]) => ({
        category,
        itemCount: v.itemCount,
        quantity: v.quantity,
        total: v.total,
        topItems: Object.entries(v.items).map(([name, x]) => ({ name, quantity: x.quantity, total: x.total })).sort((a, b) => b.total - a.total).slice(0, 3),
      }))
      .sort((a, b) => b.total - a.total);
  }, [snapshot?.sales?.receiptsDetailed, snapshot?.sales?.byCategory, posCatFilter]);

  const posCatFilterLabel = posCatFilter === 'all' ? '' : posCatFilter === 'paid' ? 'เฉพาะชำระแล้ว' : 'เฉพาะยังไม่จ่าย';

  const markSaving = (id: string, on: boolean) => {
    setSavingIds(prev => {
      const n = new Set(prev);
      if (on) n.add(id); else n.delete(id);
      return n;
    });
  };

  const applyStatusChange = async (invoice: Invoice, next: PaymentStatusKey, depositOverride?: number) => {
    markSaving(invoice.id, true);
    try {
      const { data: fresh, error: fetchError } = await supabase
        .from('invoices')
        .select('id, invoice_number, total, deposit, status')
        .eq('id', invoice.id)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!fresh) throw new Error('ไม่พบเอกสารในฐานข้อมูล');

      const total = Number(fresh.total) || Number(invoice.total) || 0;
      let newDeposit = Number(fresh.deposit) || Number(invoice.deposit) || 0;
      let newAmountDue: number;
      if (next === 'paid') {
        newAmountDue = 0;
      } else if (next === 'credit') {
        newAmountDue = total;
      } else if (next === 'deposit') {
        newDeposit = depositOverride ?? newDeposit;
        newAmountDue = Math.max(0, total - newDeposit);
      } else {
        newAmountDue = total;
        newDeposit = 0;
      }
      const prev = normalizePaymentStatus((fresh.status || invoice.status) as any);
      await updateInvoice(invoice.id, {
        status: next,
        amountDue: newAmountDue,
        deposit: newDeposit,
        paidAt: (next === 'paid' ? new Date() : null) as any,
        paymentMethod: next === 'credit' ? 'credit' : invoice.paymentMethod === 'credit' ? 'cash' : invoice.paymentMethod,
      });
      if (prev !== next) {
        await logStatusChange({
          docType: 'invoice', docId: invoice.id, docNumber: fresh.invoice_number || invoice.invoiceNumber,
          statusFrom: prev, statusTo: next,
        });
      }
      await refreshSnapshot();
      toast.success(`เปลี่ยนเป็น "${PAY_STATUS[next].label}"`);
    } catch (error) {
      console.error('applyStatusChange failed:', error);
      const message = error instanceof Error ? error.message : 'ไม่ทราบสาเหตุ';
      toast.error(`เปลี่ยนสถานะไม่สำเร็จ: ${message}`);
      throw error;
    } finally {
      markSaving(invoice.id, false);
    }
  };

  const handlePOSStatusChange = async (receipt: POSReceipt, next: PaymentStatusKey) => {
    markSaving(receipt.id, true);
    try {
      const { data: fresh, error: fetchError } = await supabase
        .from('pos_receipts')
        .select('id, receipt_number, payment_status')
        .eq('id', receipt.id)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!fresh) throw new Error('ไม่พบใบเสร็จในฐานข้อมูล');

      const prev = normalizePaymentStatus((fresh.payment_status || receipt.paymentStatus) as any);
      await updatePOSReceipt(receipt.id, {
        paymentStatus: next as POSPaymentStatus,
        paymentType: next === 'credit' ? 'credit' : receipt.paymentType === 'credit' ? 'cash' : receipt.paymentType,
      }, { silent: true });
      if (prev !== next) {
        await logStatusChange({
          docType: 'pos_receipt', docId: receipt.id, docNumber: fresh.receipt_number || receipt.receiptNumber,
          statusFrom: prev, statusTo: next,
        });
      }
      await refreshSnapshot();
      toast.success(`ใบเสร็จ ${fresh.receipt_number || receipt.receiptNumber} → "${PAY_STATUS[next].label}"`);
    } catch (error) {
      console.error('handlePOSStatusChange failed:', error);
      const message = error instanceof Error ? error.message : 'ไม่ทราบสาเหตุ';
      toast.error(`เปลี่ยนสถานะใบเสร็จไม่สำเร็จ: ${message}`);
      throw error;
    } finally {
      markSaving(receipt.id, false);
    }
  };

  const handleStatusChange = (invoice: Invoice, next: PaymentStatusKey) => {
    if (next === 'deposit') {
      setDepositDialog({
        invoice,
        amount: String(invoice.deposit && invoice.deposit > 0 ? invoice.deposit : Math.round(invoice.total / 2)),
      });
      return;
    }
    return applyStatusChange(invoice, next);
  };

  const confirmDeposit = async () => {
    if (!depositDialog) return;
    const amt = Number(depositDialog.amount) || 0;
    if (amt <= 0 || amt >= depositDialog.invoice.total) {
      toast.error('จำนวนเงินมัดจำต้องมากกว่า 0 และน้อยกว่ายอดรวม');
      return;
    }
    try {
      await applyStatusChange(depositDialog.invoice, 'deposit', amt);
      setDepositDialog(null);
    } catch {
      // applyStatusChange already reports the exact error.
    }
  };

  const handlePrintInvoiceByNumber = (number: string) => {
    const inv = invoices.find(i => i.invoiceNumber === number);
    if (!inv) {
      toast.error('ไม่พบเอกสาร ' + number);
      return;
    }
    setPreviewInvoice(inv);
  };

  const handlePrint = (snap: DailyReportSnapshot, date: string, n?: string, closedAt?: string | null, isDraft = false, opts?: { byCategoryOverride?: DailyReportSnapshot['sales']['byCategory']; categoryFilterLabel?: string }) => {
    try {
      printDailyReport({ date, shopName: settings.shopName, snapshot: snap, notes: n, closedAt, isDraft, byCategoryOverride: opts?.byCategoryOverride, categoryFilterLabel: opts?.categoryFilterLabel });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'พิมพ์ไม่สำเร็จ';
      toast.error(msg);
    }
  };

  const hasReportData = !!snapshot && (
    (snapshot.sales?.count || 0) > 0 ||
    (snapshot.invoices?.count || 0) > 0 ||
    (snapshot.expenses?.items?.length || 0) > 0 ||
    (snapshot.cashAdvances?.newCount || 0) > 0 ||
    (snapshot.paperWithdrawals?.count || 0) > 0 ||
    (snapshot.cashDrawer?.length || 0) > 0
  );

  const openAttachment = async (path: string, name?: string, download = false) => {
    const { data, error } = await supabase.storage.from('daily-report-attachments').createSignedUrl(path, 300);
    if (error || !data?.signedUrl) return toast.error('เปิดไฟล์ไม่สำเร็จ');
    if (download) {
      const a = document.createElement('a');
      a.href = data.signedUrl; a.download = name || 'attachment'; a.target = '_blank'; a.click();
    } else {
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    }
  };

  if (previewInvoice) {
    return (
      <InvoicePreviewNew
        invoice={previewInvoice}
        settings={settings}
        onClose={() => setPreviewInvoice(null)}
      />
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-4 w-full md:w-auto">
          <TabsTrigger value="today" className="gap-2"><FileText className="h-4 w-4" />รายวัน</TabsTrigger>
          <TabsTrigger value="period" className="gap-2"><BarChart3 className="h-4 w-4" />สรุปสัปดาห์/เดือน</TabsTrigger>
          <TabsTrigger value="status-history" className="gap-2"><Clock className="h-4 w-4" />ประวัติสถานะ</TabsTrigger>
          <TabsTrigger value="history" className="gap-2"><History className="h-4 w-4" />ประวัติรายงาน</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-4 flex flex-wrap items-center gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    {format(selectedDate, 'dd/MM/')}{selectedDate.getFullYear() + 543}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={selectedDate} onSelect={(d) => d && setSelectedDate(d)} initialFocus />
                </PopoverContent>
              </Popover>

              <Button variant="outline" size="sm" onClick={refreshSnapshot} disabled={loading} className="gap-2">
                <RefreshCcw className={cn('h-4 w-4', loading && 'animate-spin')} />รีเฟรช
              </Button>

              <Badge variant="outline" className="gap-1.5 border-green-500/40 text-green-700 bg-green-50 dark:bg-green-950/30">
                <Radio className="h-3 w-3 animate-pulse" />
                Live{lastUpdated ? ` • ${format(lastUpdated, 'HH:mm:ss')}` : ''}
              </Badge>

              {savedReport && (
                <Badge variant="default" className="gap-1">
                  <Save className="h-3 w-3" />บันทึกแล้ว ({format(new Date(savedReport.closed_at || savedReport.updated_at), 'HH:mm')})
                </Badge>
              )}

              <div className="ml-auto flex items-center gap-2">
                <Button onClick={() => snapshot && save()} disabled={!snapshot || saving} className="gap-2">
                  <Save className="h-4 w-4" />{saving ? 'กำลังบันทึก...' : (savedReport ? 'อัปเดต' : 'บันทึก')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!currentShift) {
                      toast.error('ยังไม่มีกะเปิดอยู่ — กรุณาเปิดกะที่หน้า POS ก่อน');
                      if (onPageChange) onPageChange('pos', { openCashDrawer: true });
                      return;
                    }
                    setShowCashInDialog(true);
                  }}
                  className="gap-2 border-green-500/40 text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30"
                  title={currentShift ? 'ใส่เงินสดเข้าลิ้นชักของกะปัจจุบัน' : 'ต้องเปิดกะก่อน'}
                >
                  <ArrowDownCircle className="h-4 w-4" />ใส่เงินสด
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowTransferInDialog(true)}
                  className="gap-2 border-blue-500/40 text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                  title="บันทึกรายรับเงินโอน"
                >
                  <ArrowDownCircle className="h-4 w-4" />ใส่เงินโอน
                </Button>
                {onPageChange && (
                  <Button
                    variant="outline"
                    onClick={() => onPageChange('pos', { openCashDrawer: true })}
                    className="gap-2"
                    title="ไปยังหน้า POS แล้วเปิดลิ้นชักเงินสด"
                  >
                    <Wallet className="h-4 w-4" />ลิ้นชักเงินสด
                  </Button>
                )}
                <div className="flex flex-col items-end">
                  <Button
                    variant="secondary"
                    onClick={() => snapshot && handlePrint(snapshot, dateStr, notes, savedReport?.closed_at, !savedReport, posCatFilter !== 'all' ? { byCategoryOverride: filteredByCategory, categoryFilterLabel: posCatFilterLabel } : undefined)}
                    disabled={!snapshot || !hasReportData}
                    title={!hasReportData ? 'ยังไม่มีข้อมูลให้พิมพ์' : (!savedReport ? 'พิมพ์ฉบับร่าง (ยังไม่ได้ปิดยอด)' : 'พิมพ์รายงาน A4')}
                    className="gap-2"
                  >
                    <Printer className="h-4 w-4" />พิมพ์รายงาน A4
                  </Button>
                  {snapshot && hasReportData && !savedReport && (
                    <span className="text-[10px] text-warning mt-0.5">(ฉบับร่าง · ยังไม่ปิดยอด)</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {!snapshot && loading && (
            <Card><CardContent className="p-8 text-center text-muted-foreground">กำลังโหลดข้อมูล...</CardContent></Card>
          )}

          {snapshot && (
            <>
              <SummaryRow snapshot={snapshot} />
              <SnapshotPreview
                snapshot={snapshot}
                invoicesAll={invoices}
                posReceiptsAll={posReceipts}
                onPrintInvoice={handlePrintInvoiceByNumber}
                onChangeStatus={handleStatusChange}
                onChangePOSStatus={handlePOSStatusChange}
                savingIds={savingIds}
                onOpenInvoice={onPageChange ? (id) => onPageChange('invoices', { previewInvoiceId: id }) : undefined}
                posCatFilter={posCatFilter}
                onPosCatFilterChange={setPosCatFilter}
                filteredByCategory={filteredByCategory}
              />
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">หมายเหตุประจำวัน</CardTitle></CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="บันทึกเหตุการณ์, ปัญหา, หรือข้อสังเกตของวัน..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Paperclip className="h-4 w-4" />ไฟล์แนบ ({savedReport?.attachments?.length || 0})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {savedReport?.attachments && savedReport.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {savedReport.attachments.map((a: DailyReportAttachment, i) => (
                        <div key={i} className="flex items-center gap-1 rounded-md border bg-muted/30 pl-2 pr-1 py-1">
                          <button onClick={() => openAttachment(a.path, a.name)} className="text-sm text-primary hover:underline truncate max-w-[200px]" title={a.name}>
                            {a.name}
                          </button>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openAttachment(a.path, a.name, true)} title="ดาวน์โหลด">
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeAttachment(a.path)} title="ลบ">
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <AttachmentInput
                    onFiles={(files) => uploadAttachments(files)}
                    scanFileBaseName={`daily-${dateStr}`}
                  />
                  {!savedReport && (
                    <p className="text-xs text-muted-foreground">หมายเหตุ: การแนบไฟล์จะบันทึกรายงานนี้โดยอัตโนมัติ</p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="period" className="mt-4">
          <PeriodSummary />
        </TabsContent>

        <TabsContent value="status-history" className="mt-4">
          <StatusHistoryPanel defaultDate={selectedDate} />
        </TabsContent>

        <TabsContent value="history" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">ประวัติรายงาน ({history.length} วัน)</CardTitle></CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <div className="text-center text-muted-foreground py-8 flex flex-col items-center gap-2">
                  <AlertCircle className="h-8 w-8 opacity-50" />
                  ยังไม่มีรายงานที่บันทึก
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>วันที่</TableHead>
                        <TableHead className="text-right">ยอดขาย</TableHead>
                        <TableHead className="text-right">รายจ่าย</TableHead>
                        <TableHead className="text-right">เบิก</TableHead>
                        <TableHead>หมายเหตุ</TableHead>
                        <TableHead className="text-right">การจัดการ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map(h => {
                        const snap = h.snapshot;
                        return (
                          <TableRow key={h.id}>
                            <TableCell className="font-medium">
                              {(() => { const d = new Date(`${h.report_date}T00:00:00`); return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543}`; })()}
                            </TableCell>
                            <TableCell className="text-right">{fmt(snap?.sales?.total || 0)}</TableCell>
                            <TableCell className="text-right text-destructive">{fmt(snap?.expenses?.total || 0)}</TableCell>
                            <TableCell className="text-right text-orange-600">{fmt(snap?.cashAdvances?.newAmount || 0)}</TableCell>
                            <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{h.notes || '-'}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="ghost" onClick={() => { setSelectedDate(new Date(`${h.report_date}T00:00:00`)); setTab('today'); }}>
                                  <FileText className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => handlePrint(snap, h.report_date, h.notes || undefined, h.closed_at)}>
                                  <Printer className="h-4 w-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>ลบรายงานวันที่ {h.report_date}?</AlertDialogTitle>
                                      <AlertDialogDescription>จะไม่กระทบต่อข้อมูลต้นทาง (ยอดขาย, รายจ่าย ฯลฯ) แต่จะลบ snapshot และหมายเหตุของรายงานนี้</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => remove(h.id)}>ลบ</AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!depositDialog} onOpenChange={(o) => !o && setDepositDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>กรอกจำนวนเงินมัดจำ</AlertDialogTitle>
            <AlertDialogDescription>
              บิล {depositDialog?.invoice.invoiceNumber} • ยอดรวม {fmt(depositDialog?.invoice.total || 0)} ฿
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            type="number"
            value={depositDialog?.amount || ''}
            onChange={(e) => setDepositDialog(d => d ? { ...d, amount: e.target.value } : null)}
            placeholder="จำนวนเงินมัดจำ"
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeposit}>บันทึก</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CashDrawerTransaction
        open={showCashInDialog}
        onOpenChange={setShowCashInDialog}
        type="cash_in"
        onConfirm={async (amount, description) => {
          const ok = await addCashIn(amount, description);
          if (ok) {
            setShowCashInDialog(false);
            await refreshSnapshot();
          }
        }}
      />

      <CashDrawerTransaction
        open={showTransferInDialog}
        onOpenChange={setShowTransferInDialog}
        type="transfer_in"
        onConfirm={handleAddTransferIn}
      />
    </div>
  );
}
