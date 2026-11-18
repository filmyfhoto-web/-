import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAppData } from '@/film-shop/hooks/useAppData';
import { useUserRole } from '@/film-shop/hooks/useUserRole';
import { Invoice } from '@/film-shop/types';
import { supabase } from '@/film-shop/lib/supabase';
import { FileText, Plus, Search, Eye, Printer, Trash2, MessageCircle, CheckCircle2, Wallet, Loader2, ClipboardPaste, ImageDown, FileDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InvoiceForm } from './InvoiceForm';
import { QuickDocPage } from '@/film-shop/components/quickdoc/QuickDocPage';
import { InvoicePreviewNew } from './InvoicePreviewNew';
import type { PaperSize } from '@/film-shop/components/print/DocumentPrintPreview';
import { DeleteReceiptDialog } from '@/film-shop/components/pos/DeleteReceiptDialog';
import { toast } from 'sonner';
import { PAY_STATUS, normalizePaymentStatus, type PaymentStatusKey } from '@/film-shop/utils/paymentStatus';
import { cn } from '@/lib/utils';
import { logStatusChange } from '@/film-shop/utils/paymentStatusHistory';
import { DocSnapshot } from '@/film-shop/components/documents/DocSnapshot';
import { downloadDocImage, downloadDocPdf } from '@/film-shop/lib/voiceDocDownload';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (date: Date) => {
  return new Date(date).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const typeLabels = {
  quotation: 'ใบเสนอราคา',
  invoice: 'ใบวางบิล/ส่งของ',
  receipt: 'ใบเสร็จรับเงิน',
};

export function InvoiceManager({
  initialPreviewInvoiceId,
  headingLabel,
}: {
  initialPreviewInvoiceId?: string;
  /** Optional override for the card title (used by wrapper pages). */
  headingLabel?: string;
} = {}) {
  const { invoices, deleteInvoice, updateInvoice, settings, addInvoice, generateInvoiceNumber, refetch } = useAppData() as any;
  const { isAdmin, isStaff } = useUserRole();
  // Any authenticated Film Shop operator may delete a document. RLS on
  // film_invoices already enforces the actual server-side permission —
  // hiding the button behind an app_role lookup just made the UI unusable
  // for accounts that never got a row in user_roles.
  const canDeleteDocuments = true;
  void isAdmin; void isStaff;
  const RECEIPT_PAPER_KEY = 'filmshop_receipt_default_paper';
  const RECEIPT_10x7_PREFS_KEY = 'film_shop_receipt_10x7_prefs_v1';
  const [receiptDefaultPaper, setReceiptDefaultPaper] = useState<PaperSize | null>(() => {
    if (typeof window === 'undefined') return null;
    const v = window.localStorage.getItem(RECEIPT_PAPER_KEY);
    return v === '100x70' || v === '100x75' ? (v as PaperSize) : null;
  });
  const toggleReceiptPaper = () => {
    setReceiptDefaultPaper((prev) => {
      // Cycle: none → 100×75 (Gprinter GP-1324D, landscape) → 100×70 → none
      const next: PaperSize | null =
        prev == null ? '100x75' : prev === '100x75' ? '100x70' : null;
      try {
        if (next) window.localStorage.setItem(RECEIPT_PAPER_KEY, next);
        else window.localStorage.removeItem(RECEIPT_PAPER_KEY);
        // When switching to Gprinter GP-1324D preset, seed slip prefs
        // (landscape + fit + 2mm margins) so first print lines up.
        if (next === '100x75') {
          window.localStorage.setItem(
            RECEIPT_10x7_PREFS_KEY,
            JSON.stringify({
              orientation: 'landscape',
              fitMode: 'fit',
              margins: { top: 2, right: 2, bottom: 2, left: 2 },
            }),
          );
        }
      } catch { /* noop */ }
      toast.success(
        next === '100x75'
          ? 'ตั้งค่าใบเสร็จเป็น 10×7.5 ซม. แนวนอน (Gprinter GP-1324D)'
          : next === '100x70'
            ? 'ตั้งค่าใบเสร็จเป็นขนาด 10×7 ซม. แล้ว'
            : 'คืนค่าใบเสร็จเป็น A4',
      );
      return next;
    });
  };
  const [searchTerm, setSearchTerm] = useState('');
  // Film Shop = ใบเสร็จรับเงินเท่านั้น
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showDrafts, setShowDrafts] = useState<boolean>(false);
  const [showForm, setShowForm] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [depositDialog, setDepositDialog] = useState<{ invoice: Invoice; amount: string } | null>(null);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [isDeletingInvoice, setIsDeletingInvoice] = useState(false);
  const [savingStatusIds, setSavingStatusIds] = useState<Set<string>>(new Set());
  const [lineDialogOpen, setLineDialogOpen] = useState(false);
  const [linePasteText, setLinePasteText] = useState('');
  const [linePasteBusy, setLinePasteBusy] = useState(false);
  /** Set when the form was saved with "บันทึกและพิมพ์" — opens the print preview
   *  as soon as the freshly saved document shows up in the list. */
  const [pendingPrint, setPendingPrint] = useState<{ id?: string; invoiceNumber: string } | null>(null);
  /** เอกสารที่กำลังบันทึกเป็น PNG / PDF (เรนเดอร์ซ่อนไว้นอกจอ) */
  const [exportTarget, setExportTarget] = useState<{ invoice: Invoice; kind: 'png' | 'pdf' } | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportTarget) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const el = exportRef.current;
      if (!el || cancelled) return;
      try {
        if (exportTarget.kind === 'png') await downloadDocImage(el, exportTarget.invoice.invoiceNumber);
        else await downloadDocPdf(el, exportTarget.invoice.invoiceNumber);
        toast.success(`บันทึก ${exportTarget.invoice.invoiceNumber} เป็น ${exportTarget.kind.toUpperCase()} แล้ว`);
      } catch (e: any) {
        toast.error(`บันทึกไฟล์ไม่สำเร็จ: ${e?.message || 'error'}`);
      } finally {
        if (!cancelled) setExportTarget(null);
      }
    }, 80);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [exportTarget]);

  useEffect(() => {
    if (!pendingPrint) return;
    const inv = invoices.find(
      (i: Invoice) => (pendingPrint.id && i.id === pendingPrint.id) || i.invoiceNumber === pendingPrint.invoiceNumber,
    );
    if (inv) {
      setPreviewInvoice(inv);
      setPendingPrint(null);
    }
  }, [pendingPrint, invoices]);

  // Auto-open preview when navigated with an invoice id (fallback to DB fetch)
  useEffect(() => {
    if (!initialPreviewInvoiceId) return;
    const inv = invoices.find(i => i.id === initialPreviewInvoiceId);
    if (inv) {
      setPreviewInvoice(inv);
      return;
    }
    // Fallback: fetch directly when not in current list (filtered out / not loaded yet)
    let cancelled = false;
    (async () => {
      const { supabase } = await import('@/film-shop/lib/supabase');
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', initialPreviewInvoiceId)
        .maybeSingle();
      if (cancelled || error || !data) return;
      const mapped: Invoice = {
        id: data.id,
        invoiceNumber: data.invoice_number,
        type: data.type as Invoice['type'],
        customerId: data.customer_id || undefined,
        customerName: data.customer_name || '-',
        customerTaxId: data.customer_tax_id || undefined,
        customerBranch: (data as any).customer_branch || undefined,
        customerPhone: data.customer_phone || undefined,
        customerAddress: data.customer_address || undefined,
        items: (data.items as any) || [],
        subtotal: Number(data.subtotal) || 0,
        deposit: Number(data.deposit) || 0,
        discount: Number(data.discount) || 0,
        total: Number(data.total) || 0,
        amountDue: Number(data.amount_due) || 0,
        status: (data.status as any) || 'pending',
        jobStatus: (data.job_status as any) || 'pending',
        paymentMethod: (data.payment_method as any) || undefined,
        paidAt: data.paid_at ? new Date(data.paid_at) : undefined,
        dueDate: data.due_date ? new Date(data.due_date) : undefined,
        notes: data.notes || undefined,
        salesPerson: data.sales_person || undefined,
        referenceDoc: data.reference_doc || undefined,
        attachments: (data.attachments as any) || [],
        documentDate: data.document_date ? new Date(data.document_date) : undefined,
        createdAt: new Date(data.created_at),
        isDraft: !!data.is_draft,
      };
      setPreviewInvoice(mapped);
    })();
    return () => { cancelled = true; };
  }, [initialPreviewInvoiceId, invoices]);

  const draftCount = invoices.filter(i => i.isDraft).length;

  const applyStatusChange = async (invoice: Invoice, next: PaymentStatusKey, depositOverride?: number): Promise<boolean> => {
    if (savingStatusIds.has(invoice.id)) return false;
    setSavingStatusIds(prev => new Set(prev).add(invoice.id));
    let newDeposit = invoice.deposit || 0;
    let newAmountDue: number;
    if (next === 'paid') {
      newAmountDue = 0;
    } else if (next === 'credit') {
      newAmountDue = invoice.total;
    } else if (next === 'deposit') {
      newDeposit = depositOverride ?? invoice.deposit ?? 0;
      newAmountDue = Math.max(0, invoice.total - newDeposit);
    } else {
      newAmountDue = invoice.total;
      newDeposit = 0;
    }
    try {
      await updateInvoice(invoice.id, {
        status: next,
        amountDue: newAmountDue,
        deposit: newDeposit,
        paidAt: (next === 'paid' ? new Date() : null) as any,
        paymentMethod: next === 'credit' ? 'credit' : invoice.paymentMethod === 'credit' ? 'cash' : invoice.paymentMethod,
      });
      // Audit trail — best-effort, never blocks UI.
      try {
        await logStatusChange({
          docType: 'invoice',
          docId: invoice.id,
          docNumber: invoice.invoiceNumber,
          statusFrom: invoice.status || null,
          statusTo: next,
          notes: `เปลี่ยนสถานะการชำระ (${typeLabels[invoice.type]})`,
        });
      } catch {}
      toast.success(`${invoice.invoiceNumber} → ${PAY_STATUS[next].label}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ไม่ทราบสาเหตุ';
      toast.error(`บันทึกสถานะ ${invoice.invoiceNumber} ไม่สำเร็จ: ${message}`);
      return false;
    } finally {
      setSavingStatusIds(prev => {
        const nextIds = new Set(prev);
        nextIds.delete(invoice.id);
        return nextIds;
      });
    }
  };

  const handleStatusSelect = (invoice: Invoice, next: PaymentStatusKey) => {
    if (next === 'deposit') {
      setDepositDialog({
        invoice,
        amount: String(invoice.deposit && invoice.deposit > 0 ? invoice.deposit : Math.round(invoice.total / 2)),
      });
      return;
    }
    void applyStatusChange(invoice, next);
  };

  const confirmDeposit = async () => {
    if (!depositDialog) return;
    const amt = Number(depositDialog.amount) || 0;
    if (amt <= 0 || amt >= depositDialog.invoice.total) {
      toast.error('จำนวนเงินมัดจำต้องมากกว่า 0 และน้อยกว่ายอดรวม');
      return;
    }
    const ok = await applyStatusChange(depositDialog.invoice, 'deposit', amt);
    if (ok) setDepositDialog(null);
  };

  // หน้านี้แสดงเฉพาะใบเสร็จรับเงินเท่านั้น
  const scopedInvoices = (invoices as Invoice[]).filter((i) => i.type === 'receipt');

  const filteredInvoices = scopedInvoices.filter(invoice => {
    const matchesSearch = invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.customerName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = true;
    const matchesStatus = statusFilter === 'all' || normalizePaymentStatus(invoice.status) === statusFilter;
    const matchesDraft = showDrafts ? invoice.isDraft : !invoice.isDraft;
    return matchesSearch && matchesType && matchesStatus && matchesDraft;
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const receiptTotal = scopedInvoices.filter(i => i.type === 'receipt').reduce((s, i) => s + i.total, 0);
  const unpaidCount = scopedInvoices.filter(i => i.amountDue > 0).length;

  const handleDelete = (invoice: Invoice) => {
    if (!canDeleteDocuments) {
      toast.error('ไม่มีสิทธิ์ลบเอกสาร เฉพาะแอดมินหรือพนักงานเท่านั้น');
      return;
    }
    setInvoiceToDelete(invoice);
  };

  const confirmDeleteInvoice = async () => {
    if (!invoiceToDelete || !canDeleteDocuments) return;
    const target = invoiceToDelete;
    const label = typeLabels[target.type];
    setIsDeletingInvoice(true);
    try {
      // Cleanup attachment files in storage
      const paths = (target.attachments || []).map(a => a.path).filter(Boolean);
      if (paths.length) {
        await supabase.storage.from('invoice-attachments').remove(paths);
      }
      // Best-effort audit log entry BEFORE deletion so the trail survives.
      try {
        const { logStatusChange } = await import('@/film-shop/utils/paymentStatusHistory');
        await logStatusChange({
          docType: 'invoice',
          docId: target.id,
          docNumber: target.invoiceNumber,
          statusFrom: target.status || null,
          statusTo: 'deleted',
          notes: `ลบ${label} (ยอด ${target.total ?? 0})`,
        });
      } catch {}
      await deleteInvoice(target.id, { silent: true });
      toast.success(`ลบ${label}สำเร็จ`, {
        description: `ลบ${label} ${target.invoiceNumber} แล้ว`,
      });
      setInvoiceToDelete(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ไม่ทราบสาเหตุ';
      toast.error(`ลบ${label}ไม่สำเร็จ`, {
        description: `${target.invoiceNumber}: ${message}`,
      });
    } finally {
      setIsDeletingInvoice(false);
    }
  };

  const handleEdit = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setShowForm(true);
  };

  const handleConfirmDraft = async (invoice: Invoice) => {
    if (!invoice.customerName || invoice.total <= 0) {
      toast.error('ต้องมีชื่อลูกค้าและยอดมากกว่า 0 ก่อนยืนยัน');
      return;
    }
    await updateInvoice(invoice.id, { isDraft: false });
    toast.success(`ยืนยันใบงาน ${invoice.invoiceNumber} เป็นงานจริงแล้ว`);
  };

  const handlePrint = (invoice: Invoice) => {
    setPreviewInvoice(invoice);
  };

  /**
   * Parse a free-form LINE message and turn it into a draft invoice.
   * The parser is intentionally lenient — it never rejects input. If it
   * can't extract line items it stores the whole text in the notes field
   * so staff can finish the document manually.
   */
  const parseLineText = (raw: string) => {
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let customerName = '';
    let customerPhone = '';
    const items: any[] = [];
    for (const l of lines) {
      const phoneMatch = l.match(/\b(0\d[\d\s-]{7,})\b/);
      if (phoneMatch && !customerPhone) customerPhone = phoneMatch[1].replace(/\s|-/g, '');
      // "name x qty @ price"  or  "name qty price"
      const m = l.match(/^(.*?)[\s·]+(?:x|X|×)?\s*(\d+(?:\.\d+)?)\s*(?:@|ราคา)?\s*(\d+(?:\.\d+)?)\s*(?:บาท|฿)?$/);
      if (m) {
        const [, name, qtyStr, priceStr] = m;
        const qty = Number(qtyStr) || 1;
        const price = Number(priceStr) || 0;
        items.push({
          id: crypto.randomUUID(),
          name: name.trim(),
          width: 0, height: 0, pricePerSqm: 0,
          quantity: qty, unit: 'ชิ้น', discount: 0,
          pricePerPiece: price, total: qty * price,
        });
      } else if (!customerName && !/\d/.test(l)) {
        customerName = l;
      }
    }
    const subtotal = items.reduce((s, it) => s + (Number(it.total) || 0), 0);
    return {
      customerName: customerName || 'ลูกค้า LINE',
      customerPhone: customerPhone || undefined,
      items, subtotal,
    };
  };

  const handleLinePasteCreate = async () => {
    if (!linePasteText.trim()) {
      toast.error('กรุณาวางข้อความจาก LINE ก่อน');
      return;
    }
    setLinePasteBusy(true);
    try {
      const parsed = parseLineText(linePasteText);
      const now = new Date();
      const invoiceNumber = `LINE-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      const created = await addInvoice({
        invoiceNumber,
        type: 'invoice',
        customerName: parsed.customerName,
        customerPhone: parsed.customerPhone,
        items: parsed.items,
        subtotal: parsed.subtotal,
        deposit: 0,
        discount: 0,
        total: parsed.subtotal,
        amountDue: parsed.subtotal,
        status: 'pending',
        jobStatus: 'pending',
        notes: `[สั่งงานทาง LINE]\n${linePasteText}`,
        documentDate: now,
        isDraft: true,
        createdVia: 'line',
      });
      if (created) {
        // Also enqueue as a job request so the "คำสั่งงานจาก LINE" inbox
        // surfaces the new item + sidebar badge lights up.
        try {
          const firstItem = parsed.items[0];
          await supabase.from('job_requests' as any).insert({
            title: `LINE: ${parsed.customerName}`,
            category: 'line_paste',
            description: linePasteText.slice(0, 2000),
            customer_name: parsed.customerName,
            customer_phone: parsed.customerPhone ?? null,
            quantity: firstItem?.quantity ?? null,
            width: firstItem?.width ?? null,
            length: firstItem?.height ?? null,
            status: 'new',
            linked_invoice_id: (created as any).id ?? null,
            linked_doc_type: 'invoice',
            attachments: [],
          });
        } catch (jrErr) {
          console.warn('job_requests insert failed', jrErr);
        }
        toast.success('สร้างใบงานร่างจากข้อความ LINE แล้ว', {
          description: 'ตรวจสอบและยืนยันในแท็บ Draft ก่อนพิมพ์',
        });
        setShowDrafts(true);
        setLineDialogOpen(false);
        setLinePasteText('');
      }
    } catch (e: any) {
      toast.error('สร้างใบร่างจาก LINE ไม่สำเร็จ: ' + (e?.message || 'error'));
    } finally {
      setLinePasteBusy(false);
    }
  };

  /** แก้ไขใบเสร็จ → ใช้เลย์เอาต์เดียวกับ “ออกเอกสารด่วน” */
  if (showForm && editingInvoice && editingInvoice.type === 'receipt') {
    const closeEditor = () => { setShowForm(false); setEditingInvoice(null); };
    return (
      <div className="h-[calc(100vh-140px)] min-h-[560px]">
        <QuickDocPage
          editInvoice={editingInvoice}
          onClose={closeEditor}
          onSaved={() => closeEditor()}
        />
      </div>
    );
  }

  if (showForm) {
    return (
      <InvoiceForm
        invoice={editingInvoice}
        initialData={!editingInvoice ? ({ type: 'receipt' } as any) : undefined}
        onClose={() => {
          setShowForm(false);
          setEditingInvoice(null);
        }}
        onSaved={({ id, invoiceNumber, print }) => {
          if (print) setPendingPrint({ id, invoiceNumber });
        }}
      />
    );
  }

  if (previewInvoice) {
    return (
      <InvoicePreviewNew
        invoice={previewInvoice}
        settings={settings}
        onClose={() => setPreviewInvoice(null)}
        initialPaperSize={
          previewInvoice.type === 'receipt' && receiptDefaultPaper
            ? receiptDefaultPaper
            : undefined
        }
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 animate-fade-in">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="flex min-w-0 items-center gap-2 text-base sm:text-lg">
                <FileText className="h-5 w-5 shrink-0 text-primary" />
                {headingLabel ?? 'จัดการใบเสร็จรับเงิน'}
              </CardTitle>
              
              <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
                <Button
                  variant={receiptDefaultPaper ? 'default' : 'outline'}
                  onClick={toggleReceiptPaper}
                  title="สลับพรีเซ็ตใบเสร็จ: 10×7.5 ซม. (Gprinter GP-1324D) → 10×7 ซม. → ปิด"
                  className={
                    'w-full justify-center whitespace-normal text-center sm:w-auto ' +
                    (receiptDefaultPaper
                      ? 'bg-primary text-primary-foreground'
                      : 'border-primary/60 text-primary hover:bg-primary/5')
                  }
                >
                  <Printer className="h-4 w-4" />
                  {receiptDefaultPaper === '100x75'
                    ? 'ใบเสร็จ 10×7.5 ซม. (แนวนอน)'
                    : receiptDefaultPaper === '100x70'
                      ? 'ใบเสร็จ 10×7 ซม.'
                      : 'ตั้งค่าใบเสร็จ 10×7.5 ซม.'}
                  {receiptDefaultPaper && (
                    <Badge variant="secondary" className="ml-1">ใช้อยู่</Badge>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setLineDialogOpen(true)}
                  className="w-full justify-center border-emerald-500/60 text-emerald-700 hover:bg-emerald-50 sm:w-auto"
                >
                  <ClipboardPaste className="h-4 w-4" />
                  วางข้อความจาก LINE
                </Button>
                <Button onClick={() => setShowForm(true)} className="w-full justify-center sm:w-auto">
                  <Plus className="h-4 w-4" />
                  สร้างเอกสารใหม่
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="ค้นหาเลขที่เอกสาร หรือ ชื่อลูกค้า..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="สถานะ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทุกสถานะ</SelectItem>
                  <SelectItem value="pending">{PAY_STATUS.pending.label}</SelectItem>
                  <SelectItem value="deposit">{PAY_STATUS.deposit.label}</SelectItem>
                  <SelectItem value="credit">{PAY_STATUS.credit.label}</SelectItem>
                  <SelectItem value="paid">{PAY_STATUS.paid.label}</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant={showDrafts ? 'default' : 'outline'}
                onClick={() => setShowDrafts(v => !v)}
                className="sm:w-auto"
              >
                <FileText className="h-4 w-4 mr-1" />
                Draft {draftCount > 0 && <Badge variant="secondary" className="ml-1">{draftCount}</Badge>}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mb-4 opacity-50" />
              <p>
                {searchTerm || statusFilter !== 'all'
                  ? 'ไม่พบใบเสร็จที่ค้นหา'
                  : 'ยังไม่มีใบเสร็จ'}
              </p>
              <p className="text-sm">คลิก "สร้างเอกสารใหม่" เพื่อเริ่มต้น</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-table-header">
                      <TableHead>เลขที่เอกสาร</TableHead>
                      <TableHead>ประเภท</TableHead>
                      <TableHead>ลูกค้า</TableHead>
                      <TableHead>วันที่</TableHead>
                      <TableHead className="text-right">ยอดรวม</TableHead>
                      <TableHead className="text-right">ค้างชำระ</TableHead>
                      <TableHead>สถานะ</TableHead>
                      <TableHead className="text-center w-32">จัดการ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((invoice, index) => (
                      <TableRow key={invoice.id} className={index % 2 === 1 ? 'bg-table-row-alt' : ''}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2 flex-wrap">
                            {invoice.invoiceNumber}
                            {invoice.isDraft && <Badge variant="outline" className="border-warning text-warning text-xs">Draft</Badge>}
                            {invoice.createdVia === 'line' && <MessageCircle className="h-3.5 w-3.5 text-success" />}
                          </div>
                        </TableCell>
                        <TableCell>{typeLabels[invoice.type]}</TableCell>
                        <TableCell>{invoice.customerName}</TableCell>
                        <TableCell>{formatDate(invoice.documentDate || invoice.createdAt)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(invoice.total)}</TableCell>
                        <TableCell className="text-right">
                          {invoice.amountDue > 0 ? (
                            <span className="text-warning font-medium">{formatCurrency(invoice.amountDue)}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const k = normalizePaymentStatus(invoice.status);
                            const isSaving = savingStatusIds.has(invoice.id);
                            return (
                              <Select
                                value={k}
                                disabled={isSaving}
                                onValueChange={(v) => handleStatusSelect(invoice, v as PaymentStatusKey)}
                              >
                                <SelectTrigger className={cn('h-7 w-32 text-xs border', PAY_STATUS[k].className, isSaving && 'opacity-70')}>
                                  {isSaving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pending">{PAY_STATUS.pending.label}</SelectItem>
                                  <SelectItem value="deposit">{PAY_STATUS.deposit.label}</SelectItem>
                                  <SelectItem value="credit">{PAY_STATUS.credit.label}</SelectItem>
                                  <SelectItem value="paid">{PAY_STATUS.paid.label}</SelectItem>
                                </SelectContent>
                              </Select>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-center">
                            {invoice.isDraft && (
                              <Button variant="ghost" size="icon-sm" onClick={() => handleConfirmDraft(invoice)} className="text-success hover:text-success hover:bg-success/10" title="ยืนยันเป็นงานจริง">
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon-sm" onClick={() => handlePrint(invoice)} title="ดูตัวอย่าง / พิมพ์" data-testid="doc-preview">
                              <Printer className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => handleEdit(invoice)} title="แก้ไข">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => setExportTarget({ invoice, kind: 'png' })} title="บันทึกเป็นภาพ PNG" data-testid="doc-download-png">
                              <ImageDown className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => setExportTarget({ invoice, kind: 'pdf' })} title="ดาวน์โหลด PDF" data-testid="doc-download-pdf">
                              <FileDown className="h-4 w-4" />
                            </Button>
                            {canDeleteDocuments && (
                              <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(invoice)} className="text-destructive hover:text-destructive hover:bg-destructive/10" title="ลบ">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card List */}
              <div className="md:hidden space-y-3">
                {filteredInvoices.map((invoice) => (
                  <div key={invoice.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{invoice.invoiceNumber}</span>
                        {invoice.isDraft && <Badge variant="outline" className="border-warning text-warning text-xs">Draft</Badge>}
                        {invoice.createdVia === 'line' && <MessageCircle className="h-3.5 w-3.5 text-success" />}
                      </div>
                      {(() => {
                        const k = normalizePaymentStatus(invoice.status);
                        return <Badge variant="outline" className={cn('text-xs', PAY_STATUS[k].className)}>{PAY_STATUS[k].label}</Badge>;
                      })()}
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{invoice.customerName}</span>
                      <Badge variant="outline" className="text-xs">{typeLabels[invoice.type]}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{formatDate(invoice.documentDate || invoice.createdAt)}</span>
                      <span className="font-semibold">{formatCurrency(invoice.total)} ฿</span>
                    </div>
                    {invoice.amountDue > 0 && (
                      <div className="text-sm text-warning">ค้างชำระ: {formatCurrency(invoice.amountDue)} ฿</div>
                    )}
                    <div className="flex gap-1 justify-end pt-1 border-t">
                      {invoice.isDraft && (
                        <Button variant="ghost" size="icon-sm" onClick={() => handleConfirmDraft(invoice)} className="text-success hover:text-success hover:bg-success/10"><CheckCircle2 className="h-4 w-4" /></Button>
                      )}
                      <Button variant="ghost" size="icon-sm" onClick={() => handlePrint(invoice)} title="ดูตัวอย่าง / พิมพ์"><Printer className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => handleEdit(invoice)} title="แก้ไข"><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setExportTarget({ invoice, kind: 'png' })} title="บันทึกเป็นภาพ PNG"><ImageDown className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setExportTarget({ invoice, kind: 'pdf' })} title="ดาวน์โหลด PDF"><FileDown className="h-4 w-4" /></Button>
                      {canDeleteDocuments && (
                        <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(invoice)} className="text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">ยอดรวมใบเสร็จ</p>
              <p className="text-2xl font-bold text-success mt-1">{formatCurrency(receiptTotal)}</p>
              <p className="text-xs text-muted-foreground mt-1">{scopedInvoices.length} ใบ</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">ใบเสร็จที่ยังค้างชำระ</p>
              <p className="text-2xl font-bold text-warning mt-1">{unpaidCount}</p>
              <p className="text-xs text-muted-foreground mt-1">
                ค้างชำระรวม {formatCurrency(scopedInvoices.reduce((s, i) => s + i.amountDue, 0))} ฿
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* เอกสารซ่อนสำหรับบันทึก PNG / PDF */}
      {exportTarget && (
        <div style={{ position: 'fixed', left: -10000, top: 0 }} aria-hidden>
          <DocSnapshot ref={exportRef} invoice={exportTarget.invoice} shopName={(settings as any)?.shopName} />
        </div>
      )}

      {/* Deposit amount dialog when changing status to 'มัดจำ' */}
      <Dialog open={!!depositDialog} onOpenChange={(open) => !open && setDepositDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              บันทึกเงินมัดจำ
            </DialogTitle>
            <DialogDescription>
              {depositDialog && (
                <>
                  บิล <span className="font-semibold">{depositDialog.invoice.invoiceNumber}</span> ของ {depositDialog.invoice.customerName}
                  <br />
                  ยอดรวม: <span className="font-semibold">{formatCurrency(depositDialog.invoice.total)} ฿</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {depositDialog && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="deposit-amount">จำนวนเงินมัดจำที่รับ (บาท)</Label>
                <Input
                  id="deposit-amount"
                  type="number"
                  inputMode="decimal"
                  value={depositDialog.amount}
                  onChange={(e) => setDepositDialog({ ...depositDialog, amount: e.target.value })}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground mt-1">
                  คงค้าง: {formatCurrency(Math.max(0, depositDialog.invoice.total - (Number(depositDialog.amount) || 0)))} ฿
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDepositDialog(null)}>ยกเลิก</Button>
            <Button onClick={confirmDeposit}>บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteReceiptDialog
        open={!!invoiceToDelete}
        onOpenChange={(open) => { if (!open) setInvoiceToDelete(null); }}
        title={`ต้องการลบ${invoiceToDelete ? typeLabels[invoiceToDelete.type] : 'เอกสาร'} ${invoiceToDelete?.invoiceNumber ?? ''}?`}
        description="การลบนี้ไม่สามารถกู้คืนได้ เอกสารและรายการรายรับที่เกี่ยวข้องจะถูกลบถาวร"
        isDeleting={isDeletingInvoice}
        onConfirm={() => void confirmDeleteInvoice()}
      />

      <Dialog open={lineDialogOpen} onOpenChange={(o) => { if (!linePasteBusy) setLineDialogOpen(o); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-emerald-600" />
              สร้างใบงานจากข้อความ LINE
            </DialogTitle>
            <DialogDescription>
              วางข้อความที่ลูกค้าส่งมาทาง LINE — ระบบจะสร้างเป็น "ใบร่าง" อัตโนมัติ พร้อมแจ้งเตือน
              <br />
              ตัวอย่าง: <code className="text-xs">ป้ายไวนิล 2 350</code>
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={8}
            value={linePasteText}
            onChange={(e) => setLinePasteText(e.target.value)}
            placeholder={'ชื่อลูกค้า / บริษัท\nโทร 08x-xxx-xxxx\nสติ๊กเกอร์ 3 120\nไวนิล 1 850'}
            className="font-mono text-sm"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setLineDialogOpen(false)} disabled={linePasteBusy}>ยกเลิก</Button>
            <Button onClick={handleLinePasteCreate} disabled={linePasteBusy}>
              {linePasteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              สร้างใบร่าง
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
