import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Printer, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkcenterCtx } from '@/film-shop/workcenter/components/WorkcenterProvider';
import {
  OUTSOURCE_STATUSES, OUTSOURCE_STATUS_LABELS, OUTSOURCE_STATUS_TONE, categoryLabel,
  formatThaiDate, formatThb, type OutsourceStatus,
} from '@/film-shop/workcenter/lib/workcenter';
import { buildOutsourceDoc, printInternalDoc } from '@/film-shop/workcenter/lib/docs';

/** หน้า “งานส่งร้านใหญ่” — เลือกงาน สร้างใบสั่งผลิต ติดตามสถานะ และพิมพ์ A4 */
export function OutsourcePage() {
  const { jobs, suppliers, outsource, busy, createOutsourceOrder, setOutsourceStatus } = useWorkcenterCtx();
  const [supplierId, setSupplierId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [dueAt, setDueAt] = useState('');
  const [material, setMaterial] = useState('');
  const [finishing, setFinishing] = useState('');
  const [note, setNote] = useState('');

  const candidates = useMemo(
    () => jobs.filter((j) => !j.outsourceId && j.status !== 'done' && j.status !== 'cancelled'),
    [jobs],
  );

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const create = async () => {
    if (!supplierId) { toast.error('กรุณาเลือกร้านใหญ่/ซัพพลายเออร์'); return; }
    const id = await createOutsourceOrder(supplierId, selected, { dueAt, note, material, finishing });
    if (id) { setSelected([]); setNote(''); setMaterial(''); setFinishing(''); setDueAt(''); }
  };

  return (
    <div className="space-y-4" data-testid="work-outsource">
      <Card className="space-y-3 p-4">
        <h2 className="text-base font-semibold">สร้างใบสั่งผลิตร้านใหญ่</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label>ร้านใหญ่ / ซัพพลายเออร์</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger aria-label="เลือกร้านใหญ่"><SelectValue placeholder="เลือกร้าน" /></SelectTrigger>
              <SelectContent>
                {suppliers.filter((s) => s.isActive).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="wo-due">กำหนดรับ</Label>
            <Input id="wo-due" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wo-mat">วัสดุ</Label>
            <Input id="wo-mat" value={material} onChange={(e) => setMaterial(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wo-fin">วิธีเก็บงาน</Label>
            <Input id="wo-fin" value={finishing} onChange={(e) => setFinishing(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="wo-note">หมายเหตุ</Label>
          <Textarea id="wo-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium">เลือกงานที่จะส่งผลิต ({selected.length})</p>
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {candidates.length === 0 && <li className="py-3 text-center text-sm text-muted-foreground">ไม่มีงานที่รอส่ง</li>}
            {candidates.map((j) => (
              <li key={j.id} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
                <Checkbox
                  id={`pick-${j.id}`}
                  checked={selected.includes(j.id)}
                  onCheckedChange={() => toggle(j.id)}
                  aria-label={`เลือกงาน ${j.title}`}
                />
                <label htmlFor={`pick-${j.id}`} className="min-w-0 flex-1 cursor-pointer text-sm">
                  <span className="font-medium">{j.jobNo || j.orderNo}</span> · {j.title}
                  <span className="block truncate text-xs text-muted-foreground">
                    {j.customerName} · {categoryLabel(j.category)} · {j.quantity} {j.unit || ''} · ทุน {formatThb(j.costPrice)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <Button disabled={busy || selected.length === 0} onClick={create} data-testid="work-create-wo">
          <Store className="mr-1 h-4 w-4" /> สร้างใบสั่งผลิต
        </Button>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="text-base font-semibold">ใบสั่งผลิตทั้งหมด</h2>
        {outsource.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีใบสั่งผลิต</p>}
        <ul className="space-y-2">
          {outsource.map((wo) => (
            <li key={wo.id} data-testid="work-wo-row" className="space-y-2 rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{wo.woNo}</span>
                <Badge variant="outline" className={cn('text-[11px]', OUTSOURCE_STATUS_TONE[wo.status])}>
                  {OUTSOURCE_STATUS_LABELS[wo.status]}
                </Badge>
                <span className="text-sm text-muted-foreground">{wo.supplierName || '-'}</span>
                <span className="ml-auto text-sm tabular-nums">ทุนรวม {formatThb(wo.totalCost)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                กำหนดรับ {formatThaiDate(wo.dueAt)} · {wo.items.length} รายการ
              </p>
              <ul className="text-xs text-muted-foreground">
                {wo.items.map((i) => <li key={i.id}>• {i.title} · {i.size || '-'} · {i.quantity} {i.unit || ''}</li>)}
              </ul>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={wo.status} onValueChange={(v) => void setOutsourceStatus(wo, v as OutsourceStatus)}>
                  <SelectTrigger className="h-8 w-44 text-xs" aria-label={`สถานะใบสั่งผลิต ${wo.woNo}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OUTSOURCE_STATUSES.map((s) => <SelectItem key={s} value={s}>{OUTSOURCE_STATUS_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={() => printInternalDoc(buildOutsourceDoc(wo))} data-testid="work-print-wo">
                  <Printer className="mr-1 h-4 w-4" /> พิมพ์ใบสั่งผลิต A4
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}