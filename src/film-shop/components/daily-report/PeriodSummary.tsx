import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/film-shop/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Receipt, TrendingUp, Wallet, Paperclip, FileText, Download } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { DailyReportRow, DailyReportSnapshot } from '@/film-shop/hooks/useDailyReport';

const fmt = (n: number) => new Intl.NumberFormat('th-TH').format(Math.round(n || 0));
const dStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const beDate = (s: string) => { const d = new Date(`${s}T00:00:00`); return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543}`; };

function startOfWeek(d: Date) {
  // Monday-based week
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const diff = (day + 6) % 7;
  const r = new Date(d);
  r.setDate(d.getDate() - diff);
  r.setHours(0, 0, 0, 0);
  return r;
}
function endOfWeek(d: Date) { const s = startOfWeek(d); const e = new Date(s); e.setDate(s.getDate() + 6); return e; }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

interface AttachmentRef { name: string; path: string }

async function openAttachment(path: string, name?: string, download = false) {
  const { data, error } = await supabase.storage.from('daily-report-attachments').createSignedUrl(path, 300);
  if (error || !data?.signedUrl) return toast.error('เปิดไฟล์ไม่สำเร็จ');
  if (download) {
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = name || 'attachment';
    a.target = '_blank';
    a.click();
  } else {
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }
}

export function PeriodSummary() {
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [rows, setRows] = useState<DailyReportRow[]>([]);
  const [loading, setLoading] = useState(false);

  const { from, to, label } = useMemo(() => {
    if (mode === 'week') {
      const s = startOfWeek(anchor); const e = endOfWeek(anchor);
      return { from: s, to: e, label: `สัปดาห์ ${beDate(dStr(s))} – ${beDate(dStr(e))}` };
    }
    const s = startOfMonth(anchor); const e = endOfMonth(anchor);
    const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    return { from: s, to: e, label: `${months[s.getMonth()]} ${s.getFullYear() + 543}` };
  }, [mode, anchor]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('daily_reports')
        .select('*')
        .gte('report_date', dStr(from))
        .lte('report_date', dStr(to))
        .order('report_date', { ascending: true });
      setLoading(false);
      if (error) { toast.error('โหลดข้อมูลล้มเหลว'); return; }
      setRows((data as any) || []);
    };
    load();
  }, [from, to]);

  const totals = useMemo(() => {
    let sales = 0, expenses = 0, income = 0, advances = 0, repaid = 0, attachCount = 0;
    rows.forEach((r) => {
      const s = r.snapshot as DailyReportSnapshot | undefined;
      if (!s) return;
      sales += s.sales?.total || 0;
      expenses += s.expenses?.total || 0;
      income += s.expenses?.income || 0;
      advances += s.cashAdvances?.newAmount || 0;
      repaid += s.cashAdvances?.repaidAmount || 0;
      attachCount += ((r as any).attachments?.length) || 0;
    });
    const net = sales + income - expenses - advances + repaid;
    return { sales, expenses, income, advances, repaid, attachCount, net };
  }, [rows]);

  const shift = (delta: number) => {
    const next = new Date(anchor);
    if (mode === 'week') next.setDate(anchor.getDate() + delta * 7);
    else next.setMonth(anchor.getMonth() + delta);
    setAnchor(next);
  };

  const cards = [
    { label: 'ยอดขาย POS', value: totals.sales, icon: Receipt, color: 'text-primary' },
    { label: 'รายจ่าย', value: totals.expenses, icon: TrendingUp, color: 'text-destructive' },
    { label: 'เบิกเงิน (สุทธิ)', value: totals.advances - totals.repaid, icon: Wallet, color: 'text-orange-600', sub: `เบิก ${fmt(totals.advances)} • คืน ${fmt(totals.repaid)}` },
    { label: 'กำไรสุทธิประมาณการ', value: totals.net, icon: TrendingUp, color: totals.net >= 0 ? 'text-green-600' : 'text-destructive' },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
            <TabsList>
              <TabsTrigger value="week">รายสัปดาห์</TabsTrigger>
              <TabsTrigger value="month">รายเดือน</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-1 ml-2">
            <Button variant="outline" size="icon" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2 min-w-[200px] justify-center">
                  <CalendarIcon className="h-4 w-4" />{label}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={anchor} onSelect={(d) => d && setAnchor(d)} initialFocus />
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="icon" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>

          <div className="ml-auto text-sm text-muted-foreground">
            {loading ? 'กำลังโหลด...' : `${rows.length} วันมีบันทึก • ไฟล์แนบ ${totals.attachCount} ไฟล์`}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" />{c.label}</div>
                <div className={cn('text-xl font-bold mt-1', c.color)}>{fmt(c.value)}</div>
                {(c as any).sub && <div className="text-xs text-muted-foreground mt-1">{(c as any).sub}</div>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">รายงานรายวันในช่วงนี้</CardTitle></CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">ยังไม่มีรายงานที่บันทึกในช่วงนี้</div>
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
                    <TableHead>ไฟล์แนบ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const s = r.snapshot as DailyReportSnapshot | undefined;
                    const atts: AttachmentRef[] = ((r as any).attachments || []) as AttachmentRef[];
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium whitespace-nowrap">{beDate(r.report_date)}</TableCell>
                        <TableCell className="text-right">{fmt(s?.sales?.total || 0)}</TableCell>
                        <TableCell className="text-right text-destructive">{fmt(s?.expenses?.total || 0)}</TableCell>
                        <TableCell className="text-right text-orange-600">{fmt(s?.cashAdvances?.newAmount || 0)}</TableCell>
                        <TableCell className="max-w-[260px] truncate text-sm text-muted-foreground">{r.notes || '-'}</TableCell>
                        <TableCell>
                          {atts.length === 0 ? (
                            <span className="text-xs text-muted-foreground">-</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {atts.map((a, i) => (
                                <div key={i} className="inline-flex items-center gap-0.5">
                                  <Button size="sm" variant="outline" className="h-7 gap-1 px-2" onClick={() => openAttachment(a.path, a.name)} title={a.name}>
                                    <Paperclip className="h-3 w-3" />
                                    <span className="max-w-[120px] truncate text-xs">{a.name}</span>
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openAttachment(a.path, a.name, true)} title="ดาวน์โหลด">
                                    <Download className="h-3 w-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="font-bold bg-muted/30">
                    <TableCell>รวม</TableCell>
                    <TableCell className="text-right">{fmt(totals.sales)}</TableCell>
                    <TableCell className="text-right text-destructive">{fmt(totals.expenses)}</TableCell>
                    <TableCell className="text-right text-orange-600">{fmt(totals.advances)}</TableCell>
                    <TableCell colSpan={2}>
                      <Badge variant="secondary" className="gap-1"><FileText className="h-3 w-3" />{rows.length} รายการ</Badge>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
