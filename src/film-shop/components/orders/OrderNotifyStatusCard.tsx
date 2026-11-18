import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Bell, CheckCircle2, Loader2, RefreshCw, RotateCw, XCircle } from 'lucide-react';
import { botLabel, deliveryReason, isNattaqBot, retryLineDelivery } from '@/lib/lineDeliveryStatus';
import { useLineStores, storeLabel } from '@/hooks/useLineStores';

interface Row {
  id: string;
  created_at: string;
  channel_id: string | null;
  channel_type: string;
  store_id: string;
  room_name: string;
  kind: string;
  status: string;
  error_code: string | null;
  attempts: number;
  notification_id: string | null;
  notification_title: string | null;
  notification_kind: string | null;
  sender_store_id: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  admin_group: 'กลุ่มออเดอร์',
  queue_group: 'กลุ่มรันคิว',
  doc_group: 'กลุ่มเอกสาร',
};

/** สถานะ+เหตุผลการส่งแจ้งเตือน LINE ของออเดอร์นี้ พร้อมปุ่มลองส่งใหม่ */
export function OrderNotifyStatusCard({ orderId }: { orderId: string }) {
  const { stores } = useLineStores();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc('admin_line_order_delivery_log', { p_order_id: orderId });
    if (error) setRows([]);
    else setRows((data ?? []) as Row[]);
    setLoading(false);
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  const retry = async (r: Row) => {
    setRetrying(r.id);
    const res = await retryLineDelivery({
      notificationId: r.notification_id,
      channelId: r.channel_id,
      channelType: r.channel_type,
      storeId: r.store_id,
    });
    setRetrying(null);
    if (res.ok) toast.success(`ส่งซ้ำเข้ากลุ่ม “${r.room_name}” สำเร็จ`);
    else toast.error('ส่งซ้ำไม่สำเร็จ', { description: res.error || deliveryReason('failed', res.errorCode) });
    void load();
  };

  return (
    <section className="rounded-xl border border-border bg-card p-3" data-testid="order-notify-status">
      <header className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">สถานะการแจ้งเตือน LINE</h3>
        <Button variant="ghost" size="sm" className="ml-auto h-7 px-2" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </header>

      {!loading && rows.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">ยังไม่มีการส่งแจ้งเตือนของออเดอร์นี้</p>
      )}

      <div className="mt-2 space-y-2">
        {rows.map((r) => {
          const sent = r.status === 'sent';
          return (
            <div key={r.id} className="rounded-lg border border-border/70 p-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                {sent
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  : <XCircle className="h-3.5 w-3.5 text-destructive" />}
                <span className="font-semibold">{TYPE_LABEL[r.channel_type] ?? r.channel_type}</span>
                <Badge
                  variant={isNattaqBot(r.sender_store_id) ? 'default' : 'secondary'}
                  className="text-[10px]"
                >
                  ส่งด้วย {botLabel(r.sender_store_id, isNattaqBot(r.sender_store_id) ? undefined : storeLabel(stores, r.sender_store_id))}
                </Badge>
                <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString('th-TH')}</span>
              </div>
              <div className="mt-1 text-muted-foreground">
                ห้อง: {r.room_name}{r.attempts > 1 ? ` · พยายาม ${r.attempts} ครั้ง` : ''}
              </div>
              {r.notification_title && <div className="mt-0.5 truncate">{r.notification_title}</div>}
              <div className={`mt-1 ${sent ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}`}>
                {deliveryReason(r.status, r.error_code)}
              </div>
              <Button
                variant="outline" size="sm"
                className="mt-2 h-8 rounded-lg"
                data-testid="order-notify-retry"
                disabled={retrying === r.id}
                onClick={() => void retry(r)}
              >
                {retrying === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                <span className="ml-1">ลองส่งใหม่</span>
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
