import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar as CalendarIcon, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppData } from '@/film-shop/hooks/useAppData';
import { usePOSData } from '@/film-shop/hooks/usePOSData';
import { useProductCategories } from '@/film-shop/hooks/useProductCategories';

const fmt = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(n || 0);

export function CategoryRevenueReport() {
  const { invoices } = useAppData();
  const { receipts } = usePOSData();
  const { categories } = useProductCategories();

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState<Date>(firstOfMonth);
  const [endDate, setEndDate] = useState<Date>(today);
  const [selectedKeys, setSelectedKeys] = useState<Set<string> | null>(null);
  const [hideEmpty, setHideEmpty] = useState<boolean>(true);

  const effectiveSelected = selectedKeys ?? new Set(categories.map(c => c.key));
  const toggleKey = (k: string) => {
    const next = new Set(effectiveSelected);
    if (next.has(k)) next.delete(k); else next.add(k);
    setSelectedKeys(next);
  };

  const data = useMemo(() => {
    const start = new Date(startDate); start.setHours(0, 0, 0, 0);
    const end = new Date(endDate); end.setHours(23, 59, 59, 999);
    const inRange = (d: Date) => d >= start && d <= end;

    const map: Record<string, { count: number; total: number }> = {};
    categories.forEach(c => { map[c.key] = { count: 0, total: 0 }; });

    // Only PAID
    invoices.forEach(inv => {
      if (inv.status !== 'paid') return;
      const d = new Date(inv.documentDate || inv.createdAt);
      if (!inRange(d)) return;
      (inv.items || []).forEach(it => {
        if (it.category && map[it.category]) {
          map[it.category].count += 1;
          map[it.category].total += Number(it.total) || 0;
        }
      });
    });

    receipts.forEach(r => {
      if (r.paymentStatus !== 'paid') return;
      const d = new Date(r.receiptDate);
      if (!inRange(d)) return;
      (r.items || []).forEach((it: any) => {
        if (it.category && map[it.category]) {
          map[it.category].count += 1;
          map[it.category].total += Number(it.total) || 0;
        }
      });
    });

    const grandTotal = Object.values(map).reduce((s, v) => s + v.total, 0);
    const grandCount = Object.values(map).reduce((s, v) => s + v.count, 0);
    return { map, grandTotal, grandCount };
  }, [invoices, receipts, categories, startDate, endDate]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          รายได้แยกประเภทสินค้า (เฉพาะที่จ่ายแล้ว)
        </CardTitle>
        <CardDescription>
          กรองช่วงวันที่ คำนวณจากใบเสร็จ/ใบเสนอราคาและ POS ที่สถานะ "จ่ายแล้ว"
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label>วันเริ่มต้น</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn('w-44 justify-start font-normal')}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(startDate, 'dd/MM/yyyy', { locale: th })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={startDate} onSelect={(d) => d && setStartDate(d)} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Label>วันสิ้นสุด</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn('w-44 justify-start font-normal')}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(endDate, 'dd/MM/yyyy', { locale: th })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={endDate} onSelect={(d) => d && setEndDate(d)} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <Label className="text-sm font-semibold">เลือกประเภทสินค้า</Label>
            <div className="flex items-center gap-4">
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => setSelectedKeys(new Set(categories.map(c => c.key)))}>เลือกทั้งหมด</button>
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => setSelectedKeys(new Set())}>ล้าง</button>
              <div className="flex items-center gap-2">
                <Switch id="hide-empty" checked={hideEmpty} onCheckedChange={setHideEmpty} />
                <Label htmlFor="hide-empty" className="text-xs">ซ่อนหมวดที่ไม่มีรายการ</Label>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map(cat => (
              <label key={cat.key} className="flex items-center gap-2 px-2 py-1 rounded-md border cursor-pointer hover:bg-muted/40">
                <Checkbox checked={effectiveSelected.has(cat.key)} onCheckedChange={() => toggleKey(cat.key)} />
                <span className="inline-flex items-center gap-1 text-xs">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: cat.color }} />
                  {cat.name}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ประเภทสินค้า</TableHead>
                <TableHead className="text-center">จำนวนรายการ</TableHead>
                <TableHead className="text-right">ยอดรวมที่จ่ายแล้ว</TableHead>
                <TableHead className="text-right">สัดส่วน</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                const visible = categories.filter(c => effectiveSelected.has(c.key)).filter(c => {
                  const v = data.map[c.key] || { count: 0, total: 0 };
                  return !hideEmpty || v.count > 0;
                });
                const visTotal = visible.reduce((s, c) => s + (data.map[c.key]?.total || 0), 0);
                const visCount = visible.reduce((s, c) => s + (data.map[c.key]?.count || 0), 0);
                if (visible.length === 0) {
                  return <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">ไม่มีรายการตามตัวกรอง</TableCell></TableRow>;
                }
                return (
                  <>
                    {visible.map(cat => {
                      const v = data.map[cat.key] || { count: 0, total: 0 };
                      const pct = visTotal > 0 ? (v.total / visTotal) * 100 : 0;
                      return (
                        <TableRow key={cat.key}>
                          <TableCell>
                            <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs" style={{ background: cat.color }}>{cat.name}</span>
                          </TableCell>
                          <TableCell className="text-center">{v.count}</TableCell>
                          <TableCell className="text-right font-semibold">{fmt(v.total)}</TableCell>
                          <TableCell className="text-right">{pct.toFixed(1)}%</TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell>รวม</TableCell>
                      <TableCell className="text-center">{visCount}</TableCell>
                      <TableCell className="text-right">{fmt(visTotal)}</TableCell>
                      <TableCell className="text-right">100%</TableCell>
                    </TableRow>
                  </>
                );
              })()}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
