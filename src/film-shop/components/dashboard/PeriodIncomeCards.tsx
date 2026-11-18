import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, CalendarDays, CalendarRange } from 'lucide-react';
import { useAppData } from '@/film-shop/hooks/useAppData';

const fmt = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(n || 0);

interface PeriodCardProps {
  title: string;
  icon: React.ElementType;
  startDate: Date;
  endDate: Date;
  variant: 'primary' | 'success' | 'accent';
}

function PeriodCard({ title, icon: Icon, startDate, endDate, variant }: PeriodCardProps) {
  const { invoices, rubberStampOrders } = useAppData();

  const breakdown = useMemo(() => {
    const inRange = (d: Date) => d >= startDate && d <= endDate;
    const docs = invoices.filter(i => inRange(new Date(i.documentDate || i.createdAt)));
    const invTotal = docs
      .filter(i => i.status === 'paid')
      .reduce((s, i) => s + i.total, 0);
    const docCount = docs.length;
    const dueTotal = docs.reduce((s, i) => s + (i.amountDue || 0), 0);
    const stampTotal = rubberStampOrders
      .filter(o => inRange(new Date(o.createdAt)) && o.paymentStatus === 'paid')
      .reduce((s, o) => s + o.total, 0);
    return { invTotal, stampTotal, docCount, dueTotal };
  }, [invoices, rubberStampOrders, startDate, endDate]);

  const total = breakdown.invTotal + breakdown.stampTotal;

  const colorClass = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    accent: 'bg-accent/10 text-accent',
  }[variant];

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className={`rounded-lg p-2 ${colorClass}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="text-sm font-medium text-muted-foreground">{title}</div>
        </div>
        <div className="text-3xl font-bold">{fmt(total)}</div>
        <div className="grid grid-cols-3 gap-1 text-xs text-muted-foreground">
          <div>📄 เอกสาร: <span className="font-semibold text-foreground">{fmt(breakdown.invTotal)}</span></div>
          <div>🧾 จำนวน: <span className="font-semibold text-foreground">{breakdown.docCount} ใบ</span></div>
          <div>🏷️ ตรายาง: <span className="font-semibold text-foreground">{fmt(breakdown.stampTotal)}</span></div>
        </div>
        <div className="text-xs text-muted-foreground">
          ค้างชำระในช่วงนี้: <span className="font-semibold text-foreground">{fmt(breakdown.dueTotal)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function PeriodIncomeCards() {
  const { dayStart, dayEnd, weekStart, weekEnd, monthStart, monthEnd } = useMemo(() => {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const weekStart = new Date(dayStart);
    weekStart.setDate(dayStart.getDate() - dayStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return { dayStart, dayEnd, weekStart, weekEnd: dayEnd, monthStart, monthEnd: dayEnd };
  }, []);

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <PeriodCard title="รายได้ต่อวัน (วันนี้)" icon={Calendar} startDate={dayStart} endDate={dayEnd} variant="primary" />
      <PeriodCard title="รายได้สัปดาห์นี้" icon={CalendarDays} startDate={weekStart} endDate={weekEnd} variant="success" />
      <PeriodCard title="รายได้เดือนนี้" icon={CalendarRange} startDate={monthStart} endDate={monthEnd} variant="accent" />
    </div>
  );
}
