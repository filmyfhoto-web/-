import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { supabase } from '@/film-shop/lib/supabase';
import { useCashDrawer } from '@/film-shop/hooks/useCashDrawer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { Calendar as CalendarIcon, Plus, Wallet, Receipt, Download, Trash2, CheckCircle2, Paperclip, AlertCircle, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRealtimeTable } from '@/film-shop/hooks/useRealtimeTable';
import { AttachmentInput } from '@/film-shop/components/scanner/AttachmentInput';
import { useAppData } from '@/film-shop/hooks/useAppData';
import { printCashAdvanceReport } from '@/film-shop/utils/dailyListPrint';

type Borrower = 'employee' | 'other';
type Status = 'open' | 'partial' | 'settled' | 'cancelled';

interface CashAdvance {
  id: string;
  borrower_type: Borrower;
  employee_id: string | null;
  borrower_name: string;
  purpose: string;
  amount: number;
  paid_amount: number;
  status: Status;
  borrowed_at: string;
  due_date: string | null;
  shift_id: string | null;
  attachments: { name: string; path: string }[];
  expense_category: string | null;
  notes: string | null;
  created_at: string;
}

interface Repayment {
  id: string;
  advance_id: string;
  amount: number;
  repaid_at: string;
  notes: string | null;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);

const STATUS_LABELS: Record<Status, string> = {
  open: 'ค้างชำระ',
  partial: 'คืนบางส่วน',
  settled: 'ปิดยอดแล้ว',
  cancelled: 'ยกเลิก',
};

const STATUS_VARIANTS: Record<Status, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  open: 'destructive',
  partial: 'secondary',
  settled: 'default',
  cancelled: 'outline',
};

const EXPENSE_CATEGORIES = ['ค่าวัสดุ', 'ค่าเดินทาง/ค่าน้ำมัน', 'ค่าส่งของ', 'ค่าอาหาร/รับรอง', 'ค่าซ่อมบำรุง', 'อื่นๆ'];

