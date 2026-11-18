import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Mic, Square, Send, Paperclip, Plus, Trash2, History, Printer, Loader2, FileDown, FileText, ImageDown } from 'lucide-react';
import { supabase } from '@/film-shop/lib/supabase';
import { useDocCommandDraft } from '@/film-shop/hooks/useDocCommandDraft';
import {
  DOC_TYPE_LABELS, SHOP_LABELS, formatThaiDate,
  type DocCommandType, type ShopKey,
} from '@/film-shop/lib/docCommand';
import { startRecording, micErrorMessage, MIN_AUDIO_BYTES, type RecorderHandle } from '@/film-shop/lib/voiceRecorder';
import { saveVoiceDocumentToFilmShop } from '@/film-shop/lib/voiceDocRecord';
import { downloadDocPdf, downloadDocFile, downloadDocImage } from '@/film-shop/lib/voiceDocDownload';
import { notifyDocumentIssued } from '@/film-shop/lib/docIssuedNotify';
import { parseDocBotAction, type DocBotAction } from '@/film-shop/lib/docBotActions';

const baht = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface ChatEntry { role: 'staff' | 'system'; text: string }

export interface DocCommandWorkspaceProps {
  /** ล็อกร้านที่ออกเอกสาร (ใช้เมื่อเปิดจากหน้า Receipt & Delivery ของร้านนั้น) */
  initialShopKey?: ShopKey;
  /** ประเภทเอกสารตั้งต้น */
  initialDocType?: DocCommandType;
  /** จำกัดประเภทเอกสารที่เลือกได้ เช่น ใบเสร็จรับเงิน */
  docTypeOptions?: DocCommandType[];
  /**
   * คำสั่งที่ไม่ใช่การ “สร้างเอกสารใหม่”
   * คืนข้อความตอบกลับเพื่อแสดงในแชต (คืน null = ให้ตีความเป็นคำสั่งสร้างเอกสารตามปกติ)
   */
  onAction?: (action: DocBotAction, text: string) => Promise<string | null> | string | null;
  /** เรียกหลังบันทึกเอกสารจริงสำเร็จ (ใช้รีเฟรชรายการด้านล่าง) */
  onIssued?: (docNo: string) => void;
}

/**
 * 3-column command workspace: chat (typed/spoken) -> editable fields ->
 * A4 draft preview. Nothing is ever issued without explicit confirmation.
 */
