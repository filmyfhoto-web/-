import { useMemo } from 'react';
import { differenceInDays, differenceInHours, format, isPast } from 'date-fns';
import { th } from 'date-fns/locale';
import { Bell, AlertTriangle, Clock, CheckCircle } from 'lucide-react';
import { useAppData } from '@/film-shop/hooks/useAppData';
import { Invoice, RubberStampOrder } from '@/film-shop/types';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { filmNavigate } from '@/film-shop/lib/filmNav';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

interface NotificationItem {
  id: string;
  type: 'vinyl' | 'rubberStamp';
  orderNumber: string;
  customerName: string;
  dueDate: Date;
  status: string;
  urgency: 'overdue' | 'urgent' | 'warning' | 'normal';
}

export function JobNotifications() {
  const { invoices, rubberStampOrders } = useAppData();

  const notifications = useMemo(() => {
    const items: NotificationItem[] = [];
    const now = new Date();

    // Check vinyl invoices
    invoices
      .filter((inv: Invoice) => 
        inv.jobStatus !== 'delivered' && 
        inv.jobStatus !== 'completed' &&
        inv.dueDate
      )
      .forEach((inv: Invoice) => {
        if (!inv.dueDate) return;
        const dueDate = new Date(inv.dueDate);
        const daysUntilDue = differenceInDays(dueDate, now);
        
        let urgency: NotificationItem['urgency'] = 'normal';
        if (isPast(dueDate)) {
          urgency = 'overdue';
        } else if (daysUntilDue <= 1) {
          urgency = 'urgent';
        } else if (daysUntilDue <= 3) {
          urgency = 'warning';
        }

        if (urgency !== 'normal') {
          items.push({
            id: inv.id,
            type: 'vinyl',
            orderNumber: inv.invoiceNumber,
            customerName: inv.customerName,
            dueDate,
            status: inv.jobStatus,
            urgency,
          });
        }
      });

    // Check rubber stamp orders - use createdAt + 3 days as default due date if no explicit dueDate
    rubberStampOrders
      .filter((order: RubberStampOrder) => 
        order.status !== 'delivered' && 
        order.status !== 'completed'
      )
      .forEach((order: RubberStampOrder) => {
        const createdDate = new Date(order.createdAt);
        const defaultDueDate = new Date(createdDate);
        defaultDueDate.setDate(defaultDueDate.getDate() + 3);
        
        const daysUntilDue = differenceInDays(defaultDueDate, now);
        
        let urgency: NotificationItem['urgency'] = 'normal';
        if (isPast(defaultDueDate)) {
          urgency = 'overdue';
        } else if (daysUntilDue <= 1) {
          urgency = 'urgent';
        } else if (daysUntilDue <= 2) {
          urgency = 'warning';
        }

        if (urgency !== 'normal') {
          items.push({
            id: order.id,
            type: 'rubberStamp',
            orderNumber: order.orderNumber,
            customerName: order.customerName,
            dueDate: defaultDueDate,
            status: order.status,
            urgency,
          });
        }
      });

    // Sort by urgency
    const urgencyOrder = { overdue: 0, urgent: 1, warning: 2, normal: 3 };
    return items.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
  }, [invoices, rubberStampOrders]);

  const getUrgencyColor = (urgency: NotificationItem['urgency']) => {
    switch (urgency) {
      case 'overdue':
        return 'text-red-500 bg-red-500/10';
      case 'urgent':
        return 'text-orange-500 bg-orange-500/10';
      case 'warning':
        return 'text-yellow-500 bg-yellow-500/10';
      default:
        return 'text-muted-foreground bg-muted';
    }
  };

  const getUrgencyIcon = (urgency: NotificationItem['urgency']) => {
    switch (urgency) {
      case 'overdue':
        return <AlertTriangle className="h-4 w-4" />;
      case 'urgent':
        return <Clock className="h-4 w-4" />;
      case 'warning':
        return <Bell className="h-4 w-4" />;
      default:
        return <CheckCircle className="h-4 w-4" />;
    }
  };

  const getUrgencyLabel = (urgency: NotificationItem['urgency']) => {
    switch (urgency) {
      case 'overdue':
        return 'เลยกำหนด';
      case 'urgent':
        return 'ด่วนมาก';
      case 'warning':
        return 'ใกล้ถึงกำหนด';
      default:
        return 'ปกติ';
    }
  };

  const formatDueMessage = (dueDate: Date, urgency: NotificationItem['urgency']) => {
    const now = new Date();
    if (urgency === 'overdue') {
      const daysOverdue = differenceInDays(now, dueDate);
      if (daysOverdue === 0) {
        const hoursOverdue = differenceInHours(now, dueDate);
        return `เลยกำหนด ${hoursOverdue} ชั่วโมง`;
      }
      return `เลยกำหนด ${daysOverdue} วัน`;
    }
    const daysUntilDue = differenceInDays(dueDate, now);
    if (daysUntilDue === 0) {
      const hoursUntilDue = differenceInHours(dueDate, now);
      return `อีก ${hoursUntilDue} ชั่วโมง`;
    }
    return `อีก ${daysUntilDue} วัน`;
  };

  const overdueCount = notifications.filter(n => n.urgency === 'overdue').length;
  const urgentCount = notifications.filter(n => n.urgency === 'urgent' || n.urgency === 'warning').length;
  const totalAlerts = overdueCount + urgentCount;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {totalAlerts > 0 && (
            <span className={`absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${overdueCount > 0 ? 'bg-red-500' : 'bg-orange-500'}`}>
              {totalAlerts > 9 ? '9+' : totalAlerts}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="border-b p-3">
          <h4 className="font-semibold">การแจ้งเตือนงาน</h4>
          <p className="text-sm text-muted-foreground">
            {notifications.length > 0 
              ? `${notifications.length} งานที่ต้องติดตาม`
              : 'ไม่มีงานที่ต้องติดตาม'}
          </p>
        </div>
        <ScrollArea className="h-[300px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle className="h-10 w-10 text-green-500 mb-2" />
              <p className="text-sm text-muted-foreground">ไม่มีงานใกล้ครบกำหนด</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => filmNavigate('queue', { autoFocus: true })}
                  className={`block w-full p-3 text-left hover:bg-muted/50 transition-colors ${
                    notification.urgency === 'overdue' ? 'bg-red-500/5' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-full ${getUrgencyColor(notification.urgency)}`}>
                      {getUrgencyIcon(notification.urgency)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {notification.orderNumber}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {notification.type === 'vinyl' ? 'ไวนิล' : 'ตรายาง'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {notification.customerName}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs font-medium ${
                          notification.urgency === 'overdue' ? 'text-red-500' : 
                          notification.urgency === 'urgent' ? 'text-orange-500' : 
                          'text-yellow-500'
                        }`}>
                          {getUrgencyLabel(notification.urgency)} - {formatDueMessage(notification.dueDate, notification.urgency)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        กำหนดส่ง: {format(notification.dueDate, 'd MMM yyyy', { locale: th })}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="border-t p-2">
          <Button variant="secondary" size="sm" className="w-full text-xs" onClick={() => filmNavigate('queue')}>
            เปิดคิวงาน
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
