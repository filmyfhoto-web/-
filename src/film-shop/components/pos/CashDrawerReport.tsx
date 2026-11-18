import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { supabase } from '@/film-shop/lib/supabase';
import { useRealtimeTable } from '@/film-shop/hooks/useRealtimeTable';

interface ShiftRecord {
  id: string;
  opened_at: string;
  closed_at: string | null;
  opening_amount: number;
  expected_amount: number;
  actual_amount: number | null;
  difference: number | null;
  notes: string | null;
}

interface CashDrawerReportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CashDrawerReport({ open, onOpenChange }: CashDrawerReportProps) {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [shiftTransactions, setShiftTransactions] = useState<Record<string, { sales: number; cashIn: number; cashOut: number }>>({});
  const [isLoading, setIsLoading] = useState(false);

  const months = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  useEffect(() => {
    if (!open) return;
    fetchShiftHistory();
  }, [open, selectedMonth, selectedYear]);

  useRealtimeTable(['cash_drawer_shifts', 'cash_drawer_transactions'], () => { fetchShiftHistory(); }, open);

  const fetchShiftHistory = async () => {
    setIsLoading(true);
    try {
      const startDate = new Date(selectedYear, selectedMonth, 1);
      const endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);

      const { data, error } = await supabase
        .from('cash_drawer_shifts')
        .select('*')
        .eq('status', 'closed')
        .gte('opened_at', startDate.toISOString())
        .lte('opened_at', endDate.toISOString())
        .order('opened_at', { ascending: false });

      if (error) throw error;
      setShifts(data || []);

      // Fetch transactions for each shift
      if (data && data.length > 0) {
        const shiftIds = data.map(s => s.id);
        const { data: txns, error: txnError } = await supabase
          .from('cash_drawer_transactions')
          .select('*')
          .in('shift_id', shiftIds);

        if (!txnError && txns) {
          const grouped: Record<string, { sales: number; cashIn: number; cashOut: number }> = {};
          for (const txn of txns) {
            if (!grouped[txn.shift_id]) {
              grouped[txn.shift_id] = { sales: 0, cashIn: 0, cashOut: 0 };
            }
            if (txn.type === 'sale') grouped[txn.shift_id].sales += Number(txn.amount);
            else if (txn.type === 'cash_in') grouped[txn.shift_id].cashIn += Number(txn.amount);
            else if (txn.type === 'cash_out') grouped[txn.shift_id].cashOut += Number(txn.amount);
          }
          setShiftTransactions(grouped);
        }
      } else {
        setShiftTransactions({});
      }
    } catch (error) {
      console.error('Error fetching shift history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const totalSales = Object.values(shiftTransactions).reduce((sum, t) => sum + t.sales, 0);
  const totalCashIn = Object.values(shiftTransactions).reduce((sum, t) => sum + t.cashIn, 0);
  const totalCashOut = Object.values(shiftTransactions).reduce((sum, t) => sum + t.cashOut, 0);
  const totalDifference = shifts.reduce((sum, s) => sum + (s.difference || 0), 0);

  const thaiYear = (year: number) => year + 543;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            📊 รายงานสรุปเงินในตู้
          </DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <div className="flex gap-3 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">เดือน:</span>
            <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((m, i) => (
                  <SelectItem key={i} value={i.toString()}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">ปี:</span>
            <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={y.toString()}>{thaiYear(y)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-xs text-muted-foreground">ยอดขายรวม</div>
              <div className="text-lg font-bold text-green-600">฿{totalSales.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-xs text-muted-foreground">เงินเข้ารวม</div>
              <div className="text-lg font-bold text-emerald-600">฿{totalCashIn.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-xs text-muted-foreground">เงินออกรวม</div>
              <div className="text-lg font-bold text-orange-600">฿{totalCashOut.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-xs text-muted-foreground">ผลต่างรวม</div>
              <div className={`text-lg font-bold ${totalDifference === 0 ? 'text-green-600' : totalDifference > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {totalDifference === 0 ? '✅ ตรง' : totalDifference > 0 ? `+฿${totalDifference.toLocaleString()}` : `-฿${Math.abs(totalDifference).toLocaleString()}`}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Shift History Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : shifts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <div className="text-3xl mb-2">📭</div>
            <p>ไม่มีข้อมูลกะในเดือน{months[selectedMonth]} {thaiYear(selectedYear)}</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">วันที่</TableHead>
                  <TableHead className="text-xs">เปิดกะ</TableHead>
                  <TableHead className="text-xs">ปิดกะ</TableHead>
                  <TableHead className="text-xs text-right">เริ่มต้น</TableHead>
                  <TableHead className="text-xs text-right">ขาย</TableHead>
                  <TableHead className="text-xs text-right">เข้า</TableHead>
                  <TableHead className="text-xs text-right">ออก</TableHead>
                  <TableHead className="text-xs text-right">คาดหวัง</TableHead>
                  <TableHead className="text-xs text-right">จริง</TableHead>
                  <TableHead className="text-xs text-right">ผลต่าง</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.map((shift) => {
                  const txn = shiftTransactions[shift.id] || { sales: 0, cashIn: 0, cashOut: 0 };
                  const diff = shift.difference || 0;
                  return (
                    <TableRow key={shift.id}>
                      <TableCell className="text-xs">
                        {format(new Date(shift.opened_at), 'dd/MM/yy', { locale: th })}
                      </TableCell>
                      <TableCell className="text-xs">
                        {format(new Date(shift.opened_at), 'HH:mm')}
                      </TableCell>
                      <TableCell className="text-xs">
                        {shift.closed_at ? format(new Date(shift.closed_at), 'HH:mm') : '-'}
                      </TableCell>
                      <TableCell className="text-xs text-right">฿{Number(shift.opening_amount).toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right text-green-600">฿{txn.sales.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right text-emerald-600">฿{txn.cashIn.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right text-orange-600">฿{txn.cashOut.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right">฿{Number(shift.expected_amount).toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right">
                        {shift.actual_amount != null ? `฿${Number(shift.actual_amount).toLocaleString()}` : '-'}
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        <Badge variant="secondary" className={
                          diff === 0 ? 'bg-green-100 text-green-800' :
                          diff > 0 ? 'bg-blue-100 text-blue-800' :
                          'bg-red-100 text-red-800'
                        }>
                          {diff === 0 ? 'ตรง' : diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="text-xs text-muted-foreground text-center">
          แสดง {shifts.length} กะ ในเดือน{months[selectedMonth]} {thaiYear(selectedYear)}
        </div>
      </DialogContent>
    </Dialog>
  );
}