export function CashAdvanceManager() {
  const { currentShift, addCashOut, addCashIn } = useCashDrawer();
  const { settings } = useAppData();
  const [advances, setAdvances] = useState<CashAdvance[]>([]);
  const [repayments, setRepayments] = useState<Repayment[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const today = new Date();
  const [printFrom, setPrintFrom] = useState<Date>(today);
  const [printTo, setPrintTo] = useState<Date>(today);

  const handlePrintReport = () => {
    const fromKey = format(printFrom, 'yyyy-MM-dd');
    const toKey = format(printTo, 'yyyy-MM-dd');
    const filtered = advances
      .filter(a => {
        const k = format(new Date(a.borrowed_at), 'yyyy-MM-dd');
        return k >= fromKey && k <= toKey;
      })
      .sort((a, b) => new Date(a.borrowed_at).getTime() - new Date(b.borrowed_at).getTime());
    printCashAdvanceReport({
      shopName: settings.shopName,
      from: fromKey,
      to: toKey,
      rows: filtered.map(a => ({
        borrowed_at: a.borrowed_at,
        borrower_name: a.borrower_name,
        purpose: a.purpose,
        status: a.status,
        amount: Number(a.amount) || 0,
        paid_amount: Number(a.paid_amount) || 0,
        expense_category: a.expense_category,
      })),
    });
  };


  const [createOpen, setCreateOpen] = useState(false);
  const [repayOpen, setRepayOpen] = useState(false);
  const [settleConfirm, setSettleConfirm] = useState<CashAdvance | null>(null);
  const [activeAdvance, setActiveAdvance] = useState<CashAdvance | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    const [a, r, e] = await Promise.all([
      supabase.from('cash_advances').select('*').is('deleted_at', null).order('borrowed_at', { ascending: false }),
      supabase.from('cash_advance_repayments').select('*').is('deleted_at', null).order('repaid_at', { ascending: false }),
      supabase.from('employees').select('id,name').eq('is_active', true).order('name'),
    ]);
    if (a.error) toast.error('โหลดรายการยืมไม่สำเร็จ: ' + a.error.message);
    if (r.error) toast.error('โหลดประวัติคืนไม่สำเร็จ: ' + r.error.message);
    if (a.data) setAdvances(a.data as any);
    if (r.data) setRepayments(r.data as any);
    if (e.data) setEmployees(e.data as any);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  useRealtimeTable(['cash_advances', 'cash_advance_repayments'], () => { fetchAll(); });

  const totals = useMemo(() => {
    const now = new Date();
    const thisMonth = advances.filter(a => {
      const d = new Date(a.borrowed_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    return {
      outstanding: advances.reduce((s, a) => s + (a.status === 'open' || a.status === 'partial' ? a.amount - a.paid_amount : 0), 0),
      openCount: advances.filter(a => a.status === 'open' || a.status === 'partial').length,
      monthAmount: thisMonth.reduce((s, a) => s + a.amount, 0),
    };
  }, [advances]);

  const filtered = useMemo(() => {
    if (filterStatus === 'all') return advances;
    return advances.filter(a => a.status === filterStatus);
  }, [advances, filterStatus]);

  const downloadAttachment = async (path: string, name: string) => {
    const { data, error } = await supabase.storage.from('cash-advance-attachments').createSignedUrl(path, 60);
    if (error || !data) return toast.error('ดาวน์โหลดล้มเหลว');
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = name;
    a.target = '_blank';
    a.click();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>ยอดค้างชำระรวม</CardDescription>
            <CardTitle className="text-3xl text-destructive">฿{fmt(totals.outstanding)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>รายการที่ยังเปิดอยู่</CardDescription>
            <CardTitle className="text-3xl">{totals.openCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>ยืมในเดือนนี้</CardDescription>
            <CardTitle className="text-3xl text-primary">฿{fmt(totals.monthAmount)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {!currentShift && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">ยังไม่ได้เปิดกะลิ้นชัก</p>
            <p className="text-xs">รายการยืม/คืนจะถูกบันทึก แต่จะไม่ตัดยอดออกจากลิ้นชักเงินสดของกะปัจจุบัน</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                รายการยืมเงินจากคลัง
              </CardTitle>
              <CardDescription>บันทึกการยืมเงินสดออกจากร้านเพื่อจ่ายค่าของ พร้อมแนบใบเสร็จ</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="font-normal">
                    <CalendarIcon className="h-4 w-4 mr-1" />{format(printFrom, 'dd/MM/yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar mode="single" selected={printFrom} onSelect={(d) => d && setPrintFrom(d)} initialFocus className={cn('p-3 pointer-events-auto')} />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-muted-foreground">ถึง</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="font-normal">
                    <CalendarIcon className="h-4 w-4 mr-1" />{format(printTo, 'dd/MM/yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar mode="single" selected={printTo} onSelect={(d) => d && setPrintTo(d)} initialFocus className={cn('p-3 pointer-events-auto')} />
                </PopoverContent>
              </Popover>
              <Button variant="outline" size="sm" onClick={handlePrintReport}>
                <Printer className="h-4 w-4 mr-1" />พิมพ์รายงาน
              </Button>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทุกสถานะ</SelectItem>
                  <SelectItem value="open">ค้างชำระ</SelectItem>
                  <SelectItem value="partial">คืนบางส่วน</SelectItem>
                  <SelectItem value="settled">ปิดยอดแล้ว</SelectItem>
                  <SelectItem value="cancelled">ยกเลิก</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> ยืมใหม่
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Desktop table */}
          <div className="rounded-lg border overflow-x-auto hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>วันที่</TableHead>
                  <TableHead>ผู้ยืม</TableHead>
                  <TableHead>วัตถุประสงค์</TableHead>
                  <TableHead>หมวด</TableHead>
                  <TableHead className="text-right">ยอด</TableHead>
                  <TableHead className="text-right">คืนแล้ว</TableHead>
                  <TableHead className="text-right">คงเหลือ</TableHead>
                  <TableHead className="text-center">สถานะ</TableHead>
                  <TableHead className="text-center">ไฟล์</TableHead>
                  <TableHead className="text-right">การจัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">กำลังโหลด...</TableCell></TableRow>
                )}
                {!loading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">ไม่มีรายการ</TableCell></TableRow>
                )}
                {filtered.map(a => {
                  const remaining = a.amount - a.paid_amount;
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {format(new Date(a.borrowed_at), 'dd/MM/yyyy', { locale: th })}
                      </TableCell>
                      <TableCell>{a.borrower_name}</TableCell>
                      <TableCell className="max-w-xs truncate">{a.purpose}</TableCell>
                      <TableCell className="text-xs">{a.expense_category || '-'}</TableCell>
                      <TableCell className="text-right">฿{fmt(a.amount)}</TableCell>
                      <TableCell className="text-right text-emerald-600">฿{fmt(a.paid_amount)}</TableCell>
                      <TableCell className="text-right font-semibold">฿{fmt(remaining)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={STATUS_VARIANTS[a.status]}>{STATUS_LABELS[a.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {a.attachments && a.attachments.length > 0 ? (
                          <div className="flex justify-center gap-1">
                            {a.attachments.map((f, i) => (
                              <Button key={i} size="icon-sm" variant="ghost" onClick={() => downloadAttachment(f.path, f.name)} title={f.name}>
                                <Paperclip className="h-3.5 w-3.5" />
                              </Button>
                            ))}
                          </div>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {(a.status === 'open' || a.status === 'partial') && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => { setActiveAdvance(a); setRepayOpen(true); }}>
                                <Receipt className="h-3.5 w-3.5" /> คืน
                              </Button>
                              <Button size="sm" variant="secondary" onClick={() => setSettleConfirm(a)}>
                                <CheckCircle2 className="h-3.5 w-3.5" /> ปิดเป็นค่าใช้จ่าย
                              </Button>
                            </>
                          )}
                          <DeleteButton id={a.id} onDeleted={fetchAll} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile card list */}
          <div className="space-y-2 md:hidden">
            {loading && <div className="text-center text-muted-foreground py-8 text-sm">กำลังโหลด...</div>}
            {!loading && filtered.length === 0 && <div className="text-center text-muted-foreground py-8 text-sm">ไม่มีรายการ</div>}
            {filtered.map(a => {
              const remaining = a.amount - a.paid_amount;
              return (
                <div key={a.id} className="rounded-lg border bg-card p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{a.borrower_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{a.purpose}</p>
                    </div>
                    <Badge variant={STATUS_VARIANTS[a.status]} className="shrink-0">{STATUS_LABELS[a.status]}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">ยอด</p>
                      <p className="font-medium">฿{fmt(a.amount)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">คืนแล้ว</p>
                      <p className="font-medium text-emerald-600">฿{fmt(a.paid_amount)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">คงเหลือ</p>
                      <p className="font-bold text-destructive">฿{fmt(remaining)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{format(new Date(a.borrowed_at), 'dd/MM/yyyy', { locale: th })}</span>
                    {a.expense_category && <span>{a.expense_category}</span>}
                  </div>
                  {a.attachments?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {a.attachments.map((f, i) => (
                        <Button key={i} size="sm" variant="outline" onClick={() => downloadAttachment(f.path, f.name)} className="h-7 text-xs">
                          <Paperclip className="h-3 w-3 mr-1" /> {f.name.length > 14 ? f.name.slice(0, 14) + '…' : f.name}
                        </Button>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(a.status === 'open' || a.status === 'partial') && (
                      <>
                        <Button size="sm" variant="outline" className="flex-1 min-w-[100px]" onClick={() => { setActiveAdvance(a); setRepayOpen(true); }}>
                          <Receipt className="h-3.5 w-3.5 mr-1" /> คืนเงิน
                        </Button>
                        <Button size="sm" variant="secondary" className="flex-1 min-w-[100px]" onClick={() => setSettleConfirm(a)}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> ปิดยอด
                        </Button>
                      </>
                    )}
                    <DeleteButton id={a.id} onDeleted={fetchAll} />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <CreateAdvanceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        employees={employees}
        currentShiftId={currentShift?.id || null}
        onCreated={async (amount, description) => {
          if (currentShift) await addCashOut(amount, `ยืม: ${description}`);
          await fetchAll();
        }}
      />

      <RepayDialog
        open={repayOpen}
        onOpenChange={setRepayOpen}
        advance={activeAdvance}
        repayments={repayments.filter(r => r.advance_id === activeAdvance?.id)}
        currentShiftId={currentShift?.id || null}
        onRepaid={async (amount, advance) => {
          if (currentShift) await addCashIn(amount, `คืนยืม: ${advance.borrower_name}`);
          await fetchAll();
        }}
      />

      <AlertDialog open={!!settleConfirm} onOpenChange={(o) => !o && setSettleConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ปิดเป็นค่าใช้จ่าย</AlertDialogTitle>
            <AlertDialogDescription>
              ยอดคงเหลือจะถูกตัดเป็นค่าใช้จ่ายในบัญชีรายรับรายจ่าย หมวด "{settleConfirm?.expense_category || 'อื่นๆ'}" และรายการนี้จะถูกปิด
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!settleConfirm) return;
                const remaining = settleConfirm.amount - settleConfirm.paid_amount;
                const { error: txErr } = await supabase.from('transactions').insert({
                  type: 'expense',
                  category: settleConfirm.expense_category || 'อื่นๆ',
                  description: `ยืมเงินคลัง: ${settleConfirm.borrower_name} - ${settleConfirm.purpose}`,
                  amount: settleConfirm.amount,
                  date: settleConfirm.borrowed_at,
                });
                if (txErr) { toast.error('สร้างรายการค่าใช้จ่ายล้มเหลว'); return; }
                await supabase.from('cash_advances').update({ status: 'settled', paid_amount: settleConfirm.amount, notes: `${settleConfirm.notes || ''}\n[ปิดเป็นค่าใช้จ่าย ${fmt(remaining)} บาท]`.trim() }).eq('id', settleConfirm.id);
                toast.success('ปิดยอดและตัดเป็นค่าใช้จ่ายเรียบร้อย');
                setSettleConfirm(null);
                fetchAll();
              }}
            >ยืนยัน</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DeleteButton({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="icon-sm" variant="ghost" onClick={() => setOpen(true)}>
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ย้ายรายการนี้ไปถังขยะ?</AlertDialogTitle>
            <AlertDialogDescription>รายการจะถูกซ่อนแต่ยังเก็บไว้ในระบบ ไม่ถูกลบถาวร และจะไม่ย้อนรายการในลิ้นชักเงินสดที่เคยบันทึก</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={async () => {
                const { error } = await supabase.from('cash_advances').update({ deleted_at: new Date().toISOString() }).eq('id', id);
                if (error) { toast.error('ลบไม่สำเร็จ: ' + error.message); return; }
                toast.success('ย้ายไปถังขยะแล้ว');
                setOpen(false);
                onDeleted();
              }}
            >ลบ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CreateAdvanceDialog({
  open, onOpenChange, employees, currentShiftId, onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employees: { id: string; name: string }[];
  currentShiftId: string | null;
  onCreated: (amount: number, description: string) => Promise<void>;
}) {
  const [borrowerType, setBorrowerType] = useState<Borrower>('employee');
  const [employeeId, setEmployeeId] = useState<string>('');
  const [borrowerName, setBorrowerName] = useState('');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('ค่าวัสดุ');
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setBorrowerType('employee'); setEmployeeId(''); setBorrowerName('');
    setAmount(''); setPurpose(''); setExpenseCategory('ค่าวัสดุ');
    setDueDate(undefined); setNotes(''); setFiles([]);
  };

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error('กรุณากรอกยอดที่ยืม');
    if (!purpose.trim()) return toast.error('กรุณากรอกวัตถุประสงค์');
    const finalName = borrowerType === 'employee' ? (employees.find(e => e.id === employeeId)?.name || '') : borrowerName.trim();
    if (!finalName) return toast.error('กรุณาระบุผู้ยืม');

    setSaving(true);
    try {
      const attachments: { name: string; path: string }[] = [];
      for (const f of files) {
        const path = `${Date.now()}-${f.name}`;
        const { error: upErr } = await supabase.storage.from('cash-advance-attachments').upload(path, f);
        if (upErr) throw upErr;
        attachments.push({ name: f.name, path });
      }

      const { error } = await supabase.from('cash_advances').insert({
        borrower_type: borrowerType,
        employee_id: borrowerType === 'employee' ? employeeId || null : null,
        borrower_name: finalName,
        amount: amt,
        purpose: purpose.trim(),
        expense_category: expenseCategory,
        due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : null,
        notes: notes.trim() || null,
        attachments,
        shift_id: currentShiftId,
        status: 'open',
      });
      if (error) throw error;

      await onCreated(amt, `${finalName} - ${purpose.trim()}`);
      toast.success('บันทึกการยืมเงินเรียบร้อย');
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error('บันทึกล้มเหลว: ' + (e.message || ''));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>ยืมเงินจากคลัง</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>ประเภทผู้ยืม</Label>
            <Select value={borrowerType} onValueChange={(v) => setBorrowerType(v as Borrower)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">พนักงาน</SelectItem>
                <SelectItem value="other">อื่นๆ (พิมพ์ชื่อเอง)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {borrowerType === 'employee' ? (
            <div>
              <Label>เลือกพนักงาน</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger><SelectValue placeholder="เลือก..." /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <Label>ชื่อผู้ยืม</Label>
              <Input value={borrowerName} onChange={(e) => setBorrowerName(e.target.value)} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>ยอด (บาท)</Label>
              <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label>หมวดค่าใช้จ่าย</Label>
              <Select value={expenseCategory} onValueChange={setExpenseCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>วัตถุประสงค์</Label>
            <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="ซื้อหมึกพิมพ์, ค่าส่งของ..." />
          </div>

          <div>
            <Label>กำหนดคืน (ไม่บังคับ)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn('w-full justify-start font-normal', !dueDate && 'text-muted-foreground')}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dueDate ? format(dueDate, 'dd/MM/yyyy', { locale: th }) : 'เลือกวันที่'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dueDate} onSelect={setDueDate} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label>หมายเหตุ</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div>
            <Label>แนบไฟล์ใบเสร็จ/รูปภาพ</Label>
            <AttachmentInput
              onFiles={(fs) => setFiles((prev) => [...prev, ...fs])}
              accept="image/*,.pdf"
              scanFileBaseName="cash-advance-receipt"
            />
            {files.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">{files.length} ไฟล์ที่เลือก</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RepayDialog({
  open, onOpenChange, advance, repayments, currentShiftId, onRepaid,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  advance: CashAdvance | null;
  repayments: Repayment[];
  currentShiftId: string | null;
  onRepaid: (amount: number, advance: CashAdvance) => Promise<void>;
}) {
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open && advance) { setAmount(String(advance.amount - advance.paid_amount)); setNotes(''); } }, [open, advance]);

  if (!advance) return null;
  const remaining = advance.amount - advance.paid_amount;

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error('กรุณากรอกยอดคืน');
    if (amt > remaining) return toast.error('ยอดคืนเกินยอดค้างชำระ');

    setSaving(true);
    try {
      const { error: rErr } = await supabase.from('cash_advance_repayments').insert({
        advance_id: advance.id,
        amount: amt,
        notes: notes.trim() || null,
        shift_id: currentShiftId,
      });
      if (rErr) throw rErr;

      const newPaid = advance.paid_amount + amt;
      const newStatus: Status = newPaid >= advance.amount ? 'settled' : 'partial';
      await supabase.from('cash_advances').update({ paid_amount: newPaid, status: newStatus }).eq('id', advance.id);

      await onRepaid(amt, advance);
      toast.success('บันทึกการคืนเงินเรียบร้อย');
      onOpenChange(false);
    } catch (e: any) {
      toast.error('บันทึกล้มเหลว: ' + (e.message || ''));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>บันทึกการคืนเงิน</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
            <p><span className="text-muted-foreground">ผู้ยืม:</span> <strong>{advance.borrower_name}</strong></p>
            <p><span className="text-muted-foreground">ยอดยืม:</span> ฿{fmt(advance.amount)}</p>
            <p><span className="text-muted-foreground">คืนแล้ว:</span> <span className="text-emerald-600">฿{fmt(advance.paid_amount)}</span></p>
            <p><span className="text-muted-foreground">คงเหลือ:</span> <strong className="text-destructive">฿{fmt(remaining)}</strong></p>
          </div>
          <div>
            <Label>ยอดที่คืน</Label>
            <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>หมายเหตุ</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {repayments.length > 0 && (
            <div className="space-y-1">
              <Label>ประวัติการคืน</Label>
              <div className="rounded-lg border max-h-40 overflow-y-auto divide-y text-xs">
                {repayments.map(r => (
                  <div key={r.id} className="flex justify-between p-2">
                    <span>{format(new Date(r.repaid_at), 'dd/MM/yyyy HH:mm', { locale: th })}</span>
                    <span className="font-semibold">฿{fmt(r.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
