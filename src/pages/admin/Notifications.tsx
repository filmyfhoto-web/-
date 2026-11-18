import AdminLayout from "@/components/layout/AdminLayout";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, ExternalLink, ListChecks, ArrowRight, Settings as SettingsIcon, Check, X, Send, MailOpen, Mail } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { useRealtimeRefresh } from "@/hooks/useRealtimeTable";
import { Checkbox } from "@/components/ui/checkbox";
import { useBulkSelect } from "@/hooks/useBulkSelect";
import BulkActionBar from "@/components/BulkActionBar";
import { toast } from "sonner";
import { Link as RouterLink } from "react-router-dom";

export default function AdminNotifications() {
  const [list, setList] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [tab, setTab] = useState<"all" | "unread" | "signup" | "doc" | "other">("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const bulk = useBulkSelect(list);

  async function load() {
    const [{ data: n }, { data: s }] = await Promise.all([
      supabase.from("notifications").select("*").eq("for_staff", true).order("created_at", { ascending: false }).limit(100),
      supabase.rpc("get_public_settings").maybeSingle(),
    ]);
    setList(n ?? []); setSettings(s);
  }
  useEffect(() => { load(); }, []);
  useRealtimeRefresh(["notifications"], () => load());

  // Auto-retry failed LINE notifications for signup events when the page opens
  useEffect(() => {
    let cancelled = false;
    async function retrySignupLine() {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data } = await supabase
        .from("line_notifications")
        .select("id")
        .eq("kind", "new_signup")
        .eq("sent_status", "failed")
        .gte("created_at", since)
        .limit(20);
      const ids = (data ?? []).map((r: any) => r.id);
      if (!cancelled && ids.length) {
        await supabase.functions.invoke("line-notify-retry", { body: { ids } }).catch(() => {});
      }
    }
    retrySignupLine();
    const t = window.setInterval(retrySignupLine, 60_000);
    return () => { cancelled = true; window.clearInterval(t); };
  }, []);

  async function markAll() {
    await supabase.from("notifications").update({ read: true }).eq("for_staff", true).eq("read", false);
    load();
  }
  async function markOne(id: string, value: boolean) {
    await supabase.from("notifications").update({ read: value }).eq("id", id);
    setList(prev => prev.map(n => n.id === id ? { ...n, read: value } : n));
  }

  async function bulkDelete() {
    const ids = bulk.selectedArray; if (!ids.length) return;
    const { error } = await supabase.from("notifications").delete().in("id", ids).eq("for_staff", true);
    if (error) return toast.error(error.message);
    toast.success(`ลบ ${ids.length} รายการ`); bulk.exit(); load();
  }

  async function decide(n: any, approve: boolean) {
    const reason = approve ? null : (window.prompt("เหตุผลที่ปฏิเสธ (ถ้ามี)") ?? "");
    if (!approve && reason === null) return;
    setBusyId(n.id);
    const { error } = await supabase.rpc("admin_decide_org_join" as any, {
      p_org_id: n.ref_id, p_approve: approve, p_reason: reason || null,
    });
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success(approve ? "อนุมัติแล้ว" : "ปฏิเสธแล้ว");
    load();
  }

  async function resendLine(n: any) {
    setBusyId(n.id);
    const { error } = await supabase.functions.invoke("notify-new-signup", {
      body: { org_id: n.ref_id, kind: "new_signup", force: true },
    });
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success("ส่ง LINE ซ้ำแล้ว");
  }

  const filtered = useMemo(() => {
    return list.filter(n => {
      if (tab === "unread") return !n.read;
      if (tab === "signup") return n.type === "new_signup";
      if (tab === "doc") return String(n.type || "").startsWith("doc_");
      if (tab === "other") return n.type !== "new_signup" && !String(n.type || "").startsWith("doc_");
      return true;
    });
  }, [list, tab]);
  const unreadCount = list.filter(n => !n.read).length;
  const signupCount = list.filter(n => n.type === "new_signup").length;

  return (
    <AdminLayout>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bell className="w-6 h-6 text-primary" /> ศูนย์แจ้งเตือน
          {unreadCount > 0 && <Badge className="bg-primary text-primary-foreground">{unreadCount} ใหม่</Badge>}
        </h1>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="rounded-xl">
            <RouterLink to="/admin/notification-settings"><SettingsIcon className="w-4 h-4 mr-1" /> ตั้งค่าแจ้งเตือน</RouterLink>
          </Button>
          <Button variant={bulk.selectMode ? "default" : "outline"} className="rounded-xl" onClick={() => bulk.selectMode ? bulk.exit() : bulk.setSelectMode(true)}>
            <ListChecks className="w-4 h-4 mr-1" /> {bulk.selectMode ? "ออกจากโหมดเลือก" : "เลือกหลายรายการ"}
          </Button>
          {settings?.line_url && (
            <Button asChild variant="outline" className="rounded-xl">
              <a href={settings.line_url} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4 mr-2" /> เปิด LINE Official</a>
            </Button>
          )}
          <Button variant="outline" className="rounded-xl" onClick={markAll}>ทำเครื่องหมายอ่านทั้งหมด</Button>
        </div>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mb-4">
        <TabsList className="rounded-xl">
          <TabsTrigger value="all" className="rounded-lg">ทั้งหมด ({list.length})</TabsTrigger>
          <TabsTrigger value="unread" className="rounded-lg">ยังไม่อ่าน ({unreadCount})</TabsTrigger>
          <TabsTrigger value="signup" className="rounded-lg">คำขอเข้าร่วม ({signupCount})</TabsTrigger>
          <TabsTrigger value="doc" className="rounded-lg">เอกสาร</TabsTrigger>
          <TabsTrigger value="other" className="rounded-lg">อื่นๆ</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="space-y-3">
        {filtered.map(n => (
          <div key={n.id} className={`bg-card rounded-2xl border border-border p-4 shadow-card ${!n.read ? "border-l-4 border-l-primary" : ""}`}>
            <div className="flex justify-between items-start gap-3">
              {bulk.selectMode && <div className="pt-1"><Checkbox checked={bulk.ids.has(n.id)} onCheckedChange={() => bulk.toggle(n.id)} /></div>}
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-semibold">{n.title}</div>
                  {!n.read && <Badge variant="outline" className="text-[10px] border-primary text-primary">ใหม่</Badge>}
                </div>
                <div className="text-sm text-muted-foreground">{n.body}</div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {n.type === "new_signup" && n.ref_id && (
                    <>
                      <Button size="sm" disabled={busyId === n.id}
                        className="rounded-xl bg-success text-white hover:bg-success/90"
                        onClick={() => decide(n, true)}>
                        <Check className="w-4 h-4 mr-1" /> อนุมัติ
                      </Button>
                      <Button size="sm" variant="outline" disabled={busyId === n.id}
                        className="rounded-xl text-destructive border-destructive/40"
                        onClick={() => decide(n, false)}>
                        <X className="w-4 h-4 mr-1" /> ปฏิเสธ
                      </Button>
                      <Button size="sm" variant="outline" disabled={busyId === n.id}
                        className="rounded-xl"
                        onClick={() => resendLine(n)}>
                        <Send className="w-4 h-4 mr-1" /> ส่ง LINE ซ้ำ
                      </Button>
                    </>
                  )}
                  {n.link && (
                    <Button asChild size="sm" variant="outline" className="rounded-xl">
                      <RouterLink to={n.link} onClick={() => { if (!n.read) markOne(n.id, true); }}>
                        {n.type === "new_signup" ? "เปิดหน้าจัดการ" : "เปิดดู"} <ArrowRight className="w-4 h-4 ml-1" />
                      </RouterLink>
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="rounded-xl text-muted-foreground"
                    onClick={() => markOne(n.id, !n.read)}>
                    {n.read ? <><Mail className="w-4 h-4 mr-1" /> ทำเป็นยังไม่อ่าน</> : <><MailOpen className="w-4 h-4 mr-1" /> ทำเป็นอ่านแล้ว</>}
                  </Button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground shrink-0">{fmtDateTime(n.created_at)}</div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="text-center text-muted-foreground py-12">ไม่มีรายการในตัวกรองนี้</div>}
      </div>
      {bulk.selectMode && bulk.count > 0 && (
        <BulkActionBar count={bulk.count} onCancel={bulk.exit} onConfirm={() => { void bulkDelete(); }}
          itemLabel="แจ้งเตือน"
          previewNames={bulk.selectedArray.map(id => (list.find((x: any) => x.id === id) as any)?.title).filter(Boolean) as string[]}
          confirmDescription={`ลบแจ้งเตือน ${bulk.count} รายการ`} />
      )}
    </AdminLayout>
  );
}