export function DocCommandWorkspace({
  initialShopKey,
  initialDocType,
  docTypeOptions,
  onAction,
  onIssued,
}: DocCommandWorkspaceProps = {}) {
  const d = useDocCommandDraft();
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [recorder, setRecorder] = useState<RecorderHandle | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { fields, setFields, totals, gate } = d;

  // ตั้งค่าร้าน/ประเภทเอกสารตั้งต้นเมื่อเปิดจากหน้าของร้านนั้น ๆ
  useEffect(() => {
    if (!initialShopKey && !initialDocType) return;
    setFields((f) => ({
      ...f,
      shopKey: initialShopKey ?? f.shopKey,
      docType: initialDocType ?? f.docType,
    }));
  }, [initialShopKey, initialDocType, setFields]);

  const docTypeEntries = (Object.entries(DOC_TYPE_LABELS) as [DocCommandType, string][])
    .filter(([k]) => !docTypeOptions || docTypeOptions.includes(k));

  const runCommand = async (text: string, source: 'typed' | 'voice') => {
    if (onAction) {
      const action = parseDocBotAction(text);
      if (action.kind !== 'create') {
        setChat((c) => [...c, { role: 'staff', text }]);
        const reply = await onAction(action, text);
        if (reply) {
          setChat((c) => [...c, { role: 'system', text: reply }]);
          return;
        }
        setChat((c) => c.slice(0, -1));
      }
    }
    const parsed = d.applyCommand(text, source);
    setChat((c) => [
      ...c,
      { role: 'staff', text },
      {
        role: 'system',
        text: parsed.missing.length
          ? `อ่านคำสั่งแล้ว แต่ข้อมูลไม่ครบ: ${parsed.missing.join(', ')}`
          : 'อ่านคำสั่งครบถ้วน ตรวจข้อมูลแล้วกดยืนยันออกเอกสารได้เลย',
      },
    ]);
  };

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    void runCommand(text, 'typed');
  };

  const toggleRecord = async () => {
    if (recorder) {
      const handle = recorder;
      setRecorder(null);
      setTranscribing(true);
      try {
        const blob = await handle.stop();
        if (blob.size < MIN_AUDIO_BYTES) {
          toast.error('เสียงสั้นเกินไป กรุณาพูดใหม่อีกครั้ง');
          return;
        }
        const form = new FormData();
        form.append('file', blob, 'command.wav');
        const { data, error } = await supabase.functions.invoke('doc-command', { body: form });
        if (error) throw error;
        if ((data as any)?.error) throw new Error(String((data as any).error));
        await runCommand(String((data as any).transcript ?? ''), 'voice');
      } catch (err: any) {
        toast.error(`ถอดเสียงไม่สำเร็จ: ${err?.message ?? err}`);
      } finally {
        setTranscribing(false);
      }
      return;
    }
    try {
      setRecorder(await startRecording());
    } catch (err) {
      toast.error(micErrorMessage(err));
    }
  };

  const updateItem = (idx: number, patch: Partial<(typeof fields.items)[number]>) =>
    setFields((f) => ({
      ...f,
      items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));

  const openHistory = async () => {
    setHistoryRows(await d.history());
    setHistoryOpen(true);
  };

  const isFinal = !!d.docNo;

  const printArea = () => document.getElementById('doc-command-print-area') as HTMLElement | null;

  const runDownload = async (kind: 'pdf' | 'doc' | 'img') => {
    const el = printArea();
    if (!el || !d.docNo) return;
    setDownloading(kind);
    try {
      if (kind === 'pdf') await downloadDocPdf(el, d.docNo);
      else if (kind === 'img') await downloadDocImage(el, d.docNo);
      else downloadDocFile(el, d.docNo);
    } catch (err: any) {
      toast.error(`ดาวน์โหลดไม่สำเร็จ: ${err?.message ?? err}`);
    } finally {
      setDownloading(null);
    }
  };

  /** ยืนยันออกเอกสาร -> รันเลขอัตโนมัติ -> บันทึกลงสมุดเอกสารของ Film Shop ทันที */
  const confirmAndSave = async () => {
    setConfirmOpen(false);
    const no = await d.finalize();
    if (!no) return;
    try {
      const id = await saveVoiceDocumentToFilmShop(fields, totals, no, d.source);
      setSavedId(id);
      toast.success(`บันทึกเข้าสมุดเอกสาร Film Shop แล้ว: ${no}`);
      onIssued?.(no);
      const sent = await notifyDocumentIssued({
        docNo: no,
        docTypeLabel: DOC_TYPE_LABELS[fields.docType],
        shopLabel: fields.shopKey ? SHOP_LABELS[fields.shopKey] : '-',
        shopKey: fields.shopKey,
        customerName: fields.customerName ?? null,
        total: totals.total,
        invoiceId: id,
      });
      if (sent.app || sent.line) {
        toast.success(
          `แจ้งเตือนผู้เกี่ยวข้องแล้ว${sent.line ? ' (ในระบบ + กลุ่ม LINE)' : ' (ในระบบ)'}`,
        );
      }
    } catch (err: any) {
      toast.error(`ออกเลขสำเร็จ (${no}) แต่บันทึกลงสมุดเอกสารไม่สำเร็จ: ${err?.message ?? err}`);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)_minmax(0,420px)]">
      {/* ---------- 1. command chat ---------- */}
      <Card className="flex min-h-[420px] flex-col">
        <CardHeader className="pb-3"><CardTitle className="text-base">แชตคำสั่ง</CardTitle></CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3">
          <div className="flex-1 space-y-2 overflow-y-auto rounded-lg bg-muted/40 p-3 text-sm" data-testid="doc-command-chat">
            {chat.length === 0 && (
              <p className="text-muted-foreground">
                พิมพ์หรือพูดคำสั่ง เช่น “ออกใบเสร็จ ร้าน NATTAWORKS ให้คุณสมชาย ป้ายไวนิล 2 ผืน ผืนละ 500 บาท รับเงินสด”
              </p>
            )}
            {chat.map((m, i) => (
              <div key={i} className={m.role === 'staff' ? 'text-foreground' : 'text-muted-foreground'}>
                <span className="font-medium">{m.role === 'staff' ? 'คำสั่ง: ' : 'ระบบ: '}</span>{m.text}
              </div>
            ))}
          </div>

          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="พิมพ์คำสั่งภาษาไทย…"
            className="min-h-[72px]"
            aria-label="ช่องพิมพ์คำสั่ง"
          />
          {attachments.length > 0 && (
            <p className="text-xs text-muted-foreground">แนบไฟล์: {attachments.join(', ')}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={recorder ? 'destructive' : 'secondary'} onClick={toggleRecord} disabled={transcribing}>
              {recorder ? <><Square className="mr-1 h-4 w-4" /> หยุดบันทึก</> : <><Mic className="mr-1 h-4 w-4" /> พูดคำสั่ง</>}
            </Button>
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              <Paperclip className="mr-1 h-4 w-4" /> แนบไฟล์
            </Button>
            <input
              ref={fileRef} type="file" className="hidden" multiple
              onChange={(e) => setAttachments(Array.from(e.target.files ?? []).map((f) => f.name))}
            />
            <Button type="button" onClick={send} disabled={!input.trim()}>
              <Send className="mr-1 h-4 w-4" /> ส่งคำสั่ง
            </Button>
          </div>
          {transcribing && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> กำลังถอดเสียงภาษาไทย…
            </p>
          )}
        </CardContent>
      </Card>

      {/* ---------- 2. editable fields ---------- */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="text-base">ข้อมูลที่ดึงได้</CardTitle>
          {fields.missing.length === 0 ? (
            <Badge className="bg-success text-success-foreground">ข้อมูลครบ</Badge>
          ) : (
            <Badge variant="destructive" data-testid="missing-badge">ข้อมูลไม่ครบ</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {fields.missing.length > 0 && (
            <p className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive" data-testid="missing-list">
              ต้องระบุเพิ่ม: {fields.missing.join(', ')}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>ประเภทเอกสาร</Label>
              <Select value={fields.docType} onValueChange={(v) => setFields((f) => ({ ...f, docType: v as DocCommandType }))}>
                <SelectTrigger aria-label="ประเภทเอกสาร"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {docTypeEntries.map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ร้าน</Label>
              <Select value={fields.shopKey ?? ''} onValueChange={(v) => setFields((f) => ({ ...f, shopKey: v as ShopKey }))}>
                <SelectTrigger aria-label="ร้าน"><SelectValue placeholder="เลือกร้าน" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SHOP_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ลูกค้า / หน่วยงาน</Label>
              <Input value={fields.customerName ?? ''} onChange={(e) => setFields((f) => ({ ...f, customerName: e.target.value }))} />
            </div>
            <div>
              <Label>เบอร์โทร</Label>
              <Input value={fields.customerPhone ?? ''} onChange={(e) => setFields((f) => ({ ...f, customerPhone: e.target.value }))} />
            </div>
            <div>
              <Label>เลขผู้เสียภาษี</Label>
              <Input value={fields.customerTaxId ?? ''} onChange={(e) => setFields((f) => ({ ...f, customerTaxId: e.target.value }))} />
            </div>
            <div>
              <Label>โครงการ / งาน</Label>
              <Input value={fields.project ?? ''} onChange={(e) => setFields((f) => ({ ...f, project: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>รายการ</Label>
              <Button type="button" size="sm" variant="outline"
                onClick={() => setFields((f) => ({ ...f, items: [...f.items, { description: '', quantity: 1, unit: 'ชิ้น', unitPrice: 0, discount: 0, total: 0 }] }))}>
                <Plus className="mr-1 h-4 w-4" /> เพิ่มรายการ
              </Button>
            </div>
            {fields.items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_70px_70px_90px_auto] items-center gap-2">
                <Input aria-label={`รายการที่ ${idx + 1}`} value={it.description} onChange={(e) => updateItem(idx, { description: e.target.value })} />
                <Input aria-label={`จำนวนรายการที่ ${idx + 1}`} type="number" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} />
                <Input aria-label={`หน่วยรายการที่ ${idx + 1}`} value={it.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })} />
                <Input aria-label={`ราคารายการที่ ${idx + 1}`} type="number" value={it.unitPrice} onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })} />
                <Button type="button" size="icon" variant="ghost" aria-label={`ลบรายการที่ ${idx + 1}`}
                  onClick={() => setFields((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>VAT</Label>
              <Select value={fields.vatMode} onValueChange={(v) => setFields((f) => ({ ...f, vatMode: v as typeof f.vatMode }))}>
                <SelectTrigger aria-label="VAT"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">ไม่มี VAT</SelectItem>
                  <SelectItem value="exclusive">VAT 7% แยกนอก</SelectItem>
                  <SelectItem value="inclusive">ราคารวม VAT แล้ว</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>หัก ณ ที่จ่าย (%)</Label>
              <Input type="number" value={fields.whtRate} onChange={(e) => setFields((f) => ({ ...f, whtRate: Number(e.target.value) }))} />
            </div>
            <div>
              <Label>สถานะชำระเงิน</Label>
              <Select value={fields.paymentStatus} onValueChange={(v) => setFields((f) => ({ ...f, paymentStatus: v as typeof f.paymentStatus }))}>
                <SelectTrigger aria-label="สถานะชำระเงิน"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unpaid">ยังไม่ชำระ</SelectItem>
                  <SelectItem value="deposit">มัดจำ</SelectItem>
                  <SelectItem value="paid">ชำระแล้ว</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>หมายเหตุ</Label>
            <Textarea value={fields.notes ?? ''} onChange={(e) => setFields((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </CardContent>
      </Card>

      {/* ---------- 3. A4 draft preview ---------- */}
      <Card className="flex flex-col">
        <CardHeader className="pb-3"><CardTitle className="text-base">ตัวอย่างเอกสาร</CardTitle></CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3">
          <div className="relative overflow-hidden rounded-lg border bg-card p-5 text-sm" data-testid="doc-preview" id="doc-command-print-area">
            {!isFinal && (
              <span className="pointer-events-none absolute inset-0 grid place-items-center text-5xl font-black text-muted-foreground/15 -rotate-12">
                DRAFT
              </span>
            )}
            <p className="text-xs text-muted-foreground">{fields.shopKey ? SHOP_LABELS[fields.shopKey] : 'ยังไม่เลือกร้าน'}</p>
            <h3 className="text-lg font-bold">{DOC_TYPE_LABELS[fields.docType]}{isFinal ? '' : ' (ฉบับร่าง)'}</h3>
            <p className="text-xs text-muted-foreground">เลขที่: {d.docNo ?? 'ฉบับร่าง — ยังไม่ออกเลขเอกสาร'}</p>
            <p className="mt-2">ลูกค้า: {fields.customerName || '-'}</p>
            <p>วันนัดรับ: {formatThaiDate(fields.dueAtISO)}</p>
            <table className="mt-3 w-full table-fixed text-xs">
              <colgroup>
                <col className="w-[46%]" />
                <col className="w-[18%]" />
                <col className="w-[18%]" />
                <col className="w-[18%]" />
              </colgroup>
              <thead>
                <tr className="border-b text-left">
                  <th className="py-1 pr-2 font-semibold">รายการ</th>
                  <th className="py-1 px-1 text-right font-semibold">จำนวน</th>
                  <th className="py-1 px-1 text-right font-semibold">ราคา</th>
                  <th className="py-1 pl-1 text-right font-semibold">รวม</th>
                </tr>
              </thead>
              <tbody>
                {fields.items.map((i, idx) => (
                  <tr key={idx} className="border-b border-border/50 align-top">
                    <td className="py-1 pr-2 break-words">{i.description || '-'}</td>
                    <td className="py-1 px-1 text-right tabular-nums">{i.quantity} {i.unit}</td>
                    <td className="py-1 px-1 text-right tabular-nums">{baht(i.unitPrice)}</td>
                    <td className="py-1 pl-1 text-right tabular-nums">{baht(i.quantity * i.unitPrice - i.discount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="mt-3 space-y-1 text-xs">
              <div className="flex justify-between"><dt>รวมเป็นเงิน</dt><dd data-testid="preview-subtotal">{baht(totals.subtotal)}</dd></div>
              <div className="flex justify-between"><dt>ภาษีมูลค่าเพิ่ม</dt><dd>{baht(totals.vatAmount)}</dd></div>
              <div className="flex justify-between"><dt>หัก ณ ที่จ่าย</dt><dd>{baht(totals.whtAmount)}</dd></div>
              <div className="flex justify-between text-sm font-bold"><dt>ยอดสุทธิ</dt><dd data-testid="preview-total">{baht(totals.total)}</dd></div>
            </dl>
          </div>

          {/* สรุปก่อนออกเลข — ตรวจผู้รับ / ร้าน / ออเดอร์ / ยอดรวม */}
          {!isFinal && (
            <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs" data-testid="pre-issue-summary">
              <p className="mb-1.5 text-sm font-semibold">สรุปก่อนออกเลข</p>
              <dl className="space-y-1">
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">ผู้รับเอกสาร</dt>
                  <dd data-testid="summary-customer" className={fields.customerName ? '' : 'text-destructive'}>
                    {fields.customerName || 'ยังไม่ระบุ'}{fields.customerPhone ? ` · ${fields.customerPhone}` : ''}
                  </dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">ร้านที่ออกเอกสาร</dt>
                  <dd data-testid="summary-shop" className={fields.shopKey ? '' : 'text-destructive'}>
                    {fields.shopKey ? SHOP_LABELS[fields.shopKey] : 'ยังไม่เลือกร้าน'}
                  </dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">ออเดอร์ / งาน</dt>
                  <dd data-testid="summary-order">
                    {fields.project || DOC_TYPE_LABELS[fields.docType]} · {fields.items.length} รายการ
                  </dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">นัดรับ</dt>
                  <dd>{formatThaiDate(fields.dueAtISO)}</dd></div>
                <div className="flex justify-between gap-2 border-t pt-1 text-sm font-bold">
                  <dt>ยอดรวมสุทธิ</dt><dd data-testid="summary-total">{baht(totals.total)} บาท</dd></div>
              </dl>
              {fields.missing.length > 0 && (
                <p className="mt-1.5 text-destructive">ข้อมูลไม่ครบ: {fields.missing.join(', ')}</p>
              )}
            </div>
          )}

          {isFinal && (
            <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/30 p-2" data-testid="doc-download-actions">
              <span className="w-full text-xs font-semibold">ดาวน์โหลดเอกสาร {d.docNo}</span>
              <Button type="button" size="sm" variant="outline" disabled={!!downloading}
                onClick={() => runDownload('pdf')} data-testid="download-pdf">
                {downloading === 'pdf' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileDown className="mr-1 h-4 w-4" />} PDF
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={!!downloading}
                onClick={() => runDownload('doc')} data-testid="download-doc">
                <FileText className="mr-1 h-4 w-4" /> ไฟล์เอกสาร
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={!!downloading}
                onClick={() => runDownload('img')} data-testid="download-image">
                {downloading === 'img' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImageDown className="mr-1 h-4 w-4" />} รูปภาพ
              </Button>
            </div>
          )}

          <div className="sticky bottom-0 flex flex-wrap gap-2 border-t bg-card pt-3">
            <Button type="button" variant="outline" onClick={() => d.saveDraft()} disabled={d.busy}>บันทึกฉบับร่าง</Button>
            <Button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={!gate.ok || d.busy || isFinal}
              data-testid="confirm-issue"
            >
              {d.busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} ยืนยันออกเอกสาร
            </Button>
            <Button type="button" variant="outline" onClick={() => window.print()} disabled={!isFinal}>
              <Printer className="mr-1 h-4 w-4" /> พิมพ์
            </Button>
            <Button type="button" variant="ghost" onClick={openHistory} disabled={!d.draftId}>
              <History className="mr-1 h-4 w-4" /> ดูประวัติ
            </Button>
            <Button type="button" variant="ghost" onClick={() => d.cancelDraft('ยกเลิกโดยพนักงาน')} disabled={isFinal}>ยกเลิก</Button>
          </div>
          {savedId && (
            <p className="text-xs text-emerald-600" data-testid="voice-doc-saved">
              บันทึกเป็นเอกสารของ Film Shop เรียบร้อย (เลขที่ {d.docNo}) — ดูได้ที่เมนู “ใบเสร็จ”
            </p>
          )}
          {!gate.ok && (
            <p className="text-xs text-destructive" data-testid="finalize-block">{gate.reasons[0]}</p>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันออกเอกสารจริง</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm">
                <p>ประเภท: {DOC_TYPE_LABELS[fields.docType]}</p>
                <p>ร้าน: {fields.shopKey ? SHOP_LABELS[fields.shopKey] : '-'}</p>
                <p>ลูกค้า: {fields.customerName || '-'}</p>
                <p>รวมเป็นเงิน {baht(totals.subtotal)} / VAT {baht(totals.vatAmount)} / หัก ณ ที่จ่าย {baht(totals.whtAmount)}</p>
                <p className="font-semibold">ยอดสุทธิ {baht(totals.total)} บาท</p>
                <p className="text-muted-foreground">เมื่อยืนยันแล้วระบบจะออกเลขเอกสารจริงและยกเลิกไม่ได้ (ทำได้เพียงยกเลิกเอกสาร)</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ย้อนกลับ</AlertDialogCancel>
            <AlertDialogAction disabled={d.busy} onClick={confirmAndSave}>
              ยืนยันออกเอกสาร
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>ประวัติเอกสาร</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto text-sm">
            {historyRows.length === 0 && <p className="text-muted-foreground">ยังไม่มีประวัติ</p>}
            {historyRows.map((r) => (
              <div key={r.id} className="rounded-lg border p-2">
                <p className="font-medium">{r.event}</p>
                <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString('th-TH')} • {r.source}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}