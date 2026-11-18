import { useEffect, useState } from 'react';
import { supabase } from '@/film-shop/lib/supabase';
import { useRealtimeTable } from '@/film-shop/hooks/useRealtimeTable';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, History } from 'lucide-react';

interface AuditRow {
  id: string;
  shift_id: string;
  action: string;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  notes: string | null;
  changed_by_name: string | null;
  changed_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shiftId?: string | null;
}

const actionLabel: Record<string, string> = {
  open: 'เปิดกะ',
  close: 'ปิดกะ',
  edit_opening: 'แก้ยอดเปิด',
  edit_actual: 'แก้ยอดนับจริง',
  edit_notes: 'แก้หมายเหตุ',
  edit_transaction: 'แก้รายการ',
  delete_transaction: 'ลบรายการ',
  cash_in: 'เพิ่มเงิน',
  cash_out: 'ถอนเงิน',
};

const actionColor: Record<string, string> = {
  open: 'bg-green-100 text-green-800',
  close: 'bg-red-100 text-red-800',
  edit_opening: 'bg-amber-100 text-amber-800',
  edit_actual: 'bg-amber-100 text-amber-800',
  edit_notes: 'bg-blue-100 text-blue-800',
  edit_transaction: 'bg-blue-100 text-blue-800',
  delete_transaction: 'bg-rose-100 text-rose-800',
  cash_in: 'bg-emerald-100 text-emerald-800',
  cash_out: 'bg-orange-100 text-orange-800',
};

const fmtDateTime = (s: string) => {
  const d = new Date(s);
  const date = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${date} ${time}`;
};

export function CashDrawerAuditLog({ open, onOpenChange, shiftId }: Props) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!open) return;
    setLoading(true);
    let q = supabase
      .from('cash_drawer_audit')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(200);
    if (shiftId) q = q.eq('shift_id', shiftId);
    const { data, error } = await q;
    setLoading(false);
    if (error) { console.error(error); return; }
    setRows((data as any) || []);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [open, shiftId]);
  useRealtimeTable('cash_drawer_audit', () => { if (open) load(); });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            ประวัติการแก้ไขลิ้นชักเงินสด {shiftId ? '(เฉพาะกะนี้)' : '(ทั้งหมด)'}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">ยังไม่มีประวัติ</div>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">วันเวลา</TableHead>
                  <TableHead>ผู้ทำรายการ</TableHead>
                  <TableHead>การกระทำ</TableHead>
                  <TableHead>ฟิลด์</TableHead>
                  <TableHead>ค่าเดิม → ค่าใหม่</TableHead>
                  <TableHead>หมายเหตุ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDateTime(r.changed_at)}</TableCell>
                    <TableCell className="text-sm">{r.changed_by_name || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={actionColor[r.action] || 'bg-gray-100 text-gray-800'}>
                        {actionLabel[r.action] || r.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.field_changed || '-'}</TableCell>
                    <TableCell className="text-xs">
                      {r.old_value !== null || r.new_value !== null
                        ? <span><span className="text-muted-foreground">{r.old_value ?? '-'}</span> → <span className="font-medium">{r.new_value ?? '-'}</span></span>
                        : '-'}
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate" title={r.notes || ''}>{r.notes || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
