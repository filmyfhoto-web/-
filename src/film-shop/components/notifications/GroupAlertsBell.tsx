import { Bot, CheckCheck, ShoppingCart, ArrowUpRight } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useGroupNotifications, type AlertGroup, type GroupAlert } from '@/film-shop/hooks/useGroupNotifications';
import { alertTarget, filmNavigate } from '@/film-shop/lib/filmNav';

const time = (iso: string) => new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

function Bell({
  group, icon: Icon, label, items, unread, onOpenChange, onMarkRead, loading,
}: {
  group: AlertGroup;
  icon: typeof ShoppingCart;
  label: string;
  items: GroupAlert[];
  unread: number;
  onOpenChange: (open: boolean) => void;
  onMarkRead: () => void;
  loading: boolean;
}) {
  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={label} data-testid={`group-${group}-bell`}>
          <Icon className="h-5 w-5" />
          {unread > 0 && (
            <span
              data-testid={`group-${group}-badge`}
              className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground"
            >
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[22rem] p-0" align="end">
        <div className="flex items-center justify-between border-b p-3">
          <div>
            <h4 className="font-semibold">{label}</h4>
            <p className="text-xs text-muted-foreground">
              {unread > 0 ? `${unread} รายการใหม่` : 'ไม่มีรายการใหม่'}
            </p>
          </div>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={onMarkRead}>
              <CheckCheck className="mr-1 h-3.5 w-3.5" /> อ่านทั้งหมด
            </Button>
          )}
        </div>
        <ScrollArea className="h-[320px]">
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">กำลังโหลด…</div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">ยังไม่มีการแจ้งเตือน</div>
          ) : (
            <div className="divide-y" data-testid={`group-${group}-list`}>
              {items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => { const t = alertTarget(n); filmNavigate(t.page, t.filter); }}
                  className={`block w-full cursor-pointer p-3 text-left transition hover:bg-muted/60 ${n.readAt ? '' : 'bg-primary/5'}`}
                  data-testid={`group-${group}-item`}
                >
                  <div className="flex items-start gap-2">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{n.title}</p>
                      {n.body && <p className="whitespace-pre-line text-xs text-muted-foreground">{n.body}</p>}
                      <p className="mt-1 text-[10px] text-muted-foreground">{time(n.createdAt)}</p>
                    </div>
                    <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="border-t p-2">
          <Button variant="secondary" size="sm" className="w-full text-xs" onClick={() => filmNavigate('alerts')}>
            เปิดศูนย์แจ้งเตือน 2 กลุ่ม
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** กระดิ่งแยก 2 กลุ่ม: เว็บแอปสั่งซื้อ (กลุ่ม 1) และ NATTA.Q อัตโนมัติ (กลุ่ม 2) */
export function GroupAlertsBell() {
  const { group1, group2, unread1, unread2, loading, markGroupRead } = useGroupNotifications();

  return (
    <>
      <Bell
        group={1}
        icon={ShoppingCart}
        label="ออเดอร์จากเว็บแอป"
        items={group1}
        unread={unread1}
        loading={loading}
        onOpenChange={(open) => { if (!open && unread1 > 0) void markGroupRead(1); }}
        onMarkRead={() => void markGroupRead(1)}
      />
      <Bell
        group={2}
        icon={Bot}
        label="NATTA.Q ออเดอร์อัตโนมัติ"
        items={group2}
        unread={unread2}
        loading={loading}
        onOpenChange={(open) => { if (!open && unread2 > 0) void markGroupRead(2); }}
        onMarkRead={() => void markGroupRead(2)}
      />
    </>
  );
}

export default GroupAlertsBell;
