import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Save, PlayCircle, Printer } from 'lucide-react';
import { supabase } from '@/film-shop/lib/supabase';
import {
  WORK_CATEGORIES, WORK_DEPTS, computeTotals, defaultDept, emptyItem, formatThb, itemTotal,
  validateIntake, type WorkItemDraft,
} from '@/film-shop/workcenter/lib/workcenter';
import { buildEstimateDoc, printInternalDoc } from '@/film-shop/workcenter/lib/docs';
import { useWorkcenterCtx } from '@/film-shop/workcenter/components/WorkcenterProvider';

const db = supabase as any;
const NONE = '__none__';

interface CustomerRow { id: string; name: string; phone: string | null }

export interface WorkIntakePrefill {
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  notes?: string | null;
}

/** หน้า “รับงานใหม่” — หนึ่งออเดอร์มีหลายรายการงานข้ามหมวดได้ */
export function WorkIntakePage(
  { onDone, prefill }: { onDone?: (order?: { id?: string; order_no?: string } | null) => void; prefill?: WorkIntakePrefill },
) {
  const { employees, createIntake, busy, drafts, confirmDraft, deleteDraft } = useWorkcenterCtx();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [customerId, setCustomerId] = useState<string>(prefill?.customerId || NONE);
  const [customerName, setCustomerName] = useState(prefill?.customerName ?? '');
  const [customerPhone, setCustomerPhone] = useState(prefill?.customerPhone ?? '');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState(prefill?.notes ?? '');
  const [dueAt, setDueAt] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [discount, setDiscount] = useState('');
  const [deposit, setDeposit] = useState('');
  const [items, setItems] = useState<WorkItemDraft[]>([emptyItem('1')]);

  useEffect(() => {
    void (async () => {
      const { data } = await db.from('film_customers').select('id,name,phone').order('name').limit(500);
      setCustomers((data ?? []).map((c: any) => ({ id: c.id, name: c.name ?? '', phone: c.phone ?? null })));
    })();
  }, []);

  const totals = useMemo(
    () => computeTotals(items, Number(discount), Number(deposit)),
    [items, discount, deposit],
  );

  const patch = (key: string, p: Partial<WorkItemDraft>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...p } : i)));

  const addItem = () => setItems((prev) => [...prev, emptyItem(`${Date.now()}-${prev.length}`)]);
  const removeItem = (key: string) =>
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((i) => i.key !== key)));

  const pickCustomer = (id: string) => {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c) { setCustomerName(c.name); setCustomerPhone(c.phone ?? ''); }
  };

  const submit = async (isDraft: boolean) => {
    const err = validateIntake(customerName, items);
    if (err) { toast.error(err); return; }
    let cid = customerId === NONE ? null : customerId;
    if (!cid && customerName.trim()) {
      const { data } = await db.from('film_customers')
        .insert({ name: customerName.trim(), phone: customerPhone.trim() || null })
        .select('id').single();
      cid = data?.id ?? null;
    }
    const order = await createIntake({
      customerId: cid, customerName, customerPhone, title, notes, dueAt, isUrgent,
      discount, deposit, items, isDraft,
    });
    if (!order) return;
    toast.success(isDraft
      ? `บันทึกฉบับร่างแล้ว (${order.internal_job_no ?? order.order_no})`
      : `เข้าคิวแล้ว (${order.internal_job_no ?? order.order_no}) — สร้างงานย่อยแยกฝ่ายเรียบร้อย`);
    setItems([emptyItem('1')]);
    setTitle(''); setNotes(''); setDiscount(''); setDeposit(''); setIsUrgent(false);
    onDone?.(order as { id?: string; order_no?: string } | null);
  };

  const printEstimate = () => {
    const filled = items.filter((i) => i.category && i.title.trim());
    if (filled.length === 0) { toast.error('ยังไม่มีรายการงาน'); return; }
    printInternalDoc(buildEstimateDoc(
      { customerName: customerName || '-', customerPhone, dueAt: dueAt || null, note: notes },
      filled.map((i) => ({
        title: i.title, detail: i.description, category: i.category, size: i.size,
        quantity: Number(i.quantity) || 0, unit: i.unit, unitPrice: Number(i.unitPrice) || 0,
      })),
      totals,
    ));
  };

  return (
    <div className="space-y-4" data-testid="work-intake">
      <Card className="space-y-3 p-4">
        <h2 className="text-base font-semibold">ข้อมูลลูกค้า</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label>เลือกลูกค้าเดิม</Label>
            <Select value={customerId} onValueChange={pickCustomer}>
              <SelectTrigger><SelectValue placeholder="ลูกค้าใหม่" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>ลูกค้าใหม่ (กรอกชื่อเอง)</SelectItem>
                {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="wc-name">ชื่อลูกค้า</Label>
            <Input id="wc-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="ชื่อ-นามสกุล / หน่วยงาน" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wc-phone">เบอร์โทร</Label>
            <Input id="wc-phone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} inputMode="tel" />
          </div>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">รายการงานในออเดอร์</h2>
          <Button size="sm" variant="outline" onClick={addItem}><Plus className="mr-1 h-4 w-4" /> เพิ่มรายการ</Button>
        </div>

        <div className="space-y-3">
          {items.map((it, idx) => (
            <div key={it.key} data-testid="work-intake-item" className="space-y-3 rounded-xl border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">รายการที่ {idx + 1}</span>
                <Button size="icon" variant="ghost" aria-label="ลบรายการ" onClick={() => removeItem(it.key)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label>หมวดงาน</Label>
                  <Select
                    value={it.category || undefined}
                    onValueChange={(v) => patch(it.key, { category: v as WorkItemDraft['category'], dept: defaultDept(v) })}
                  >
                    <SelectTrigger aria-label={`หมวดงานรายการที่ ${idx + 1}`}><SelectValue placeholder="เลือกหมวด" /></SelectTrigger>
                    <SelectContent>
                      {WORK_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>ชื่องาน</Label>
                  <Input aria-label={`ชื่องานรายการที่ ${idx + 1}`} value={it.title} onChange={(e) => patch(it.key, { title: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>ขนาด</Label>
                  <Input aria-label={`ขนาดรายการที่ ${idx + 1}`} value={it.size} onChange={(e) => patch(it.key, { size: e.target.value })} placeholder="เช่น 1x3 ม." />
                </div>
                <div className="space-y-1">
                  <Label>ฝ่ายผลิต</Label>
                  <Select value={it.dept || undefined} onValueChange={(v) => patch(it.key, { dept: v as WorkItemDraft['dept'] })}>
                    <SelectTrigger aria-label={`ฝ่ายผลิตรายการที่ ${idx + 1}`}><SelectValue placeholder="อัตโนมัติตามหมวด" /></SelectTrigger>
                    <SelectContent>
                      {WORK_DEPTS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>จำนวน</Label>
                  <Input aria-label={`จำนวนรายการที่ ${idx + 1}`} inputMode="decimal" value={it.quantity} onChange={(e) => patch(it.key, { quantity: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>หน่วย</Label>
                  <Input aria-label={`หน่วยรายการที่ ${idx + 1}`} value={it.unit} onChange={(e) => patch(it.key, { unit: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>ราคาขาย/หน่วย</Label>
                  <Input aria-label={`ราคาขายรายการที่ ${idx + 1}`} inputMode="decimal" value={it.unitPrice} onChange={(e) => patch(it.key, { unitPrice: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>ราคาทุน/หน่วย</Label>
                  <Input aria-label={`ราคาทุนรายการที่ ${idx + 1}`} inputMode="decimal" value={it.costPrice} onChange={(e) => patch(it.key, { costPrice: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>ผู้รับผิดชอบ</Label>
                  <Select
                    value={it.assignedEmployeeId || NONE}
                    onValueChange={(v) => patch(it.key, { assignedEmployeeId: v === NONE ? '' : v })}
                  >
                    <SelectTrigger aria-label={`ผู้รับผิดชอบรายการที่ ${idx + 1}`}><SelectValue placeholder="ยังไม่มอบหมาย" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>ยังไม่มอบหมาย</SelectItem>
                      {employees.filter((e) => e.isActive).map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>กำหนดส่งรายการนี้</Label>
                  <Input aria-label={`กำหนดส่งรายการที่ ${idx + 1}`} type="datetime-local" value={it.dueAt} onChange={(e) => patch(it.key, { dueAt: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>ลิงก์ไฟล์งาน</Label>
                  <Input aria-label={`ลิงก์ไฟล์รายการที่ ${idx + 1}`} value={it.fileUrl} onChange={(e) => patch(it.key, { fileUrl: e.target.value })} placeholder="https://..." />
                </div>
                <div className="flex items-end gap-2 pb-1">
                  <Switch
                    id={`out-${it.key}`}
                    checked={it.isOutsourced}
                    onCheckedChange={(v) => patch(it.key, { isOutsourced: v })}
                    aria-label={`ส่งร้านใหญ่รายการที่ ${idx + 1}`}
                  />
                  <Label htmlFor={`out-${it.key}`} className="cursor-pointer">ส่งร้านใหญ่</Label>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>รายละเอียด</Label>
                  <Textarea aria-label={`รายละเอียดรายการที่ ${idx + 1}`} rows={2} value={it.description} onChange={(e) => patch(it.key, { description: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>หมายเหตุ</Label>
                  <Textarea aria-label={`หมายเหตุรายการที่ ${idx + 1}`} rows={2} value={it.notes} onChange={(e) => patch(it.key, { notes: e.target.value })} />
                </div>
              </div>
              <p className="text-right text-sm text-muted-foreground">
                รวมรายการนี้ <b className="text-foreground">{formatThb(itemTotal(it))}</b> บาท
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="text-base font-semibold">สรุปออเดอร์</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label>ชื่อออเดอร์</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น งานร้านกาแฟ" />
          </div>
          <div className="space-y-1">
            <Label>วันนัดรับ</Label>
            <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>ส่วนลด</Label>
            <Input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>มัดจำ</Label>
            <Input inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>หมายเหตุออเดอร์</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="wc-urgent" checked={isUrgent} onCheckedChange={setIsUrgent} aria-label="งานด่วน" />
          <Label htmlFor="wc-urgent" className="cursor-pointer">งานด่วน</Label>
        </div>

        <dl className="grid gap-1 rounded-xl bg-muted/40 p-3 text-sm sm:grid-cols-2">
          <div className="flex justify-between"><dt>รวมเป็นเงิน</dt><dd className="tabular-nums">{formatThb(totals.subtotal)}</dd></div>
          <div className="flex justify-between"><dt>ต้นทุนรวม</dt><dd className="tabular-nums">{formatThb(totals.cost)}</dd></div>
          <div className="flex justify-between"><dt>ส่วนลด</dt><dd className="tabular-nums">{formatThb(totals.discount)}</dd></div>
          <div className="flex justify-between"><dt>มัดจำ</dt><dd className="tabular-nums">{formatThb(totals.deposit)}</dd></div>
          <div className="flex justify-between font-semibold"><dt>ยอดสุทธิ</dt><dd className="tabular-nums" data-testid="work-total">{formatThb(totals.total)}</dd></div>
          <div className="flex justify-between font-semibold"><dt>คงเหลือ</dt><dd className="tabular-nums">{formatThb(totals.balance)}</dd></div>
        </dl>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={printEstimate} data-testid="work-print-estimate">
            <Printer className="mr-1 h-4 w-4" /> พิมพ์ใบสรุป/ประเมินราคา (ร่าง)
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => submit(true)} data-testid="work-save-draft">
            <Save className="mr-1 h-4 w-4" /> บันทึกฉบับร่าง
          </Button>
          <Button disabled={busy} onClick={() => submit(false)} data-testid="work-confirm-queue">
            <PlayCircle className="mr-1 h-4 w-4" /> ยืนยันและเข้าคิว
          </Button>
        </div>
      </Card>

      <Card className="space-y-3 p-4" data-testid="work-drafts">
        <h2 className="text-base font-semibold">ฉบับร่างรอตรวจ/ยืนยัน ({drafts.length})</h2>
        {drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground">ยังไม่มีฉบับร่าง</p>
        ) : (
          <ul className="space-y-2">
            {drafts.map((d) => (
              <li key={d.id} data-testid="work-draft-row" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {d.internalJobNo ?? d.orderNo} · {d.customerName || '-'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {d.itemCount} รายการ · {formatThb(d.total)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={busy} onClick={() => confirmDraft(d)} data-testid="work-draft-confirm">
                    <PlayCircle className="mr-1 h-4 w-4" /> ยืนยันเข้าคิว
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => deleteDraft(d)} aria-label={`ลบฉบับร่าง ${d.internalJobNo ?? d.orderNo}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}