import { useState, useMemo } from 'react';
import { StatCard } from './StatCard';
import { PeriodIncomeCards } from './PeriodIncomeCards';
import { useAppData } from '@/film-shop/hooks/useAppData';
import { 
  DollarSign, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Users, 
  Briefcase,
  TrendingUp,
  Stamp,
  FileText,
  Calendar,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { normalizePaymentStatus, PAY_STATUS, PAY_STATUS_OPTIONS, type PaymentStatusKey } from '@/film-shop/utils/paymentStatus';

const DOC_TYPE_LABELS: Record<string, string> = {
  quotation: 'ใบเสนอราคา',
  invoice: 'ใบแจ้งหนี้',
  receipt: 'ใบเสร็จรับเงิน',
  job_order: 'ใบสั่งจ้าง',
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (date: Date) => {
  return new Date(date).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatDateFull = (date: Date) => {
  return new Date(date).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const jobStatusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  'pending': { label: 'รอดำเนินการ', variant: 'secondary' },
  'in-progress': { label: 'กำลังผลิต', variant: 'default' },
  'printing': { label: 'กำลังพิมพ์', variant: 'default' },
  'completed': { label: 'เสร็จสิ้น', variant: 'outline' },
  'delivered': { label: 'ส่งมอบแล้ว', variant: 'outline' },
};

type TimePeriod = 'daily' | 'weekly' | 'monthly';

interface DashboardProps {
  onPageChange?: (page: string, filter?: { paymentStatus?: string; autoFocus?: boolean }) => void;
}

export function Dashboard({ onPageChange }: DashboardProps) {
  const { invoices, rubberStampOrders, getStats } = useAppData();
  const stats = getStats();

  const docDate = (i: typeof invoices[number]) => new Date(i.documentDate || i.createdAt);

  // Outstanding balance across all documents
  const pendingDocs = useMemo(() => {
    const pending = invoices.filter(i => (i.amountDue || 0) > 0);
    return {
      count: pending.length,
      amount: pending.reduce((sum, i) => sum + (i.amountDue || 0), 0),
    };
  }, [invoices]);

  // Documents settled today
  const paidDocs = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const paid = invoices.filter(i => i.status === 'paid' && docDate(i) >= today);
    return {
      count: paid.length,
      amount: paid.reduce((sum, i) => sum + i.total, 0),
    };
  }, [invoices]);

  // Daily document summary by payment status
  const dailySalesSummary = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayDocs = invoices.filter(i => docDate(i) >= today);

    const summary: Record<PaymentStatusKey, { count: number; total: number }> = {
      pending: { count: 0, total: 0 },
      deposit: { count: 0, total: 0 },
      paid: { count: 0, total: 0 },
      credit: { count: 0, total: 0 },
    };

    todayDocs.forEach(i => {
      const status = normalizePaymentStatus(i.status);
      summary[status].count += 1;
      summary[status].total += i.total;
    });

    const grandTotal = todayDocs.reduce((sum, i) => sum + i.total, 0);
    const grandCount = todayDocs.length;

    return { summary, grandTotal, grandCount };
  }, [invoices]);

  // Document type breakdown (this month)
  const docTypeSummary = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const rows = (['quotation', 'invoice', 'receipt', 'job_order'] as const).map(type => {
      const docs = invoices.filter(i => i.type === type && docDate(i) >= monthStart);
      return {
        type,
        label: DOC_TYPE_LABELS[type],
        count: docs.length,
        total: docs.reduce((s, i) => s + i.total, 0),
        due: docs.reduce((s, i) => s + (i.amountDue || 0), 0),
      };
    });
    return rows;
  }, [invoices]);

  const recentInvoices = invoices
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const activeJobs = invoices
    .filter(i => i.jobStatus !== 'delivered' && i.jobStatus !== 'completed')
    .slice(0, 5);

  const getStatusIcon = (status: PaymentStatusKey) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'deposit': return '💰';
      case 'paid': return '✅';
      case 'credit': return '📒';
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">

      {/* Period Income Cards: Daily / Weekly / Monthly */}
      <PeriodIncomeCards />

      {/* Stats Grid - Mobile optimized with Click handlers */}
      <div className="grid grid-cols-2 gap-2 md:gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="รายได้เดือนนี้"
          value={formatCurrency(stats.totalRevenue)}
          icon={TrendingUp}
          variant="success"
          onClick={() => onPageChange?.('reports')}
        />
        <StatCard
          title="ยอดค้างชำระ"
          value={formatCurrency(pendingDocs.amount)}
          subtitle={`จาก ${pendingDocs.count} เอกสาร`}
          icon={Clock}
          variant="warning"
          onClick={() => onPageChange?.('invoices')}
          badge={pendingDocs.count > 0 ? { count: pendingDocs.count, variant: 'destructive' } : undefined}
        />
        <StatCard
          title="เอกสารชำระแล้ววันนี้"
          value={paidDocs.count}
          subtitle={formatCurrency(paidDocs.amount)}
          icon={CheckCircle}
          variant="primary"
          onClick={() => onPageChange?.('invoices')}
        />
        <StatCard
          title="งานกำลังทำ"
          value={stats.activeJobs}
          icon={Briefcase}
          variant="accent"
          onClick={() => onPageChange?.('jobs')}
        />
      </div>

      {/* Daily Sales Summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">📋 สรุปเอกสารวันนี้ ({formatDateFull(new Date())})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>สถานะ</TableHead>
                <TableHead className="text-center">จำนวนเอกสาร</TableHead>
                <TableHead className="text-right">ยอดรวม</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PAY_STATUS_OPTIONS.map(status => (
                <TableRow key={status} className="hover:bg-muted/50">
                  <TableCell>
                    <span className="flex items-center gap-2">
                      {getStatusIcon(status)} {PAY_STATUS[status].label}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">{dailySalesSummary.summary[status].count}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(dailySalesSummary.summary[status].total)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-bold border-t-2">
                <TableCell>รวมทั้งหมด</TableCell>
                <TableCell className="text-center">{dailySalesSummary.grandCount}</TableCell>
                <TableCell className="text-right">{formatCurrency(dailySalesSummary.grandTotal)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Document totals by type (this month) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" /> ยอดเอกสารเดือนนี้ (แยกตามประเภท)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ประเภทเอกสาร</TableHead>
                <TableHead className="text-center">จำนวน</TableHead>
                <TableHead className="text-right">ยอดรวม</TableHead>
                <TableHead className="text-right">ค้างชำระ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docTypeSummary.map(row => (
                <TableRow
                  key={row.type}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={() => onPageChange?.('invoices')}
                >
                  <TableCell>{row.label}</TableCell>
                  <TableCell className="text-center">{row.count}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(row.total)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.due)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-bold border-t-2">
                <TableCell>รวมทั้งหมด</TableCell>
                <TableCell className="text-center">{docTypeSummary.reduce((s, r) => s + r.count, 0)}</TableCell>
                <TableCell className="text-right">{formatCurrency(docTypeSummary.reduce((s, r) => s + r.total, 0))}</TableCell>
                <TableCell className="text-right">{formatCurrency(docTypeSummary.reduce((s, r) => s + r.due, 0))}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Quick Stats Row - Mobile optimized */}
      <div className="grid grid-cols-2 gap-2 md:gap-4">
        <StatCard
          title="ลูกค้า"
          value={stats.totalCustomers}
          icon={Users}
          variant="default"
          onClick={() => onPageChange?.('customers')}
        />
        <StatCard
          title="ค้างชำระ"
          value={stats.unpaidInvoices}
          icon={AlertCircle}
          variant="default"
          onClick={() => onPageChange?.('invoices')}
        />
      </div>



      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Invoices */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">ใบเสร็จล่าสุด</CardTitle>
          </CardHeader>
          <CardContent>
            {recentInvoices.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">ยังไม่มีใบเสร็จ</p>
            ) : (
              <div className="space-y-3">
                {recentInvoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div>
                      <p className="font-medium text-foreground">{invoice.invoiceNumber}</p>
                      <p className="text-sm text-muted-foreground">{invoice.customerName}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-foreground">{formatCurrency(invoice.total)}</p>
                      <Badge variant={invoice.status === 'paid' ? 'default' : invoice.status === 'partial' ? 'secondary' : 'outline'}>
                        {invoice.status === 'paid' ? 'ชำระแล้ว' : invoice.status === 'partial' ? 'ชำระบางส่วน' : 'ค้างชำระ'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Jobs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">งานที่กำลังดำเนินการ</CardTitle>
          </CardHeader>
          <CardContent>
            {activeJobs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">ไม่มีงานที่กำลังดำเนินการ</p>
            ) : (
              <div className="space-y-3">
                {activeJobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div>
                      <p className="font-medium text-foreground">{job.invoiceNumber}</p>
                      <p className="text-sm text-muted-foreground">{job.customerName}</p>
                    </div>
                    <Badge variant={jobStatusLabels[job.jobStatus]?.variant || 'default'}>
                      {jobStatusLabels[job.jobStatus]?.label || job.jobStatus}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}