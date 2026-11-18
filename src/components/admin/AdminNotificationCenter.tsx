import { useCallback, useEffect, useMemo, useState } from "react";
import { liveChannel } from "@/lib/realtimeChannel";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  dedupeNotifications, safeLink, typeLabel, unreadCount,
  type AdminNotification,
} from "@/lib/adminNotifications";

/**
 * The single admin notification bell. Reads the existing `notifications`
 * table (internal alerts only: `for_staff = true`) and subscribes to
 * Supabase Realtime. Rows are created server-side (RPC / trigger / edge
 * function) — this component never inserts.
 */
export default function AdminNotificationCenter() {
  const { isStaff } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("id,type,title,body,ref_id,read,for_staff,link,created_at")
      .eq("for_staff", true)
      .order("created_at", { ascending: false })
      .limit(100);
    setRows((data ?? []) as AdminNotification[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isStaff) { setLoading(false); return; }
    load();
    const channel = liveChannel("admin-notification-center")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => { load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isStaff, load]);

  const items = useMemo(() => dedupeNotifications(rows), [rows]);
  const unread = unreadCount(items);

  async function markRead(id: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, read: true } : r)));
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  }

  async function markAllRead() {
    const ids = rows.filter((r) => !r.read).map((r) => r.id);
    if (!ids.length) return;
    setRows((prev) => prev.map((r) => ({ ...r, read: true })));
    await supabase.from("notifications").update({ read: true }).in("id", ids);
  }

  async function openItem(n: AdminNotification) {
    await markRead(n.id);
    setOpen(false);
    nav(safeLink(n.link));
  }

  if (!isStaff) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="การแจ้งเตือน" data-testid="admin-bell">
          <Bell className="w-5 h-5" />
          {unread > 0 && (
            <span
              data-testid="admin-bell-badge"
              className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold grid place-items-center"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="font-semibold text-sm">การแจ้งเตือน</span>
          <Button variant="ghost" size="sm" className="text-xs" onClick={markAllRead} disabled={!unread}>
            <CheckCheck className="w-3.5 h-3.5 mr-1" /> อ่านทั้งหมด
          </Button>
        </div>
        <ScrollArea className="max-h-80">
          {loading ? (
            <div className="p-6 grid place-items-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center space-y-3">
              <p className="text-sm text-muted-foreground">ยังไม่มีการแจ้งเตือน</p>
              <Button size="sm" variant="outline" onClick={() => { setOpen(false); nav("/admin/work-docs?filter=order"); }}>
                ดูคำสั่งซื้อทั้งหมด
              </Button>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    data-testid="admin-notification-item"
                    className={`w-full text-left px-3 py-2.5 hover:bg-accent transition-colors ${n.read ? "" : "bg-primary/5"}`}
                  >
                    <div className="flex items-center gap-2">
                      {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {typeLabel(n.type)}
                      </span>
                      {n.repeated > 1 && (
                        <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5">x{n.repeated}</span>
                      )}
                    </div>
                    <div className="text-sm font-medium truncate">{n.title || typeLabel(n.type)}</div>
                    {n.body && <div className="text-xs text-muted-foreground line-clamp-2">{n.body}</div>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}