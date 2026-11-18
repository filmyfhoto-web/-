import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAppData } from '@/film-shop/hooks/useAppData';
import { usePOSData } from '@/film-shop/hooks/usePOSData';
import { FileText, FileDown, Loader2, Calendar as CalendarIcon, Users } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addThaiFont, THAI_MONTHS } from '@/film-shop/utils/thaiFontPDF';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CategoryRevenueReport } from './CategoryRevenueReport';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (date: Date) => {
  return new Date(date).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

// Helper to get week number
const getWeekNumber = (date: Date): number => {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - startOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
};

// Helper to get week range
const getWeekRange = (year: number, week: number): { start: Date; end: Date } => {
  const janFirst = new Date(year, 0, 1);
  const days = (week - 1) * 7 - janFirst.getDay() + 1;
  const start = new Date(year, 0, days);
  const end = new Date(year, 0, days + 6);
  return { start, end };
};

export function SalesReportGenerator() {
  const { invoices, rubberStampOrders, settings } = useAppData();
  const { receipts: posReceipts } = usePOSData();
  
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const currentWeek = getWeekNumber(new Date());
  
  const [reportType, setReportType] = useState<'weekly' | 'monthly' | 'daterange'>('monthly');
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [selectedMonth, setSelectedMonth] = useState(currentMonth.toString());
  const [selectedWeek, setSelectedWeek] = useState(currentWeek.toString());
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [includeInvoices, setIncludeInvoices] = useState(true);
  const [includePOS, setIncludePOS] = useState(true);
  const [includeRubberStamp, setIncludeRubberStamp] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  
  // Get unique years from all data
  const years = useMemo(() => {
    const allDates = [
      ...invoices.map(i => new Date(i.documentDate || i.createdAt)),
      ...posReceipts.map(r => new Date(r.receiptDate)),
      ...rubberStampOrders.map(o => new Date(o.documentDate || o.createdAt)),
    ];
    const uniqueYears = [...new Set(allDates.map(d => d.getFullYear()))];
    return uniqueYears.length > 0 ? uniqueYears.sort((a, b) => b - a) : [currentYear];
  }, [invoices, posReceipts, rubberStampOrders, currentYear]);

  const months = [
    { value: '0', label: 'มกราคม' },
    { value: '1', label: 'กุมภาพันธ์' },
    { value: '2', label: 'มีนาคม' },
    { value: '3', label: 'เมษายน' },
    { value: '4', label: 'พฤษภาคม' },
    { value: '5', label: 'มิถุนายน' },
    { value: '6', label: 'กรกฎาคม' },
    { value: '7', label: 'สิงหาคม' },
    { value: '8', label: 'กันยายน' },
    { value: '9', label: 'ตุลาคม' },
    { value: '10', label: 'พฤศจิกายน' },
    { value: '11', label: 'ธันวาคม' },
  ];

  // Generate weeks for selected year
  const weeks = useMemo(() => {
    const weeksArray = [];
    for (let w = 1; w <= 52; w++) {
      const { start, end } = getWeekRange(parseInt(selectedYear), w);
      weeksArray.push({
        value: w.toString(),
        label: `สัปดาห์ที่ ${w} (${formatDate(start)} - ${formatDate(end)})`,
      });
    }
    return weeksArray;
  }, [selectedYear]);

  // Get unique customers
  const uniqueCustomers = useMemo(() => {
    const customers = new Set<string>();
    invoices.forEach(inv => inv.customerName && customers.add(inv.customerName));
    posReceipts.forEach(r => r.customerName && customers.add(r.customerName));
    rubberStampOrders.forEach(o => o.customerName && customers.add(o.customerName));
    return Array.from(customers).filter(c => c.trim()).sort();
  }, [invoices, posReceipts, rubberStampOrders]);

  // Filter data based on selections
  const filteredData = useMemo(() => {
    const year = parseInt(selectedYear);
    const month = parseInt(selectedMonth);
    const week = parseInt(selectedWeek);
    
    const filterByDate = (date: Date) => {
      const d = new Date(date);
      
      if (reportType === 'daterange') {
        if (!startDate || !endDate) return false;
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        return d >= start && d <= end;
      }
      
      if (d.getFullYear() !== year) return false;
      
      if (reportType === 'monthly') {
        return d.getMonth() === month;
      } else {
        return getWeekNumber(d) === week;
      }
    };
    
    const filterByCustomer = (customerName: string | null | undefined) => {
      if (selectedCustomers.length === 0) return true;
      return customerName ? selectedCustomers.includes(customerName) : false;
    };
    
    const filteredInvoices = includeInvoices 
      ? invoices.filter(inv => filterByDate(inv.documentDate || inv.createdAt) && filterByCustomer(inv.customerName))
      : [];
    
    const filteredPOS = includePOS 
      ? posReceipts.filter(r => filterByDate(r.receiptDate) && filterByCustomer(r.customerName))
      : [];
    
    const filteredStamps = includeRubberStamp 
      ? rubberStampOrders.filter(o => filterByDate(o.documentDate || o.createdAt) && filterByCustomer(o.customerName))
      : [];

    return {
      invoices: filteredInvoices,
      pos: filteredPOS,
      stamps: filteredStamps,
    };
  }, [selectedYear, selectedMonth, selectedWeek, reportType, startDate, endDate, selectedCustomers, includeInvoices, includePOS, includeRubberStamp, invoices, posReceipts, rubberStampOrders]);

  // Calculate totals
  const totals = useMemo(() => {
    const invoiceTotal = filteredData.invoices.reduce((sum, inv) => sum + inv.total, 0);
    const posTotal = filteredData.pos.reduce((sum, r) => sum + r.total, 0);
    const stampTotal = filteredData.stamps.reduce((sum, o) => sum + o.total, 0);
    
    return {
      invoices: invoiceTotal,
      pos: posTotal,
      stamps: stampTotal,
      total: invoiceTotal + posTotal + stampTotal,
      invoiceCount: filteredData.invoices.length,
      posCount: filteredData.pos.length,
      stampCount: filteredData.stamps.length,
    };
  }, [filteredData]);

  const toggleCustomer = (customer: string) => {
    setSelectedCustomers(prev => 
      prev.includes(customer) 
        ? prev.filter(c => c !== customer)
        : [...prev, customer]
    );
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      
      // Add Thai font support
      await addThaiFont(doc);
      
      // Header
      doc.setFontSize(18);
      doc.text(settings.shopName || 'รายงานการขาย', 105, 20, { align: 'center' });
      
      doc.setFontSize(14);
      const periodLabel = reportType === 'daterange'
        ? `${startDate ? format(startDate, 'dd/MM/') + (startDate.getFullYear() + 543) : ''} - ${endDate ? format(endDate, 'dd/MM/') + (endDate.getFullYear() + 543) : ''}`
        : reportType === 'monthly' 
          ? `${THAI_MONTHS[parseInt(selectedMonth)]} ${parseInt(selectedYear) + 543}`
          : `สัปดาห์ที่ ${selectedWeek} ปี ${parseInt(selectedYear) + 543}`;
      doc.text(`รายงานการขาย - ${periodLabel}`, 105, 30, { align: 'center' });
      
      doc.setFontSize(10);
      doc.text(`สร้างเมื่อ: ${new Date().toLocaleString('th-TH')}`, 105, 38, { align: 'center' });
      
      if (selectedCustomers.length > 0) {
        doc.text(`ลูกค้า: ${selectedCustomers.join(', ')}`, 105, 44, { align: 'center' });
      }

      // Summary Section
      doc.setFillColor(245, 245, 245);
      doc.roundedRect(14, 50, 182, 30, 3, 3, 'F');
      
      doc.setFontSize(11);
      doc.text('สรุปยอดขาย', 20, 60);
      doc.text(`ใบแจ้งหนี้/ใบเสร็จ: ${formatCurrency(totals.invoices)} (${totals.invoiceCount} รายการ)`, 20, 68);
      doc.text(`POS: ${formatCurrency(totals.pos)} (${totals.posCount} รายการ)`, 80, 68);
      doc.text(`ตรายาง: ${formatCurrency(totals.stamps)} (${totals.stampCount} รายการ)`, 140, 68);
      
      doc.setFontSize(14);
      doc.text(`รวมทั้งหมด: ${formatCurrency(totals.total)}`, 20, 76);

      let yPos = 90;

      // Invoices Table
      if (filteredData.invoices.length > 0) {
        doc.setFontSize(12);
        doc.text('ใบแจ้งหนี้ / ใบเสนอราคา', 14, yPos);
        yPos += 5;

        autoTable(doc, {
          startY: yPos,
          head: [['ลำดับ', 'วันที่', 'ชื่อลูกค้า', 'ประเภท', 'ยอดรวม']],
          body: filteredData.invoices.map((inv, idx) => [
            (idx + 1).toString(),
            formatDate(inv.documentDate || inv.createdAt),
            inv.customerName,
            inv.type === 'quotation' ? 'ใบเสนอราคา' : inv.type === 'invoice' ? 'ใบแจ้งหนี้' : 'ใบเสร็จ',
            formatCurrency(inv.total),
          ]),
          theme: 'striped',
          headStyles: { fillColor: [79, 70, 229] },
          styles: { font: 'Sarabun' },
          columnStyles: {
            0: { cellWidth: 15 },
            4: { halign: 'right' },
          },
        });
        
        yPos = (doc as any).lastAutoTable.finalY + 15;
      }

      // POS Table
      if (filteredData.pos.length > 0 && yPos < 250) {
        doc.setFontSize(12);
        doc.text('การขาย POS', 14, yPos);
        yPos += 5;

        autoTable(doc, {
          startY: yPos,
          head: [['ลำดับ', 'เลขที่ใบเสร็จ', 'วันที่', 'ชื่อลูกค้า', 'การชำระ', 'ยอดรวม']],
          body: filteredData.pos.map((r, idx) => [
            (idx + 1).toString(),
            r.receiptNumber,
            formatDate(r.receiptDate),
            r.customerName || '-',
            r.paymentType === 'cash' ? 'เงินสด' : 'ลงบิล',
            formatCurrency(r.total),
          ]),
          theme: 'striped',
          headStyles: { fillColor: [34, 197, 94] },
          styles: { font: 'Sarabun' },
          columnStyles: {
            0: { cellWidth: 12 },
            5: { halign: 'right' },
          },
        });
        
        yPos = (doc as any).lastAutoTable.finalY + 15;
      }

      // Rubber Stamps Table
      if (filteredData.stamps.length > 0 && yPos < 250) {
        doc.setFontSize(12);
        doc.text('ออเดอร์ตรายาง', 14, yPos);
        yPos += 5;

        autoTable(doc, {
          startY: yPos,
          head: [['ลำดับ', 'เลขที่ออเดอร์', 'วันที่', 'ชื่อลูกค้า', 'สถานะ', 'ยอดรวม']],
          body: filteredData.stamps.map((o, idx) => [
            (idx + 1).toString(),
            o.orderNumber,
            formatDate(o.documentDate || o.createdAt),
            o.customerName,
            o.status === 'pending' ? 'รอดำเนินการ' : o.status === 'completed' ? 'เสร็จสิ้น' : o.status,
            formatCurrency(o.total),
          ]),
          theme: 'striped',
          headStyles: { fillColor: [168, 85, 247] },
          styles: { font: 'Sarabun' },
          columnStyles: {
            0: { cellWidth: 12 },
            5: { halign: 'right' },
          },
        });
      }

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(128);
        doc.text(`หน้า ${i} จาก ${pageCount}`, 105, 290, { align: 'center' });
      }

      // Save
      const fileName = reportType === 'daterange'
        ? `รายงานการขาย-ช่วงวันที่-${startDate ? format(startDate, 'yyyyMMdd') : ''}-${endDate ? format(endDate, 'yyyyMMdd') : ''}.pdf`
        : `รายงานการขาย-${reportType === 'monthly' ? 'รายเดือน' : 'รายสัปดาห์'}-${selectedYear}-${reportType === 'monthly' ? selectedMonth : `w${selectedWeek}`}.pdf`;
      doc.save(fileName);
      
      toast.success('ดาวน์โหลดรายงาน PDF สำเร็จ');
    } catch (error) {
      toast.error('เกิดข้อผิดพลาดในการสร้างรายงาน PDF');
      console.error('PDF export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <CategoryRevenueReport />
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            รายงานการขาย
          </CardTitle>
          <CardDescription>
            สร้างรายงานการขายแบบรายสัปดาห์ รายเดือน หรือช่วงวันที่ พร้อมกรองตามลูกค้า
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Report Type */}
          <div className="flex gap-4 flex-wrap items-end">
            <div className="space-y-1">
              <Label>ประเภทรายงาน</Label>
              <Select value={reportType} onValueChange={(v: 'weekly' | 'monthly' | 'daterange') => setReportType(v)}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">รายสัปดาห์</SelectItem>
                  <SelectItem value="monthly">รายเดือน</SelectItem>
                  <SelectItem value="daterange">ช่วงวันที่</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {reportType !== 'daterange' && (
              <div className="space-y-1">
                <Label>ปี</Label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map(year => (
                      <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {reportType === 'monthly' && (
              <div className="space-y-1">
                <Label>เดือน</Label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map(month => (
                      <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {reportType === 'weekly' && (
              <div className="space-y-1">
                <Label>สัปดาห์</Label>
                <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                  <SelectTrigger className="w-80">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {weeks.map(week => (
                      <SelectItem key={week.value} value={week.value}>{week.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {reportType === 'daterange' && (
              <>
                <div className="space-y-1">
                  <Label>วันเริ่มต้น</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-[160px] justify-start text-left font-normal",
                          !startDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, 'dd/MM/yyyy') : 'เลือกวันที่'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={setStartDate}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <Label>วันสิ้นสุด</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-[160px] justify-start text-left font-normal",
                          !endDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, 'dd/MM/yyyy') : 'เลือกวันที่'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={setEndDate}
                        initialFocus
                        disabled={(date) => startDate ? date < startDate : false}
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </>
            )}
            
            <Button 
              onClick={handleExportPDF} 
              disabled={isExporting}
              className="gap-2"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  กำลังสร้าง PDF...
                </>
              ) : (
                <>
                  <FileDown className="h-4 w-4" />
                  ดาวน์โหลด PDF
                </>
              )}
            </Button>
          </div>

          {/* Data Sources */}
          <div className="border-t pt-4">
            <Label className="mb-3 block">แหล่งข้อมูล</Label>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Checkbox id="includeInvoices" checked={includeInvoices} onCheckedChange={(v) => setIncludeInvoices(!!v)} />
                <Label htmlFor="includeInvoices" className="cursor-pointer">ใบเสร็จ/ใบแจ้งหนี้</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="includePOS" checked={includePOS} onCheckedChange={(v) => setIncludePOS(!!v)} />
                <Label htmlFor="includePOS" className="cursor-pointer">POS</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="includeRubberStamp" checked={includeRubberStamp} onCheckedChange={(v) => setIncludeRubberStamp(!!v)} />
                <Label htmlFor="includeRubberStamp" className="cursor-pointer">ตรายาง</Label>
              </div>
            </div>
          </div>

          {/* Customer Filter */}
          <div className="border-t pt-4">
            <Label className="mb-3 flex items-center gap-2">
              <Users className="h-4 w-4" />
              กรองตามลูกค้า
              {selectedCustomers.length > 0 && (
                <Badge variant="secondary">{selectedCustomers.length} เลือก</Badge>
              )}
            </Label>
            <ScrollArea className="h-32 border rounded-lg p-2">
              <div className="space-y-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => setSelectedCustomers([])}
                >
                  ทั้งหมด (ไม่กรอง)
                </Button>
                {uniqueCustomers.map(customer => (
                  <div key={customer} className="flex items-center gap-2 px-2">
                    <Checkbox 
                      id={`customer-${customer}`} 
                      checked={selectedCustomers.includes(customer)} 
                      onCheckedChange={() => toggleCustomer(customer)} 
                    />
                    <Label htmlFor={`customer-${customer}`} className="text-sm cursor-pointer flex-1 truncate">
                      {customer}
                    </Label>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">ใบเสร็จ/ใบแจ้งหนี้</p>
              <p className="text-2xl font-bold">{formatCurrency(totals.invoices)}</p>
              <p className="text-xs text-muted-foreground">{totals.invoiceCount} รายการ</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">POS</p>
              <p className="text-2xl font-bold">{formatCurrency(totals.pos)}</p>
              <p className="text-xs text-muted-foreground">{totals.posCount} รายการ</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">ตรายาง</p>
              <p className="text-2xl font-bold">{formatCurrency(totals.stamps)}</p>
              <p className="text-xs text-muted-foreground">{totals.stampCount} รายการ</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-primary/5">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">ยอดรวมทั้งหมด</p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(totals.total)}</p>
              <p className="text-xs text-muted-foreground">{totals.invoiceCount + totals.posCount + totals.stampCount} รายการ</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">ตัวอย่างข้อมูล</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ประเภท</TableHead>
                  <TableHead>เลขที่</TableHead>
                  <TableHead>วันที่</TableHead>
                  <TableHead>ลูกค้า</TableHead>
                  <TableHead className="text-right">ยอดรวม</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.invoices.slice(0, 5).map(inv => (
                  <TableRow key={inv.id}>
                    <TableCell><Badge variant="outline">Invoice</Badge></TableCell>
                    <TableCell>{inv.invoiceNumber}</TableCell>
                    <TableCell>{formatDate(inv.documentDate || inv.createdAt)}</TableCell>
                    <TableCell>{inv.customerName}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(inv.total)}</TableCell>
                  </TableRow>
                ))}
                {filteredData.pos.slice(0, 5).map(r => (
                  <TableRow key={r.id}>
                    <TableCell><Badge variant="secondary">POS</Badge></TableCell>
                    <TableCell>{r.receiptNumber}</TableCell>
                    <TableCell>{formatDate(r.receiptDate)}</TableCell>
                    <TableCell>{r.customerName || '-'}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(r.total)}</TableCell>
                  </TableRow>
                ))}
                {filteredData.stamps.slice(0, 5).map(o => (
                  <TableRow key={o.id}>
                    <TableCell><Badge className="bg-primary">Stamp</Badge></TableCell>
                    <TableCell>{o.orderNumber}</TableCell>
                    <TableCell>{formatDate(o.documentDate || o.createdAt)}</TableCell>
                    <TableCell>{o.customerName}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(o.total)}</TableCell>
                  </TableRow>
                ))}
                {filteredData.invoices.length === 0 && filteredData.pos.length === 0 && filteredData.stamps.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      ไม่พบข้อมูลในช่วงเวลาที่เลือก
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
