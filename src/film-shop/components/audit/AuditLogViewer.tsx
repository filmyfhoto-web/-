import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/film-shop/lib/supabase';
import { useRealtimeWithFallback } from '@/film-shop/hooks/useRealtimeWithFallback';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Search, ShieldCheck, RefreshCw } from 'lucide-react';

interface Row {
  id: string;
  doc_id: string;
  doc_number: string;
  doc_type: string;
  status_from: string | null;
  status_to: string;
  changed_by_name: string | null;
  notes: string | null;
  changed_at: string;
}

const fmt = (s: string) => {
  const d = new Date(s);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const statusColor: Record<string, string> = {
  deleted: 'bg-red-100 text-red-800',
  edited: 'bg-amber-100 text-amber-800',
  paid: 'bg-green-100 text-green-800',
  partial: 'bg-yellow-100 text-yellow-800',
  unpaid: 'bg-gray-100 text-gray-800',
  overdue: 'bg-orange-100 text-orange-800',
};

/**
 * Audit log viewer for Film Shop invoices/receipts. Reads from
 * `film_payment_status_history` — deletions/edits are logged with
 * status_to = 'deleted' / 'edited'.
 */
export function AuditLogViewer() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [docTypeFilter, setDocTypeFilter] = useState<string>('all');

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('payment_status_history')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(500);
    setLoading(false);
    if (error) { console.error(error); return; }
    setRows((data as any) || []);
  };

  useEffect(() => { load(); }, []);
  useRealtimeWithFallback('film_payment_status_history', load);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter(r => {
      if (docTypeFilter !== 'all' && r.doc_type !== docTypeFilter) return false;
      if (actionFilter === 'delete' && r.status_to !== 'deleted') return false;
      if (actionFilter === 'edit' && r.status_to !== 'edited') return false;
      if (actionFilter === 'status' && (r.status_to === 'deleted' || r.status_to === 'edited')) return false;
      if (!s) return true;
      return (r.doc_number || '').toLowerCase().includes(s)
          || (r.changed_by_name || '').toLowerCase().includes(s)
          || (r.notes || '').toLowerCase().includes(s);
    });
  }, [rows, search, actionFilter, docTypeFilter]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">ประวัติการแก้ไข (Audit Log)</h2>
          <Button variant="ghost" size="sm" onClick={load} className="ml-auto">
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> รีเฟรช
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาเลขเอกสาร / ลูกค้า / ผู้ทำรายการ" className="pl-10" />
          </div>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger><SelectValue placeholder="ประเภทการกระทำ" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทั้งหมด</SelectItem>
              <SelectItem value="status">เปลี่ยนสถานะ</SelectItem>
              <SelectItem value="edit">แก้ไข</SelectItem>
              <SelectItem value="delete">ลบ</SelectItem>
            </SelectContent>
          </Select>
          <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
            <SelectTrigger><SelectValue placeholder="ประเภทเอกสาร" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทั้งหมด</SelectItem>
              <SelectItem value="invoice">ใบแจ้งหนี้/ใบเสร็จ</SelectItem>
              <SelectItem value="pos_receipt">POS</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-12">ยังไม่มีข้อมูล</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">วันเวลา</TableHead>
                  <TableHead>เอกสาร</TableHead>
                  <TableHead>ประเภท</TableHead>
                  <TableHead>ผู้ทำรายการ</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead>หมายเหตุ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap">{fmt(r.changed_at)}</TableCell>
                    <TableCell className="text-sm font-medium">{r.doc_number}</TableCell>
                    <TableCell className="text-xs">{r.doc_type === 'invoice' ? 'ใบแจ้งหนี้' : r.doc_type}</TableCell>
                    <TableCell className="text-sm">{r.changed_by_name || '-'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs">
                        {r.status_from && <span className="text-muted-foreground">{r.status_from}</span>}
                        {r.status_from && <span>→</span>}
                        <Badge className={statusColor[r.status_to] || 'bg-slate-100 text-slate-800'}>{r.status_to}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs max-w-[280px] truncate" title={r.notes || ''}>{r.notes || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}