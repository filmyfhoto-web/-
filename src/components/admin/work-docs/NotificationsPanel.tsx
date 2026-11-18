import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, Bell, MailOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { fmtDateTime } from "@/lib/format";
import { useRealtimeRefresh } from "@/hooks/useRealtimeTable";
import {
  dedupeNotifications, safeLink, typeLabel, unreadCount, type AdminNotification,
} from "@/lib/adminNotifications";

/**
 * กระดิ่งแจ้งเตือนของแอดมิน — ย้ายเนื้อหาจากหน้า /admin/notifications เดิม
 * มาไว้บนหน้า “งานและเอกสาร” (หน้าออเดอร์) ใช้ตาราง `notifications` เดิมทั้งหมด
 */
export default function NotificationsPanel() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const open = params.get("notif") === "1";
  const [rows, setRows] = useState<AdminNotification[]>([]);
  const [onlyUnread, setOnlyUnread] = useState(false);

  const setOpen = useCallback((v: boolean) => {
    const next = new URLSearchParams(params);
    if (v) next.set("notif", "1"); else next.delete("notif");
    setParams(next, { replace: true });
  }, [params, setParams]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("id,type,title,body,ref_id,read,for_staff,link,created_at")
      .eq("for_staff", true)
      .order("created_at", { ascending: false })
      .limit(100);
    setRows((data ?? []) as AdminNotification[]);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useRealtimeRefresh(["notifications"], () => { void load(); });

  /** เด้งข้อความสั้นเมื่อมีแจ้งเตือนใหม่เข้ามาระหว่างเปิดหน้านี้อยู่ */
  useEffect(() => {
    const channel = supabase
      .channel(`work-docs-notif-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload: any) => {
          const n = payload?.new ?? {};
          if (!n.for_staff) return;
          toast(String(n.title || typeLabel(n.type)), {
            description: n.body ? String(n.body) : undefined,
            action: { label: "เปิดดู", onClick: () => navigate(safeLink(n.link, "/admin/work-docs")) },
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [navigate]);

  const list = useMemo(() => {
    const deduped = dedupeNotifications(rows);
    return onlyUnread ? deduped.filter((n) => !n.read) : deduped;
  }, [rows, onlyUnread]);
  const unread = unreadCount(rows);

  async function markOne(id: string, value: boolean) {
    setRows((prev) => prev.map((n) => (n.id === id ? { ...n, read: value } : n)));
    await supabase.from("notifications").update({ read: value }).eq("id", id);
  }

  async function markAll() {
    setRows((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase.from("notifications").update({ read: true }).eq("for_staff", true).eq("read", false);
  }

  return (
    <>
      <Button
        variant="outline"
        className="relative h-10 w-10 shrink-0 p-0 sm:w-auto sm:px-3"
        aria-label={unread > 0 ? `แจ้งเตือน ${unread} รายการใหม่` : "แจ้งเตือน"}
        data-testid="work-open-notifications"
        onClick={() => setOpen(true)}
      >
        <Bell className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">แจ้งเตือน</span>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-primary px-1 text-[11px] font-bold leading-5 text-primary-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
          <SheetHeader className="pb-3">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" /> แจ้งเตือน
              {unread > 0 && <Badge className="bg-primary text-primary-foreground">{unread} ใหม่</Badge>}
            </SheetTitle>
          </SheetHeader>

          <div className="mb-3 flex items-center gap-2">
            <button
              className={`min-h-9 rounded-xl px-3 text-sm font-bold ${!onlyUnread ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
              onClick={() => setOnlyUnread(false)}
            >
              ทั้งหมด
            </button>
            <button
              className={`min-h-9 rounded-xl px-3 text-sm font-bold ${onlyUnread ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
              onClick={() => setOnlyUnread(true)}
            >
              ยังไม่อ่าน ({unread})
            </button>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void markAll()} disabled={unread === 0}>
              <MailOpen className="mr-1 h-4 w-4" /> อ่านทั้งหมด
            </Button>
          </div>

          <div className="-mx-1 flex-1 space-y-2 overflow-y-auto px-1 pb-4">
            {list.map((n) => (
              <div
                key={n.id}
                className={`rounded-2xl border border-border bg-card p-3 ${!n.read ? "border-l-4 border-l-primary" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">{typeLabel(n.type)}</div>
                    <div className="font-semibold">{n.title}</div>
                    {n.body && <div className="text-sm text-muted-foreground">{n.body}</div>}
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">{fmtDateTime(n.created_at)}</div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => {
                      if (!n.read) void markOne(n.id, true);
                      setOpen(false);
                      navigate(safeLink(n.link, "/admin/work-docs"));
                    }}
                  >
                    เปิดดู <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" className="rounded-xl text-muted-foreground" onClick={() => void markOne(n.id, !n.read)}>
                    {n.read ? "ทำเป็นยังไม่อ่าน" : "ทำเป็นอ่านแล้ว"}
                  </Button>
                </div>
              </div>
            ))}
            {list.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">ยังไม่มีแจ้งเตือน</div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
