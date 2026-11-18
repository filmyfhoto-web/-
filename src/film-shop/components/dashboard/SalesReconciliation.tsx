import { useState, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, RefreshCw, CheckCircle2, AlertTriangle, Download } from 'lucide-react';
import { supabase } from '@/film-shop/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const fmt = (n: number) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const dStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const beDate = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543}`;

interface ReconRow {
  label: string;
  source: string;
  count: number;
  amount: number;
}

interface ReconResult {
  pos: { rows: any[]; total: number; paidTotal: number };
  invoices: { rows: any[]; byType: Record<string, { count: number; total: number }>; total: number };
  generatedAt: Date;
}

export function SalesReconciliation() {
  const [from, setFrom] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [to, setTo] = useState<Date>(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReconResult | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const startISO = new Date(`${dStr(from)}T00:00:00`).toISOString();
      const endISO = new Date(`${dStr(to)}T23:59:59.999`).toISOString();

      const [posRes, invRes] = await Promise.all([
        supabase.from('pos_receipts').select('*').gte('receipt_date', startISO).lte('receipt_date', endISO),
        supabase
          .from('invoices')
          .select('*')
          .or(
            `and(document_date.gte.${startISO},document_date.lte.${endISO}),and(document_date.is.null,created_at.gte.${startISO},created_at.lte.${endISO})`,
          ),
      ]);

      if (posRes.error) throw posRes.error;
      if (invRes.error) throw invRes.error;

      const posRows = posRes.data || [];
      const posTotal = posRows.reduce((s: number, r: any) => s + (Number(r.total) || 0), 0);
      const posPaid = posRows
        .filter((r: any) => (r.payment_status || 'pending') === 'paid')
        .reduce((s: number, r: any) => s + (Number(r.total) || 0), 0);

      const invRows = (invRes.data || []).filter((i: any) => !i.is_draft);
      const byType: Record<string, { count: number; total: number }> = {
        quotation: { count: 0, total: 0 },
        invoice: { count: 0, total: 0 },
        receipt: { count: 0, total: 0 },
      };
      let invTotal = 0;
      invRows.forEach((i: any) => {
        const t = i.type || 'invoice';
        const total = Number(i.total) || 0;
        invTotal += total;
        if (!byType[t]) byType[t] = { count: 0, total: 0 };
        byType[t].count += 1;
        byType[t].total += total;
      });

      setResult({
        pos: { rows: posRows, total: posTotal, paidTotal: posPaid },
        invoices: { rows: invRows, byType, total: invTotal },
        generatedAt: new Date(),
      });
      toast.success('ดึงข้อมูลสำเร็จ');
    } catch (e: any) {
      toast.error('ดึงข้อมูลล้มเหลว: ' + (e?.message || 'unknown'));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const downloadCsv = () => {
    if (!result) return;
    const lines: string[] = [];
    lines.push('ประเภท,เลขที่,วันที่,ลูกค้า,สถานะ,ยอดรวม');
    result.pos.rows.forEach((r: any) => {
      lines.push(
        [
          'POS',
          r.receipt_number,
          new Date(r.receipt_date).toLocaleString('th-TH'),
          (r.customer_name || '-').replace(/,/g, ' '),
          r.payment_status || '-',
          Number(r.total) || 0,
        ].join(','),
      );
    });
    result.invoices.rows.forEach((r: any) => {
      lines.push(
        [
          r.type || 'invoice',
          r.invoice_number,
          new Date(r.document_date || r.created_at).toLocaleString('th-TH'),
          (r.customer_name || '-').replace(/,/g, ' '),
          r.status || '-',
          Number(r.total) || 0,
        ].join(','),
      );
    });
    const csv = '\ufeff' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-recon-${dStr(from)}_${dStr(to)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const recon: ReconRow[] = result
    ? [
        { label: 'ใบเสร็จ POS (ทั้งหมด)', source: 'pos_receipts', count: result.pos.rows.length, amount: result.pos.total },
        {
          label: 'ใบเสร็จ POS (จ่ายแล้วเท่านั้น)',
          source: "pos_receipts.payment_status='paid'",
          count: result.pos.rows.filter((r: any) => (r.payment_status || 'pending') === 'paid').length,
          amount: result.pos.paidTotal,
        },
        {
          label: 'ใบเสนอราคา',
          source: "invoices.type='quotation'",
          count: result.invoices.byType.quotation?.count || 0,
          amount: result.invoices.byType.quotation?.total || 0,
        },
        {
          label: 'ใบวางบิล',
          source: "invoices.type='invoice'",
          count: result.invoices.byType.invoice?.count || 0,
          amount: result.invoices.byType.invoice?.total || 0,
        },
        {
          label: 'ใบเสร็จ (กรอกเอง)',
          source: "invoices.type='receipt'",
          count: result.invoices.byType.receipt?.count || 0,
          amount: result.invoices.byType.receipt?.total || 0,
        },
      ]
    : [];

  // ยอดขายรวมที่ Dashboard นับ = POS total + invoices.receipt total (ตาม PeriodIncomeCards)
  const dashboardSalesTotal = result
    ? result.pos.total + (result.invoices.byType.receipt?.total || 0)
    : 0;
  const dbSalesTotal = result ? result.pos.total + (result.invoices.byType.receipt?.total || 0) : 0;
  const diff = dashboardSalesTotal - dbSalesTotal;
  const matches = Math.abs(diff) < 0.01;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            ตรวจสอบยอดขาย (Sales Reconciliation)
          </CardTitle>
          <CardDescription>
            เปรียบเทียบยอดที่ Dashboard แสดง กับยอดที่ดึงตรงจากฐานข้อมูล (ใบเสร็จ POS + ใบกำกับ)
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">ตั้งแต่วันที่</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn('w-[200px] justify-start gap-2', !from && 'text-muted-foreground')}>
                  <CalendarIcon className="h-4 w-4" />
                  {from ? beDate(from) : 'เลือกวันที่'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={from}
                  onSelect={(d) => d && setFrom(d)}
                  initialFocus
                  className={cn('p-3 pointer-events-auto')}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">ถึงวันที่</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn('w-[200px] justify-start gap-2', !to && 'text-muted-foreground')}>
                  <CalendarIcon className="h-4 w-4" />
                  {to ? beDate(to) : 'เลือกวันที่'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={to}
                  onSelect={(d) => d && setTo(d)}
                  initialFocus
                  className={cn('p-3 pointer-events-auto')}
                />
              </PopoverContent>
            </Popover>
          </div>
          <Button onClick={run} disabled={loading} className="gap-2">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            รีเฟรช
          </Button>
          {result && (
            <Button variant="outline" onClick={downloadCsv} className="gap-2">
              <Download className="h-4 w-4" />
              ดาวน์โหลด CSV รายการดิบ
            </Button>
          )}
        </CardContent>
      </Card>

      {result && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">เปรียบเทียบยอดรวม</CardTitle>
              <CardDescription>
                ยอดขายที่ Dashboard นับ = ใบเสร็จ POS (ทุกสถานะ) + ใบเสร็จที่กรอกเอง (invoices.type='receipt')
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border p-4">
                  <div className="text-xs text-muted-foreground">ยอด Dashboard</div>
                  <div className="text-2xl font-bold mt-1">{fmt(dashboardSalesTotal)}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-xs text-muted-foreground">ยอดจากฐานข้อมูลโดยตรง</div>
                  <div className="text-2xl font-bold mt-1">{fmt(dbSalesTotal)}</div>
                </div>
                <div className={cn('rounded-lg border p-4', matches ? 'border-green-500/40 bg-green-50' : 'border-destructive/40 bg-destructive/5')}>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    {matches ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <AlertTriangle className="h-3 w-3 text-destructive" />}
                    ส่วนต่าง
                  </div>
                  <div className={cn('text-2xl font-bold mt-1', matches ? 'text-green-700' : 'text-destructive')}>
                    {fmt(diff)}
                  </div>
                  <Badge variant={matches ? 'secondary' : 'destructive'} className="mt-2">
                    {matches ? '✓ ตรงกัน' : '✗ ไม่ตรงกัน'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">แจกแจงยอดตามแหล่งข้อมูล</CardTitle>
              <CardDescription>ดึงตรงจากตาราง pos_receipts และ invoices ในช่วงวันที่ที่เลือก</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>หมวด</TableHead>
                    <TableHead className="text-xs text-muted-foreground">แหล่งข้อมูล (table)</TableHead>
                    <TableHead className="text-center">จำนวน</TableHead>
                    <TableHead className="text-right">ยอดรวม (บาท)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recon.map((r) => (
                    <TableRow key={r.label}>
                      <TableCell className="font-medium">{r.label}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">{r.source}</TableCell>
                      <TableCell className="text-center">{r.count}</TableCell>
                      <TableCell className="text-right">{fmt(r.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground mt-3">
                หมายเหตุ: ตาราง <code>job_type_totals</code> ถูกเก็บถาวรเป็น <code>job_type_totals_archived</code> แล้ว — ระบบไม่นำมารวมในยอดขายอีก
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                อัปเดตล่าสุด: {result.generatedAt.toLocaleString('th-TH')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">รายการดิบ — ใบเสร็จ POS ({result.pos.rows.length})</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {result.pos.rows.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">ไม่มีรายการ</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>เลขที่</TableHead>
                      <TableHead>วันที่</TableHead>
                      <TableHead>ลูกค้า</TableHead>
                      <TableHead>สถานะ</TableHead>
                      <TableHead className="text-right">ยอด</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.pos.rows.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.receipt_number}</TableCell>
                        <TableCell className="text-xs">{format(new Date(r.receipt_date), 'dd/MM HH:mm')}</TableCell>
                        <TableCell>{r.customer_name || '-'}</TableCell>
                        <TableCell><Badge variant="outline">{r.payment_status || 'pending'}</Badge></TableCell>
                        <TableCell className="text-right">{fmt(Number(r.total) || 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">รายการดิบ — ใบกำกับ/ใบเสนอราคา/ใบเสร็จ ({result.invoices.rows.length})</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {result.invoices.rows.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">ไม่มีรายการ</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>เลขที่</TableHead>
                      <TableHead>ประเภท</TableHead>
                      <TableHead>วันที่</TableHead>
                      <TableHead>ลูกค้า</TableHead>
                      <TableHead>สถานะ</TableHead>
                      <TableHead className="text-right">ยอด</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.invoices.rows.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.invoice_number}</TableCell>
                        <TableCell><Badge variant="outline">{r.type}</Badge></TableCell>
                        <TableCell className="text-xs">{format(new Date(r.document_date || r.created_at), 'dd/MM HH:mm')}</TableCell>
                        <TableCell>{r.customer_name || '-'}</TableCell>
                        <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                        <TableCell className="text-right">{fmt(Number(r.total) || 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
