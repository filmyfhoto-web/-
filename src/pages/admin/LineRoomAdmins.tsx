import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { RefreshCw, Link2, Unlink, History, Users, ExternalLink, Loader2 } from "lucide-react";

type Channel = {
  id: string;
  store_id: string;
  channel_type: string;
  line_destination_id: string;
  display_name: string | null;
  is_active: boolean;
  is_hub: boolean;
};

type Admin = { id: string; full_name: string | null; email: string | null; role: string };

type Binding = {
  id: string;
  channel_id: string;
  user_id: string;
  note: string | null;
  is_active: boolean;
  bound_at: string;
  unbound_at: string | null;
};

type EventRow = {
  id: string;
  channel_id: string | null;
  user_id: string | null;
  action: string;
  actor: string | null;
  note: string | null;
  created_at: string;
};

const STORE_LABEL: Record<string, string> = {
  default: "ร้านที่ 1 (หลัก)",
  shop2: "ร้านที่ 2",
  runqueue: "รันคิว (NATTA.Q AI)",
};

function fmt(ts: string) {
  return new Date(ts).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

export default function AdminLineRoomAdmins() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [channelId, setChannelId] = useState<string>("");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [chRes, roleRes, bindRes, evRes] = await Promise.all([
      supabase
        .from("line_notification_channels" as any)
        .select("id, store_id, channel_type, line_destination_id, display_name, is_active, is_hub")
        .order("store_id")
        .order("created_at"),
      supabase.from("user_roles" as any).select("user_id, role").in("role", ["owner", "admin"]),
      supabase
        .from("line_channel_admins" as any)
        .select("id, channel_id, user_id, note, is_active, bound_at, unbound_at")
        .order("bound_at", { ascending: false }),
      supabase
        .from("line_channel_admin_events" as any)
        .select("id, channel_id, user_id, action, actor, note, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const err = chRes.error || roleRes.error || bindRes.error || evRes.error;
    if (err) toast.error("โหลดข้อมูลไม่สำเร็จ", { description: err.message });

    const chs = ((chRes.data as any[]) ?? []) as Channel[];
    setChannels(chs);
    setBindings(((bindRes.data as any[]) ?? []) as Binding[]);
    setEvents(((evRes.data as any[]) ?? []) as EventRow[]);

    const roles = ((roleRes.data as any[]) ?? []) as { user_id: string; role: string }[];
    const ids = Array.from(new Set(roles.map((r) => r.user_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles" as any)
        .select("id, full_name, email")
        .in("id", ids);
      const byId = new Map((((profs as any[]) ?? []) as any[]).map((p) => [p.id, p]));
      setAdmins(
        ids.map((id) => ({
          id,
          full_name: byId.get(id)?.full_name ?? null,
          email: byId.get(id)?.email ?? null,
          role: roles.find((r) => r.user_id === id)?.role ?? "admin",
        })),
      );
    } else {
      setAdmins([]);
    }

    setChannelId((cur) => cur || chs[0]?.id || "");
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const adminName = useCallback(
    (uid: string | null) => {
      if (!uid) return "—";
      const a = admins.find((x) => x.id === uid);
      return a ? a.full_name || a.email || uid.slice(0, 8) : uid.slice(0, 8);
    },
    [admins],
  );

  const channelName = useCallback(
    (id: string | null) => {
      if (!id) return "—";
      const c = channels.find((x) => x.id === id);
      return c ? c.display_name || c.line_destination_id.slice(0, 10) : id.slice(0, 8);
    },
    [channels],
  );

  const current = channels.find((c) => c.id === channelId) || null;
  const activeBindings = useMemo(
    () => bindings.filter((b) => b.channel_id === channelId && b.is_active),
    [bindings, channelId],
  );
  const channelEvents = useMemo(
    () => events.filter((e) => e.channel_id === channelId),
    [events, channelId],
  );
  const available = admins.filter((a) => !activeBindings.some((b) => b.user_id === a.id));

  async function bindSelected() {
    const ids = Object.keys(picked).filter((k) => picked[k]);
    if (!channelId || !ids.length) { toast.error("เลือกห้องและบัญชีแอดมินก่อน"); return; }
    setBusy(true);
    const { data: me } = await supabase.auth.getUser();
    const actor = me?.user?.id ?? null;
    const trimmed = note.trim() || null;
    const { error } = await supabase.from("line_channel_admins" as any).insert(
      ids.map((uid) => ({ channel_id: channelId, user_id: uid, note: trimmed, bound_by: actor })),
    );
    if (error) {
      setBusy(false);
      toast.error("ผูกไม่สำเร็จ", { description: error.message });
      return;
    }
    await supabase.from("line_channel_admin_events" as any).insert(
      ids.map((uid) => ({ channel_id: channelId, user_id: uid, action: "bind", actor, note: trimmed })),
    );
    setBusy(false);
    setPicked({});
    setNote("");
    toast.success(`ผูกแอดมิน ${ids.length} บัญชีกับห้องนี้แล้ว`);
    load();
  }

  async function unbind(b: Binding) {
    setBusy(true);
    const { data: me } = await supabase.auth.getUser();
    const actor = me?.user?.id ?? null;
    const { error } = await supabase
      .from("line_channel_admins" as any)
      .update({ is_active: false, unbound_at: new Date().toISOString(), unbound_by: actor })
      .eq("id", b.id);
    if (error) {
      setBusy(false);
      toast.error("ยกเลิกการผูกไม่สำเร็จ", { description: error.message });
      return;
    }
    await supabase.from("line_channel_admin_events" as any).insert({
      channel_id: b.channel_id, user_id: b.user_id, action: "unbind", actor, note: b.note,
    });
    setBusy(false);
    toast.success("ยกเลิกการผูกแล้ว");
    load();
  }

  return (
    <AdminLayout>
      <SeoHead
        title="ผูกห้อง LINE กับแอดมิน | จัดการการแจ้งเตือน"
        description="จัดการการผูกห้อง/กลุ่ม LINE กับบัญชีแอดมินหลายบัญชี ดูประวัติการผูกและยกเลิกการผูกได้"
        path="/admin/line-room-admins"
      />
      <div className="space-y-4">
        <header className="flex flex-wrap items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">ผูกห้อง/กลุ่ม LINE กับแอดมิน</h1>
          <div className="ml-auto flex gap-2">
            <Button asChild variant="outline" size="sm" className="rounded-lg">
              <Link to="/admin/line-groups"><ExternalLink className="w-3.5 h-3.5 mr-1" />กลุ่ม LINE</Link>
            </Button>
            <Button variant="outline" size="sm" className="rounded-lg" onClick={load} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />รีเฟรช
            </Button>
          </div>
        </header>

        <section className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <Label className="text-xs">เลือกห้อง/กลุ่ม LINE</Label>
          <Select value={channelId} onValueChange={(v) => { setChannelId(v); setPicked({}); }}>
            <SelectTrigger className="rounded-lg"><SelectValue placeholder="เลือกห้อง" /></SelectTrigger>
            <SelectContent>
              {channels.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {(STORE_LABEL[c.store_id] ?? c.store_id)} · {c.display_name || c.line_destination_id.slice(0, 12)}
                  {c.is_active ? "" : " (ปิดใช้งาน)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {current && (
            <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <Badge variant="outline">{current.channel_type}</Badge>
              {current.is_hub && <Badge variant="secondary">ห้องหลัก (hub)</Badge>}
              <Badge variant={current.is_active ? "default" : "outline"}>{current.is_active ? "ใช้งานอยู่" : "ปิดใช้งาน"}</Badge>
              <span className="font-mono self-center">{current.line_destination_id}</span>
            </div>
          )}
        </section>

        <section className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <h2 className="font-semibold text-sm">แอดมินที่ผูกกับห้องนี้ ({activeBindings.length})</h2>
          {activeBindings.length === 0 ? (
            <p className="text-xs text-muted-foreground">ยังไม่มีแอดมินผูกกับห้องนี้</p>
          ) : (
            <ul className="divide-y">
              {activeBindings.map((b) => (
                <li key={b.id} className="py-2 flex flex-wrap items-center gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{adminName(b.user_id)}</p>
                    <p className="text-[11px] text-muted-foreground">ผูกเมื่อ {fmt(b.bound_at)}{b.note ? ` · ${b.note}` : ""}</p>
                  </div>
                  <Button
                    variant="outline" size="sm" disabled={busy}
                    className="ml-auto rounded-lg text-destructive"
                    onClick={() => unbind(b)}
                  >
                    <Unlink className="w-3.5 h-3.5 mr-1" />ยกเลิกการผูก
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <h2 className="font-semibold text-sm">เพิ่มแอดมินเข้าห้องนี้ (เลือกได้หลายบัญชี)</h2>
          {available.length === 0 ? (
            <p className="text-xs text-muted-foreground">ไม่มีบัญชีแอดมินที่ยังไม่ได้ผูก</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {available.map((a) => (
                <label key={a.id} className="flex items-center gap-2 rounded-xl border p-2 cursor-pointer">
                  <Checkbox
                    checked={!!picked[a.id]}
                    onCheckedChange={(v) => setPicked((s) => ({ ...s, [a.id]: !!v }))}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm truncate">{a.full_name || a.email || a.id.slice(0, 8)}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">{a.email} · {a.role}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="หมายเหตุ (ไม่บังคับ)"
              className="rounded-lg max-w-xs"
            />
            <Button onClick={bindSelected} disabled={busy || !channelId} className="rounded-lg">
              {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Link2 className="w-3.5 h-3.5 mr-1" />}
              ผูกกับห้องนี้
            </Button>
          </div>
        </section>

        <section className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <History className="w-4 h-4" />ประวัติการผูก/ยกเลิก ({channelEvents.length})
          </h2>
          {channelEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground">ยังไม่มีประวัติของห้องนี้</p>
          ) : (
            <ul className="divide-y text-xs">
              {channelEvents.map((e) => (
                <li key={e.id} className="py-2 flex flex-wrap items-center gap-2">
                  <Badge variant={e.action === "bind" ? "default" : "outline"}>
                    {e.action === "bind" ? "ผูก" : "ยกเลิกการผูก"}
                  </Badge>
                  <span className="font-medium">{adminName(e.user_id)}</span>
                  <span className="text-muted-foreground">ห้อง {channelName(e.channel_id)}</span>
                  <span className="text-muted-foreground">โดย {adminName(e.actor)}</span>
                  <span className="ml-auto text-muted-foreground">{fmt(e.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
