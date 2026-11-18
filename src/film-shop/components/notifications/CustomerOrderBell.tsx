import { ArrowUpRight, Bell, CheckCheck, FileText, MessageSquare, ShoppingCart, Store } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCustomerOrderFeed, type OrderFeedSource } from '@/film-shop/hooks/useCustomerOrderFeed';
import { filmNavigate } from '@/film-shop/lib/filmNav';

const feedTarget: Record<OrderFeedSource, string> = {
  document: 'invoices',
  shop: 'orders',
  line: 'inbox',
  order: 'orders',
  cart: 'orders',
};

const icons: Record<OrderFeedSource, typeof FileText> = {
  document: FileText,
  shop: ShoppingCart,
  line: MessageSquare,
  order: Store,
  cart: ShoppingCart,
};

const money = (n: number) => new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(n);

const fmt = (d: Date) =>
  `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** กระดิ่งแจ้งเตือนออเดอร์ลูกค้าใหม่จากทุกช่องทาง */
export function CustomerOrderBell() {
  const { items, unseenCount, statusChangedCount, lastSeen, markAllSeen, loading } = useCustomerOrderFeed(30);

  return (
    <Popover onOpenChange={(open) => { if (!open && unseenCount > 0) markAllSeen(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="ออเดอร์ลูกค้าใหม่">
          <Bell className="h-5 w-5" />
          {unseenCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-warning px-1 text-[10px] font-bold text-warning-foreground">
              {unseenCount > 9 ? '9+' : unseenCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[22rem] p-0" align="end">
        <div className="flex items-center justify-between border-b p-3">
          <div>
            <h4 className="font-semibold">ออเดอร์ลูกค้า</h4>
            <p className="text-xs text-muted-foreground">
              {unseenCount > 0 ? `${unseenCount} รายการใหม่` : 'ไม่มีรายการใหม่'}
              {statusChangedCount > 0 ? ` · ${statusChangedCount} สถานะเปลี่ยน` : ''}
            </p>
          </div>
          {unseenCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={markAllSeen}>
              <CheckCheck className="mr-1 h-3.5 w-3.5" /> อ่านทั้งหมด
            </Button>
          )}
        </div>
        <ScrollArea className="h-[360px]">
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">กำลังโหลด…</div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">ยังไม่มีออเดอร์ลูกค้า</div>
          ) : (
            <div className="divide-y">
              {items.map((it) => {
                const Icon = icons[it.source];
                const isNew = it.createdAt.getTime() > lastSeen;
                return (
                  <button
                    key={it.key}
                    type="button"
                    onClick={() => filmNavigate(feedTarget[it.source] ?? 'orders', { autoFocus: true })}
                    data-status-changed={it.statusChanged ? 'true' : 'false'}
                    className={`block w-full p-3 text-left transition hover:bg-muted/60 ${it.statusChanged ? 'bg-primary/10 border-l-2 border-primary' : isNew ? 'bg-warning/10' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-semibold">{it.customerName}</span>
                          {isNew && <Badge className="bg-warning px-1.5 text-[10px] text-warning-foreground">ใหม่</Badge>}
                          {it.statusChanged && (
                            <Badge className="px-1.5 text-[10px]" data-testid="feed-status-changed">สถานะเปลี่ยน</Badge>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {it.sourceLabel} · {it.refNo}{it.title ? ` · ${it.title}` : ''}
                        </p>
                        <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>{fmt(it.createdAt)}</span>
                          {it.total > 0 && <span className="font-semibold tabular-nums">{money(it.total)}฿</span>}
                        </div>
                      </div>
                      <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
        <div className="border-t p-2">
          <Button variant="secondary" size="sm" className="w-full text-xs" onClick={() => filmNavigate('orders')}>
            เปิดศูนย์ออเดอร์ทั้งหมด
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default CustomerOrderBell;
