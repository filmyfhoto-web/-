import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Inbox, Flame, PackageCheck, AlertTriangle } from 'lucide-react';
import { useFilmOrders } from '@/film-shop/hooks/useFilmOrders';
import { isOverdue } from '@/film-shop/types/order';

const money = (n: number) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

interface Props {
  onPageChange?: (page: string) => void;
}

/** Today-at-a-glance strip: what came in, what is stuck, what is ready. */
export function OrderTodayPanel({ onPageChange }: Props) {
  const { orders, stats } = useFilmOrders();
  const overdue = orders.filter((o) => !o.isDraft && isOverdue(o)).length;

  const tiles = [
    { key: 'today', icon: Inbox, label: 'ออเดอร์วันนี้', value: `${stats.today}`, hint: `${money(stats.todayAmount)} บาท`, tone: 'bg-primary/10 text-primary' },
    { key: 'active', icon: PackageCheck, label: 'อยู่ในคิว', value: `${stats.active}`, hint: 'ยังไม่ส่งมอบ', tone: 'bg-accent/20 text-accent-foreground' },
    { key: 'urgent', icon: Flame, label: 'งานด่วน', value: `${stats.urgent}`, hint: 'ต้องทำก่อน', tone: 'bg-warning/15 text-warning' },
    { key: 'overdue', icon: AlertTriangle, label: 'เลยกำหนด', value: `${overdue}`, hint: 'ตามงานด่วน', tone: 'bg-destructive/10 text-destructive' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">งานวันนี้</h2>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onPageChange?.('orders')}>
            <Plus className="h-4 w-4 mr-1" /> รับออเดอร์
          </Button>
          <Button size="sm" variant="outline" onClick={() => onPageChange?.('queue')}>
            เปิดคิวงาน
            {stats.ready > 0 && <Badge variant="secondary" className="ml-1">พร้อมรับ {stats.ready}</Badge>}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map(({ key, icon: Icon, label, value, hint, tone }) => (
          <Card key={key} className="cursor-pointer hover:shadow-card-hover transition-shadow" onClick={() => onPageChange?.('queue')}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${tone}`}><Icon className="h-4 w-4" /></div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold tabular-nums">{value}</p>
                  <p className="text-xs text-muted-foreground truncate">{label} · {hint}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default OrderTodayPanel;