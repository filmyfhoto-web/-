import { Link, useNavigate } from "react-router-dom";
import CustomerLayout from "@/components/layout/CustomerLayout";
import SeoHead from "@/components/SeoHead";
import { Button } from "@/components/ui/button";
import { DataEmptyState, DataListSkeleton } from "@/components/common/DataStates";
import { Bell, BellOff, RefreshCw, AlertCircle, CheckCheck } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { useCustomerNotifications } from "@/hooks/useCustomerNotifications";

/**
 * Customer notification feed — real rows from `public.notifications`,
 * RLS-scoped to the signed-in user and produced by server-side triggers on
 * order creation and status changes. Realtime, with unread state and
 * mark-as-read.
 */
export default function CustomerNotifications() {
  const { items, unread, error, reload, markRead, markAllRead } = useCustomerNotifications();
  const nav = useNavigate();

  const open = async (id: string, link: string | null, refId: string | null) => {
    await markRead(id);
    nav(link || (refId ? `/my-orders/${refId}` : "/my-orders"));
  };

  return (
    <CustomerLayout>
      <SeoHead
        title="แจ้งเตือน — ร้านนัฐภรณ์ เชียงกลาง"
        description="ติดตามความเคลื่อนไหวและสถานะคำสั่งซื้อของคุณกับร้านนัฐภรณ์ เชียงกลาง"
        path="/notifications"
      />
      <div className="flex items-center justify-between gap-2 mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bell className="w-6 h-6 text-primary" /> แจ้งเตือน
          {unread > 0 && (
            <span data-testid="notif-unread-badge" className="ml-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
              {unread}
            </span>
          )}
        </h1>
        <div className="flex gap-2">
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="rounded-xl min-h-11" onClick={() => void markAllRead()} data-testid="notif-mark-all">
              <CheckCheck className="w-4 h-4 mr-1" /> อ่านทั้งหมด
            </Button>
          )}
          <Button variant="outline" size="sm" className="rounded-xl min-h-11" onClick={() => void reload()}>
            <RefreshCw className="w-4 h-4 mr-1" /> รีเฟรช
          </Button>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error} · กรุณาลองรีเฟรชอีกครั้ง</span>
        </div>
      )}

      {items === null && <DataListSkeleton rows={4} testId="notifications-skeleton" />}

      {items !== null && items.length === 0 && !error && (
        <DataEmptyState
          icon={BellOff}
          title="ยังไม่มีการแจ้งเตือน"
          desc="เมื่อมีความเคลื่อนไหวของคำสั่งซื้อ ระบบจะแจ้งให้ทราบที่นี่"
          action={<Button asChild className="rounded-xl min-h-11"><Link to="/shop">ไปหน้าแรก</Link></Button>}
          testId="notifications-empty"
        />
      )}

      {items !== null && items.length > 0 && (
        <ul className="space-y-3" data-testid="notifications-list">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                data-testid="notification-item"
                data-read={n.read ? "true" : "false"}
                onClick={() => void open(n.id, n.link, n.ref_id)}
                className={`w-full text-left bg-card rounded-2xl border p-4 shadow-card hover:border-primary/50 transition ${
                  n.read ? "border-border" : "border-primary/60 bg-primary/5"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-primary break-words">{n.title}</span>
                  {!n.read && <span className="h-2 w-2 rounded-full bg-primary shrink-0" aria-label="ยังไม่อ่าน" />}
                </div>
                {n.body && <p className="text-sm text-foreground mt-1 break-words">{n.body}</p>}
                <p className="text-xs text-muted-foreground mt-0.5">{fmtDateTime(n.created_at)}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </CustomerLayout>
  );
}
