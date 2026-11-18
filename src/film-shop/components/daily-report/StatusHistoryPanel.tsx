import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon, Search, X, FileDown, RefreshCcw, History as HistoryIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { fetchStatusHistoryRange, type StatusHistoryEntry } from '@/film-shop/utils/paymentStatusHistory';
import { PAY_STATUS, PAY_STATUS_OPTIONS, normalizePaymentStatus, type PaymentStatusKey } from '@/film-shop/utils/paymentStatus';
import { toast } from 'sonner';

type DocFilter = 'all' | 'invoice' | 'pos_receipt';
type StatusFilter = 'all' | PaymentStatusKey;

const DOC_LABEL: Record<string, string> = {
  invoice: 'ใบกำกับ/ใบเสร็จ',
  pos_receipt: 'POS',
};

function dateToStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buddhistDate(d: Date) {
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543}`;
}

function rangeToISO(from: Date, to: Date) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0).toISOString();
  const endExclusive = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1, 0, 0, 0).toISOString();
  return { start, end: endExclusive };
}

function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function StatusHistoryPanel({ defaultDate }: { defaultDate: Date }) {
  const [from, setFrom] = useState<Date>(defaultDate);
  const [to, setTo] = useState<Date>(defaultDate);
  const [docFilter, setDocFilter] = useState<DocFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [userQuery, setUserQuery] = useState('');
  const [docQuery, setDocQuery] = useState('');
  const [rows, setRows] = useState<StatusHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // refetch when defaultDate (selected report date) changes
  useEffect(() => { setFrom(defaultDate); setTo(defaultDate); }, [defaultDate.getTime()]);

  const load = async () => {
    setLoading(true);
    try {
      const { start, end } = rangeToISO(from, to);
      const data = await fetchStatusHistoryRange(start, end);
      setRows(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from.getTime(), to.getTime()]);

  const filtered = useMemo(() => {
    const u = userQuery.trim().toLowerCase();
    const d = docQuery.trim().toLowerCase();
    return rows.filter(r => {
      if (docFilter !== 'all' && r.doc_type !== docFilter) return false;
      if (statusFilter !== 'all' && normalizePaymentStatus(r.status_to) !== statusFilter) return false;
      if (u && !(r.changed_by_name || '').toLowerCase().includes(u)) return false;
      if (d && !r.doc_number.toLowerCase().includes(d)) return false;
      return true;
    });
  }, [rows, docFilter, statusFilter, userQuery, docQuery]);

  const exportCSV = () => {
    if (filtered.length === 0) {
      toast.error('ไม่มีข้อมูลให้ส่งออก');
      return;
    }
    const header = ['เวลา', 'ประเภท', 'เลขที่', 'จาก', 'ไปยัง', 'ผู้ทำรายการ', 'หมายเหตุ'];
    const lines = filtered.map(r => {
      const dt = new Date(r.changed_at);
      const dateStr = `${buddhistDate(dt)} ${dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
      const fromLabel = r.status_from ? PAY_STATUS[normalizePaymentStatus(r.status_from)].label : '-';
      const toLabel = PAY_STATUS[normalizePaymentStatus(r.status_to)].label;
      return [dateStr, DOC_LABEL[r.doc_type] || r.doc_type, r.doc_number, fromLabel, toLabel, r.changed_by_name || '-', r.notes || ''].map(csvEscape).join(',');
    });
    const csv = '\uFEFF' + [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `status-history-${dateToStr(from)}_${dateToStr(to)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setDocFilter('all'); setStatusFilter('all'); setUserQuery(''); setDocQuery('');
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <HistoryIcon className="h-4 w-4" />ประวัติการเปลี่ยนสถานะเอกสาร
        </CardTitle>
        <p className="text-xs text-muted-foreground">ตรวจสอบย้อนหลังว่าใครเปลี่ยนสถานะอะไร เมื่อใด — ข้อมูลจาก/ถึง พร้อมเวลาและผู้ทำรายการ</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Date range + actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <CalendarIcon className="h-4 w-4" />จาก {buddhistDate(from)}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={from} onSelect={(d) => d && setFrom(d)} initialFocus />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <CalendarIcon className="h-4 w-4" />ถึง {buddhistDate(to)}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={to} onSelect={(d) => d && setTo(d)} initialFocus />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCcw className={cn('h-4 w-4', loading && 'animate-spin')} />รีเฟรช
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2 ml-auto">
            <FileDown className="h-4 w-4" />ส่งออก CSV
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={docFilter} onValueChange={(v) => setDocFilter(v as DocFilter)}>
            <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกประเภทเอกสาร</SelectItem>
              <SelectItem value="invoice">ใบกำกับ/ใบเสร็จ</SelectItem>
              <SelectItem value="pos_receipt">POS</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกสถานะปลายทาง</SelectItem>
              {PAY_STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>→ {PAY_STATUS[s].label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative w-[180px]">
            <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={docQuery} onChange={(e) => setDocQuery(e.target.value)} placeholder="ค้นหาเลขที่เอกสาร" className="pl-8 h-9" />
          </div>
          <div className="relative w-[180px]">
            <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="ค้นหาผู้ทำรายการ" className="pl-8 h-9" />
          </div>
          {(docFilter !== 'all' || statusFilter !== 'all' || userQuery || docQuery) && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
              <X className="h-4 w-4" />ล้าง
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} / {rows.length} รายการ</span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px]">เวลา</TableHead>
                <TableHead className="w-[120px]">ประเภท</TableHead>
                <TableHead>เลขที่</TableHead>
                <TableHead>จาก → ไป</TableHead>
                <TableHead>ผู้ทำรายการ</TableHead>
                <TableHead>หมายเหตุ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">กำลังโหลด...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">ไม่พบประวัติในช่วงและเงื่อนไขที่เลือก</TableCell></TableRow>
              ) : filtered.map(r => {
                const dt = new Date(r.changed_at);
                const fromMeta = r.status_from ? PAY_STATUS[normalizePaymentStatus(r.status_from)] : null;
                const toMeta = PAY_STATUS[normalizePaymentStatus(r.status_to)];
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">
                      {buddhistDate(dt)}<br />
                      <span className="text-muted-foreground">{dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    </TableCell>
                    <TableCell className="text-xs">{DOC_LABEL[r.doc_type] || r.doc_type}</TableCell>
                    <TableCell className="font-medium">{r.doc_number}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 flex-wrap">
                        {fromMeta ? (
                          <span className={cn('text-xs px-1.5 py-0.5 rounded border', fromMeta.className)}>{fromMeta.label}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                        <span className="text-muted-foreground">→</span>
                        <span className={cn('text-xs px-1.5 py-0.5 rounded border', toMeta.className)}>{toMeta.label}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{r.changed_by_name || <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate" title={r.notes || ''}>{r.notes || '-'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
