import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONE, type OrderStatus } from '@/film-shop/types/order';

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn('border', ORDER_STATUS_TONE[status], className)}>
      {ORDER_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}