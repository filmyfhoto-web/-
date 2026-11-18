import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar, TrendingUp, DollarSign, Receipt, BarChart3, Printer, CalendarIcon, Trash2 } from 'lucide-react';
import { usePOSData } from '@/film-shop/hooks/usePOSData';
import { POSReceipt, PAYMENT_STATUS_LABELS } from '@/film-shop/types/pos';
import { useAppData } from '@/film-shop/hooks/useAppData';
import { useUserRole } from '@/film-shop/hooks/useUserRole';
import { useToast } from '@/film-shop/hooks/use-toast';
import { DeleteReceiptDialog } from './DeleteReceiptDialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as DatePicker } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { printDailySalesReport } from '@/film-shop/utils/dailyListPrint';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from 'recharts';

const formatCurrency = (amount: number) => 
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('th-TH', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);

export function POSSalesReport() {
  const { receipts, deleteReceipt } = usePOSData();
  const { settings } = useAppData();
  const { isAdmin, isStaff } = useUserRole();
  const canDeleteReceipts = isAdmin || isStaff;
  const { toast } = useToast();
  const [viewType, setViewType] = useState<'daily' | 'monthly'>('daily');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [printDate, setPrintDate] = useState<Date>(new Date());
  const [receiptToDelete, setReceiptToDelete] = useState<POSReceipt | null>(null);
  const [isDeletingReceipt, setIsDeletingReceipt] = useState(false);

  const handleDeleteReceipt = async () => {
    if (!receiptToDelete) return;
    if (!canDeleteReceipts) {
      toast({ title: 'ไม่มีสิทธิ์ลบใบเสร็จ', description: 'เฉพาะแอดมินหรือพนักงานเท่านั้นที่สามารถลบใบเสร็จได้', variant: 'destructive' });
      setReceiptToDelete(null);
      return;
    }
    const target = receiptToDelete;
    setIsDeletingReceipt(true);
    try {
      await deleteReceipt(target.id, { silent: true });
      toast({
        title: 'ลบใบเสร็จสำเร็จ',
        description: `ลบใบเสร็จ ${target.receiptNumber} แล้ว`,
      });
      setReceiptToDelete(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ไม่ทราบสาเหตุ';
      toast({
        title: 'ลบใบเสร็จไม่สำเร็จ',
        description: `${target.receiptNumber}: ${message}`,
        variant: 'destructive',
      });
    } finally {
      setIsDeletingReceipt(false);
    }
  };

  const handlePrintDay = () => {
    const y = printDate.getFullYear();
    const m = printDate.getMonth();
    const day = printDate.getDate();
    const dayReceipts = receipts
      .filter(r => {
        const d = new Date(r.receiptDate);
        return d.getFullYear() === y && d.getMonth() === m && d.getDate() === day;
      })
      .sort((a, b) => new Date(a.receiptDate).getTime() - new Date(b.receiptDate).getTime());
    printDailySalesReport({
      shopName: settings.shopName,
      date: format(printDate, 'yyyy-MM-dd'),
      receipts: dayReceipts.map(r => ({
        receiptNumber: r.receiptNumber,
        receiptDate: r.receiptDate,
        customerName: r.customerName || '',
        itemSummary: (r.items || []).map(i => `${i.name} x${i.quantity}`).join(', '),
        paymentType: r.paymentType,
        paymentStatus: r.paymentStatus,
        total: r.total,
      })),
    });
  };


  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return [currentYear - 2, currentYear - 1, currentYear];
  }, []);

  const months = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];

  // Daily report data
  const dailyData = useMemo(() => {
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const data = [];
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dayReceipts = receipts.filter(r => {
        const d = new Date(r.receiptDate);
        return d.getFullYear() === selectedYear && 
               d.getMonth() === selectedMonth && 
               d.getDate() === day;
      });
      
      const cash = dayReceipts
        .filter(r => r.paymentType === 'cash')
        .reduce((sum, r) => sum + r.total, 0);
      const transfer = dayReceipts
        .filter(r => r.paymentType === 'transfer')
        .reduce((sum, r) => sum + r.total, 0);
      const credit = dayReceipts
        .filter(r => r.paymentType === 'credit')
        .reduce((sum, r) => sum + r.total, 0);
      
      data.push({
        day,
        date: `${day}/${selectedMonth + 1}`,
        cash,
        transfer,
        credit,
        total: cash + transfer + credit,
        count: dayReceipts.length,
      });
    }
    
    return data;
  }, [receipts, selectedYear, selectedMonth]);

  // Monthly report data
  const monthlyData = useMemo(() => {
    return months.map((name, index) => {
      const monthReceipts = receipts.filter(r => {
        const d = new Date(r.receiptDate);
        return d.getFullYear() === selectedYear && d.getMonth() === index;
      });
      
      const cash = monthReceipts
        .filter(r => r.paymentType === 'cash')
        .reduce((sum, r) => sum + r.total, 0);
      const transfer = monthReceipts
        .filter(r => r.paymentType === 'transfer')
        .reduce((sum, r) => sum + r.total, 0);
      const credit = monthReceipts
        .filter(r => r.paymentType === 'credit')
        .reduce((sum, r) => sum + r.total, 0);
      
      return {
        month: name.substring(0, 3),
        fullMonth: name,
        cash,
        transfer,
        credit,
        total: cash + transfer + credit,
        count: monthReceipts.length,
      };
    });
  }, [receipts, selectedYear]);

  // Individual receipts in the currently selected range (month for daily, year for monthly)
  const receiptsInRange = useMemo(() => {
    return receipts
      .filter(r => {
        const d = new Date(r.receiptDate);
        if (d.getFullYear() !== selectedYear) return false;
        if (viewType === 'daily' && d.getMonth() !== selectedMonth) return false;
        return true;
      })
      .sort((a, b) => new Date(b.receiptDate).getTime() - new Date(a.receiptDate).getTime());
  }, [receipts, selectedYear, selectedMonth, viewType]);

  // Summary stats
  const stats = useMemo(() => {
    const data = viewType === 'daily' ? dailyData : monthlyData;
    const totalSales = data.reduce((sum, d) => sum + d.total, 0);
    const totalCash = data.reduce((sum, d) => sum + d.cash, 0);
    const totalCredit = data.reduce((sum, d) => sum + d.credit, 0);
    const totalCount = data.reduce((sum, d) => sum + d.count, 0);
    const avgPerDay = viewType === 'daily' 
      ? totalSales / (dailyData.filter(d => d.count > 0).length || 1)
      : totalSales / 12;
    
    return { totalSales, totalCash, totalCredit, totalCount, avgPerDay };
  }, [dailyData, monthlyData, viewType]);

  const chartConfig = {
    cash: { label: 'เงินสด', color: 'hsl(var(--primary))' },
    transfer: { label: 'เงินโอน', color: 'hsl(217 91% 60%)' },
    credit: { label: 'ลงบัญชี', color: 'hsl(var(--muted-foreground))' },
    total: { label: 'รวม', color: 'hsl(var(--primary))' },
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-2">
          <Button
            variant={viewType === 'daily' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewType('daily')}
          >
            รายวัน
          </Button>
          <Button
            variant={viewType === 'monthly' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewType('monthly')}
          >
            รายเดือน
          </Button>
        </div>
        
        <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map(y => (
              <SelectItem key={y} value={y.toString()}>{y + 543}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {viewType === 'daily' && (
          <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m, i) => (
                <SelectItem key={i} value={i.toString()}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="ml-auto flex gap-2 items-center">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn('justify-start text-left font-normal', !printDate && 'text-muted-foreground')}>
                <CalendarIcon className="h-4 w-4 mr-1" />
                {format(printDate, 'dd/MM/yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <DatePicker mode="single" selected={printDate} onSelect={(d) => d && setPrintDate(d)} initialFocus className={cn('p-3 pointer-events-auto')} />
            </PopoverContent>
          </Popover>
          <Button size="sm" onClick={handlePrintDay}>
            <Printer className="h-4 w-4 mr-1" />
            พิมพ์รายงานวันนี้
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">ยอดขายรวม</span>
            </div>
            <div className="text-lg font-bold mt-1">{formatCurrency(stats.totalSales)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-green-600" />
              <span className="text-xs text-muted-foreground">เงินสด</span>
            </div>
            <div className="text-lg font-bold mt-1 text-green-600">{formatCurrency(stats.totalCash)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-orange-600" />
              <span className="text-xs text-muted-foreground">ลงบิล</span>
            </div>
            <div className="text-lg font-bold mt-1 text-orange-600">{formatCurrency(stats.totalCredit)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              <span className="text-xs text-muted-foreground">จำนวนบิล</span>
            </div>
            <div className="text-lg font-bold mt-1">{stats.totalCount} ใบ</div>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            กราฟยอดขาย {viewType === 'daily' ? `${months[selectedMonth]} ${selectedYear + 543}` : `ปี ${selectedYear + 543}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            {viewType === 'daily' ? (
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis 
                  dataKey="day" 
                  fontSize={10} 
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  fontSize={10} 
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${(v/1000).toFixed(0)}k`}
                />
                <ChartTooltip 
                  content={<ChartTooltipContent />}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Legend />
                <Bar dataKey="cash" name="เงินสด" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="transfer" name="เงินโอน" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="credit" name="ลงบัญชี" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis 
                  dataKey="month" 
                  fontSize={10} 
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  fontSize={10} 
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${(v/1000).toFixed(0)}k`}
                />
                <ChartTooltip 
                  content={<ChartTooltipContent />}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="total" 
                  name="ยอดรวม" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--primary))' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="cash" 
                  name="เงินสด" 
                  stroke="hsl(142, 76%, 36%)" 
                  strokeWidth={2}
                />
                <Line 
                  type="monotone" 
                  dataKey="transfer" 
                  name="เงินโอน" 
                  stroke="hsl(217 91% 60%)" 
                  strokeWidth={2}
                />
                <Line 
                  type="monotone" 
                  dataKey="credit" 
                  name="ลงบัญชี" 
                  stroke="hsl(25, 95%, 53%)" 
                  strokeWidth={2}
                />
              </LineChart>
            )}
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Details Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">รายละเอียด</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{viewType === 'daily' ? 'วันที่' : 'เดือน'}</TableHead>
                  <TableHead className="text-right">เงินสด</TableHead>
                  <TableHead className="text-right">เงินโอน</TableHead>
                  <TableHead className="text-right">ลงบัญชี</TableHead>
                  <TableHead className="text-right">รวม</TableHead>
                  <TableHead className="text-center">จำนวนบิล</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(viewType === 'daily' ? dailyData.filter(d => d.count > 0) : monthlyData.filter(d => d.count > 0)).map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">
                      {viewType === 'daily' ? row.date : (row as any).fullMonth}
                    </TableCell>
                    <TableCell className="text-right text-green-600">
                      {formatCurrency(row.cash)}
                    </TableCell>
                    <TableCell className="text-right text-blue-600">
                      {formatCurrency((row as any).transfer || 0)}
                    </TableCell>
                    <TableCell className="text-right text-orange-600">
                      {formatCurrency(row.credit)}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {formatCurrency(row.total)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{row.count}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {(viewType === 'daily' ? dailyData.filter(d => d.count > 0) : monthlyData.filter(d => d.count > 0)).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      ไม่มีข้อมูลในช่วงเวลาที่เลือก
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Individual receipts list with delete (admin/staff) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>รายการใบเสร็จในช่วงที่เลือก ({receiptsInRange.length} ใบ)</span>
            {!canDeleteReceipts && (
              <span className="text-xs font-normal text-muted-foreground">เฉพาะแอดมินหรือพนักงานสามารถลบได้</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>เลขที่</TableHead>
                  <TableHead>วันที่</TableHead>
                  <TableHead>ลูกค้า</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead className="text-right">ยอดรวม</TableHead>
                  {canDeleteReceipts && <TableHead className="text-center">จัดการ</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {receiptsInRange.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canDeleteReceipts ? 6 : 5} className="text-center text-muted-foreground py-8">
                      ไม่มีใบเสร็จในช่วงเวลาที่เลือก
                    </TableCell>
                  </TableRow>
                ) : (
                  receiptsInRange.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.receiptNumber}</TableCell>
                      <TableCell className="text-sm">
                        {new Intl.DateTimeFormat('th-TH', {
                          day: '2-digit', month: '2-digit', year: '2-digit',
                          hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok',
                        }).format(new Date(r.receiptDate))}
                      </TableCell>
                      <TableCell className="text-sm">{r.customerName || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {PAYMENT_STATUS_LABELS[r.paymentStatus || 'pending']}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(r.total)}</TableCell>
                      {canDeleteReceipts && (
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => setReceiptToDelete(r)}
                            title="ลบใบเสร็จ"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <DeleteReceiptDialog
        open={!!receiptToDelete}
        onOpenChange={(open) => { if (!open) setReceiptToDelete(null); }}
        title={`ต้องการลบใบเสร็จ ${receiptToDelete?.receiptNumber ?? ''}?`}
        description="การลบนี้ไม่สามารถกู้คืนได้ ใบเสร็จและข้อมูลที่เกี่ยวข้องจะถูกลบถาวร"
        isDeleting={isDeletingReceipt}
        onConfirm={() => void handleDeleteReceipt()}
      />
    </div>
  );
}
