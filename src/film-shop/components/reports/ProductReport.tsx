import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useAppData } from '@/film-shop/hooks/useAppData';
import { BarChart3, TrendingUp, Package, FileDown, Loader2 } from 'lucide-react';
import { ProductType } from '@/film-shop/types';
import { exportSalesReportToPDF } from '@/film-shop/utils/pdfExport';
import { toast } from 'sonner';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

const productLabels: Record<ProductType, string> = {
  vinyl: 'ไวนิล',
  paswood: 'พาสวูด',
  sticker: 'สติ๊กเกอร์',
  foamboard: 'โฟมบอร์ด',
};

const productLabelsTH: Record<ProductType | 'rubberStamp', string> = {
  vinyl: 'ไวนิล',
  paswood: 'พาสวูด',
  sticker: 'สติ๊กเกอร์',
  foamboard: 'โฟมบอร์ด',
  rubberStamp: 'ตรายาง',
};

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 0,
  }).format(amount);
};

export function ProductReport() {
  const { invoices, rubberStampOrders, settings } = useAppData();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [isExporting, setIsExporting] = useState(false);

  const years = useMemo(() => {
    const allDates = [
      ...invoices.map(i => new Date(i.createdAt)),
      ...rubberStampOrders.map(o => new Date(o.createdAt)),
    ];
    const uniqueYears = [...new Set(allDates.map(d => d.getFullYear()))];
    return uniqueYears.length > 0 ? uniqueYears.sort((a, b) => b - a) : [currentYear];
  }, [invoices, rubberStampOrders, currentYear]);

  const months = [
    { value: 'all', label: 'ทั้งหมด' },
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

  const productSales = useMemo(() => {
    const sales: Record<ProductType | 'rubberStamp', { total: number; count: number; sqm: number }> = {
      vinyl: { total: 0, count: 0, sqm: 0 },
      paswood: { total: 0, count: 0, sqm: 0 },
      sticker: { total: 0, count: 0, sqm: 0 },
      foamboard: { total: 0, count: 0, sqm: 0 },
      rubberStamp: { total: 0, count: 0, sqm: 0 },
    };

    // Filter invoices by date
    const filteredInvoices = invoices.filter(inv => {
      const date = new Date(inv.createdAt);
      const yearMatch = date.getFullYear() === parseInt(selectedYear);
      const monthMatch = selectedMonth === 'all' || date.getMonth() === parseInt(selectedMonth);
      return yearMatch && monthMatch;
    });

    // Calculate product sales from invoice items
    filteredInvoices.forEach(inv => {
      inv.items.forEach(item => {
        const productName = item.name.toLowerCase();
        let productType: ProductType = 'vinyl';
        
        if (productName.includes('พาสวูด') || productName.includes('paswood')) {
          productType = 'paswood';
        } else if (productName.includes('สติ๊กเกอร์') || productName.includes('sticker')) {
          productType = 'sticker';
        } else if (productName.includes('โฟมบอร์ด') || productName.includes('foamboard')) {
          productType = 'foamboard';
        }

        sales[productType].total += item.total;
        sales[productType].count += item.quantity;
        sales[productType].sqm += (item.width * item.height * item.quantity) / 10000;
      });
    });

    // Filter rubber stamp orders by date
    const filteredStampOrders = rubberStampOrders.filter(order => {
      const date = new Date(order.createdAt);
      const yearMatch = date.getFullYear() === parseInt(selectedYear);
      const monthMatch = selectedMonth === 'all' || date.getMonth() === parseInt(selectedMonth);
      return yearMatch && monthMatch;
    });

    filteredStampOrders.forEach(order => {
      sales.rubberStamp.total += order.total;
      sales.rubberStamp.count += order.items.reduce((sum, item) => sum + item.quantity, 0);
    });

    return sales;
  }, [invoices, rubberStampOrders, selectedYear, selectedMonth]);

  const chartData = useMemo(() => {
    return [
      { name: 'ไวนิล', value: productSales.vinyl.total, count: productSales.vinyl.count },
      { name: 'พาสวูด', value: productSales.paswood.total, count: productSales.paswood.count },
      { name: 'สติ๊กเกอร์', value: productSales.sticker.total, count: productSales.sticker.count },
      { name: 'โฟมบอร์ด', value: productSales.foamboard.total, count: productSales.foamboard.count },
      { name: 'ตรายาง', value: productSales.rubberStamp.total, count: productSales.rubberStamp.count },
    ];
  }, [productSales]);

  const monthlyData = useMemo(() => {
    const data: { month: string; vinyl: number; paswood: number; sticker: number; foamboard: number; rubberStamp: number }[] = [];
    
    for (let m = 0; m < 12; m++) {
      const monthInvoices = invoices.filter(inv => {
        const date = new Date(inv.createdAt);
        return date.getFullYear() === parseInt(selectedYear) && date.getMonth() === m;
      });

      const monthStampOrders = rubberStampOrders.filter(order => {
        const date = new Date(order.createdAt);
        return date.getFullYear() === parseInt(selectedYear) && date.getMonth() === m;
      });

      const monthData = { month: months[m + 1].label.slice(0, 3), vinyl: 0, paswood: 0, sticker: 0, foamboard: 0, rubberStamp: 0 };

      monthInvoices.forEach(inv => {
        inv.items.forEach(item => {
          const productName = item.name.toLowerCase();
          if (productName.includes('พาสวูด') || productName.includes('paswood')) {
            monthData.paswood += item.total;
          } else if (productName.includes('สติ๊กเกอร์') || productName.includes('sticker')) {
            monthData.sticker += item.total;
          } else if (productName.includes('โฟมบอร์ด') || productName.includes('foamboard')) {
            monthData.foamboard += item.total;
          } else {
            monthData.vinyl += item.total;
          }
        });
      });

      monthStampOrders.forEach(order => {
        monthData.rubberStamp += order.total;
      });

      data.push(monthData);
    }

    return data;
  }, [invoices, rubberStampOrders, selectedYear, months]);

  const totalSales = chartData.reduce((sum, item) => sum + item.value, 0);

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const thaiYear = parseInt(selectedYear) + 543;
      const periodLabel = selectedMonth === 'all'
        ? `ทั้งปี ${thaiYear}`
        : `${months[parseInt(selectedMonth) + 1].label} ${thaiYear}`;

      const products = Object.entries(productSales).map(([key, data]) => ({
        name: productLabelsTH[key as ProductType | 'rubberStamp'],
        count: data.count,
        sqm: key !== 'rubberStamp' ? data.sqm : 0,
        total: data.total,
        percentage: totalSales > 0 ? ((data.total / totalSales) * 100).toFixed(1) : '0',
      }));

      await exportSalesReportToPDF({
        title: 'รายงานยอดขายตามประเภทสินค้า',
        period: periodLabel,
        shopName: settings.shopName || 'ร้านค้า',
        products,
        totalSales,
        totalCount: chartData.reduce((sum, d) => sum + d.count, 0),
        totalSqm: productSales.vinyl.sqm + productSales.paswood.sqm + productSales.sticker.sqm + productSales.foamboard.sqm,
        generatedAt: new Date().toLocaleString('th-TH'),
      });

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
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            รายงานยอดขายตามประเภทสินค้า
          </CardTitle>
          <CardDescription>
            ดูสรุปยอดขายแยกตามประเภทสินค้า
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap items-center">
            <div className="w-32">
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(year => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map(month => (
                    <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button 
              onClick={handleExportPDF} 
              disabled={isExporting}
              variant="outline"
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
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {chartData.map((item, index) => (
          <Card key={item.name}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="text-sm font-medium">{item.name}</span>
              </div>
              <div className="text-2xl font-bold">{formatCurrency(item.value)}</div>
              <p className="text-sm text-muted-foreground">{item.count} ชิ้น</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              สัดส่วนยอดขาย
            </CardTitle>
            <CardDescription>ยอดรวม: {formatCurrency(totalSales)}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData.filter(d => d.value > 0)}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {chartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              ยอดขายรายเดือน
            </CardTitle>
            <CardDescription>แยกตามประเภทสินค้า</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} className="text-xs" />
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                  />
                  <Legend />
                  <Bar dataKey="vinyl" name="ไวนิล" fill={COLORS[0]} />
                  <Bar dataKey="paswood" name="พาสวูด" fill={COLORS[1]} />
                  <Bar dataKey="sticker" name="สติ๊กเกอร์" fill={COLORS[2]} />
                  <Bar dataKey="foamboard" name="โฟมบอร์ด" fill={COLORS[3]} />
                  <Bar dataKey="rubberStamp" name="ตรายาง" fill="hsl(var(--chart-5))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card>
        <CardHeader>
          <CardTitle>สรุปยอดขายตามประเภท</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2">ประเภทสินค้า</th>
                  <th className="text-right py-3 px-2">จำนวน</th>
                  <th className="text-right py-3 px-2">พื้นที่ (ตร.ม.)</th>
                  <th className="text-right py-3 px-2">ยอดขาย</th>
                  <th className="text-right py-3 px-2">สัดส่วน</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(productSales).map(([key, data]) => {
                  const label = key === 'rubberStamp' ? 'ตรายาง' : productLabels[key as ProductType];
                  const percentage = totalSales > 0 ? ((data.total / totalSales) * 100).toFixed(1) : '0';
                  return (
                    <tr key={key} className="border-b">
                      <td className="py-3 px-2">{label}</td>
                      <td className="text-right py-3 px-2">{data.count}</td>
                      <td className="text-right py-3 px-2">
                        {key !== 'rubberStamp' ? data.sqm.toFixed(2) : '-'}
                      </td>
                      <td className="text-right py-3 px-2 font-medium">{formatCurrency(data.total)}</td>
                      <td className="text-right py-3 px-2">{percentage}%</td>
                    </tr>
                  );
                })}
                <tr className="font-bold bg-muted">
                  <td className="py-3 px-2">รวมทั้งหมด</td>
                  <td className="text-right py-3 px-2">{chartData.reduce((sum, d) => sum + d.count, 0)}</td>
                  <td className="text-right py-3 px-2">
                    {(productSales.vinyl.sqm + productSales.paswood.sqm + productSales.sticker.sqm + productSales.foamboard.sqm).toFixed(2)}
                  </td>
                  <td className="text-right py-3 px-2">{formatCurrency(totalSales)}</td>
                  <td className="text-right py-3 px-2">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
