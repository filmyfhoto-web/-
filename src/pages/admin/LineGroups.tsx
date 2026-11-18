import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useLineStores, storeLabel } from "@/hooks/useLineStores";
import { Link } from "react-router-dom";
import QrLinkDialog from "@/components/QrLinkDialog";
import {
  Users, Send, RefreshCw, Loader2, Target, Copy, AlertTriangle, Unlink, CheckCircle2, Route, History,
  UserPlus, QrCode, ExternalLink, MessageSquare,
} from "lucide-react";

type ChannelType = "admin_group" | "queue_group" | "doc_group" | "order_group";

type ChannelRow = {
  id: string;
  store_id: string;
  channel_type: string;
  display_name: string | null;
  line_destination_id: string | null;
  is_active: boolean;
  is_hub: boolean | null;
  queue_commands_enabled?: boolean | null;
  queue_require_admin?: boolean | null;
  linked_at: string | null;
  last_test_status: string | null;
  last_test_at: string | null;
};

type RoutingRow = {
  store_id: string;
  channel_type: string;
  source: "direct" | "hub" | "admin_fallback" | "none";
  channel_ids: string[] | null;
  room_names: string[] | null;
  destinations: string[] | null;
};

const SOURCE_META: Record<RoutingRow["source"], { label: string; cls: string }> = {
  direct: { label: "ใช้ห้องของประเภทนี้โดยตรง", cls: "bg-emerald-600" },
  hub: { label: "ยังไม่มีห้องของตัวเอง → ใช้ห้องสำรอง", cls: "bg-amber-600" },
  admin_fallback: { label: "ยังไม่มีห้อง → ตกไปห้องออเดอร์", cls: "bg-amber-600" },
  none: { label: "ยังไม่มีปลายทาง — จะไม่ส่งแจ้งเตือน", cls: "bg-destructive" },
};

const TYPE_META: Record<ChannelType, { title: string; hint: string; command: string }> = {
  admin_group: {
    title: "ห้องแอดมิน (แจ้งเตือนออเดอร์)",
    hint: "รับแจ้งเตือนออเดอร์ใหม่/ข้อความลูกค้า",
    command: "เชื่อมห้องแอดมิน",
  },
  queue_group: {
    title: "กลุ่มรันคิวงาน NATTA.Q",
    hint: "รับใบงาน/คิวงานที่ระบบสร้างจากแชท",
    command: "เชื่อมกลุ่มรันคิว",
  },
  doc_group: {
    title: "ห้องเอกสาร (ออกเลขเอกสาร)",
    hint: "รับแจ้งเตือนเมื่อออกเลขใบสั่งจ้าง/ใบเสร็จสำเร็จ",
    command: "เชื่อมห้องเอกสาร",
  },
  order_group: {
    title: "กลุ่มแจ้งเตือนคำสั่งซื้อ",
    hint: "รับแจ้งเตือน “คำสั่งซื้อใหม่” จากเว็บแอปลูกค้า — ห้องนี้แจ้งเตือนอย่างเดียว ไม่รับคำสั่งคิวและไม่อ่านไฟล์ด้วย AI",
    command: "เชื่อมกลุ่มออเดอร์",
  },
};

const isGroup = (dest?: string | null) => !!dest && /^[CR]/.test(dest);

/** เปิดแอป LINE ไปที่รายการแชท/กลุ่ม (LINE ไม่มีลิงก์เปิดกลุ่มเจาะจง) */
function openLineChats() {
  const web = "https://line.me/R/nv/chat";
  if (typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    window.location.href = "line://nv/chats";
    window.setTimeout(() => { window.location.href = web; }, 800);
    return;
  }
  window.open(web, "_blank", "noopener,noreferrer");
}

export default function AdminLineGroups() {
  const { stores } = useLineStores();
  const [rows, setRows] = useState<ChannelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [qr, setQr] = useState<{ url: string; label: string } | null>(null);
  /** คำแนะนำอัตโนมัติเมื่อ LINE ตอบ 404 / บอทไม่อยู่ในห้อง */
  const [helpFor, setHelpFor] = useState<{ channelId: string; code: string } | null>(null);
  /** ผลการทดสอบส่งการ์ด “คำสั่งซื้อใหม่” แบบ dry-run */
  const [dryRun, setDryRun] = useState<{ ok: boolean; room: string; at: string; error?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("line_notification_channels" as any)
      .select("id, store_id, channel_type, display_name, line_destination_id, is_active, is_hub, queue_commands_enabled, queue_require_admin, linked_at, last_test_status, last_test_at")
      .order("linked_at", { ascending: false });
    if (error) toast.error("โหลดรายการห้องไม่สำเร็จ", { description: error.message });
    setRows(((data as any[]) ?? []) as ChannelRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel("admin-line-groups")
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "line_notification_channels" }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load]);

  const [routing, setRouting] = useState<RoutingRow[]>([]);

  const loadRouting = useCallback(async () => {
    const { data, error } = await (supabase as any).rpc("admin_line_routing_status");
    if (!error) setRouting(((data as RoutingRow[]) ?? []));
  }, []);
  useEffect(() => { void loadRouting(); }, [loadRouting, rows]);

  async function callRpc(row: ChannelRow, fn: string, args: Record<string, unknown>, okMsg: string) {
    setBusyId(row.id);
    const { error } = await (supabase as any).rpc(fn, args);
    setBusyId(null);
    if (error) {
      const map: Record<string, string> = {
        destination_not_group: "ปลายทางนี้เป็นแชทส่วนตัว เปิดใช้งานไม่ได้ — ต้องเป็นกลุ่ม LINE เท่านั้น",
        forbidden: "ต้องเป็นเจ้าของร้าน/ผู้ดูแลเท่านั้น",
        channel_not_found: "ไม่พบห้องนี้แล้ว",
      };
      const key = Object.keys(map).find((k) => error.message?.includes(k));
      toast.error("ทำรายการไม่สำเร็จ", { description: key ? map[key] : error.message });
    } else {
      toast.success(okMsg);
    }
    await load();
  }

  const setActive = (row: ChannelRow, active: boolean) =>
    callRpc(row, "admin_line_channel_toggle", { p_channel_id: row.id, p_active: active },
      active ? "เปิดรับแจ้งเตือนแล้ว" : "ปิดรับแจ้งเตือนแล้ว");

  const makeHub = (row: ChannelRow) =>
    callRpc(row, "admin_line_channel_set_hub", { p_channel_id: row.id, p_hub: true },
      "ตั้งเป็นห้องสำรองของประเภทนี้แล้ว (ห้องสำรองมีได้ประเภทละห้องเดียว)");

  const clearHub = (row: ChannelRow) =>
    callRpc(row, "admin_line_channel_set_hub", { p_channel_id: row.id, p_hub: false }, "ยกเลิกห้องสำรองแล้ว");

  const useOnly = (row: ChannelRow) =>
    callRpc(row, "admin_line_route_exclusive", { p_channel_id: row.id },
      "เปลี่ยนปลายทางแล้ว — ประเภทนี้ของร้านนี้ส่งเข้าห้องนี้ห้องเดียว");

  const setQueueFlags = (row: ChannelRow, enabled: boolean, requireAdmin: boolean | null) =>
    callRpc(row, "admin_line_channel_queue_flags",
      { p_channel_id: row.id, p_enabled: enabled, p_require_admin: requireAdmin },
      "บันทึกสิทธิ์คำสั่งคิวของห้องนี้แล้ว");

  async function sendTest(row: ChannelRow) {
    setBusyId(row.id);
    const { data, error } = await supabase.functions.invoke("send-line-notification", {
      body: { store_id: row.store_id, channel_type: row.channel_type, channel_id: row.id },
    });
    setBusyId(null);
    if (error || !(data as any)?.ok) {
      const code = String((data as any)?.error_code || "");
      if (["bot_not_in_group", "http_400", "http_404", "no_active_admin_group"].includes(code)) {
        setHelpFor({ channelId: row.id, code });
      } else {
        setHelpFor(null);
      }
      toast.error("ส่งข้อความทดสอบไม่สำเร็จ", {
        description: (data as any)?.error || (data as any)?.error_code || error?.message,
      });
    } else {
      setHelpFor(null);
      toast.success("ส่งข้อความทดสอบเข้าห้องนี้แล้ว");
    }
    load();
  }

  const groupsOf = (t: ChannelType) => rows.filter((r) => r.channel_type === t);

  /** ส่งการ์ด “คำสั่งซื้อใหม่” ของจริงเข้ากลุ่มที่ตั้งค่าไว้ (ข้อมูลตัวอย่าง ไม่สร้างออเดอร์) */
  async function sendOrderDryRun(row: ChannelRow) {
    setBusyId(row.id);
    const { data, error } = await supabase.functions.invoke("send-line-notification", {
      body: {
        store_id: row.store_id,
        channel_type: "order_group",
        channel_id: row.id,
        dry_run_order: true,
      },
    });
    setBusyId(null);
    const ok = !error && !!(data as any)?.ok;
    setDryRun({
      ok,
      room: row.display_name || "กลุ่ม LINE",
      at: new Date().toLocaleString("th-TH"),
      error: ok ? undefined : String((data as any)?.error || (data as any)?.error_code || error?.message || "ไม่ทราบสาเหตุ"),
    });
    if (ok) toast.success("ส่งการ์ดคำสั่งซื้อ (ทดสอบ) เข้ากลุ่มแล้ว — เปิด LINE เพื่อยืนยันว่าข้อความขึ้นจริง");
    else toast.error("ส่ง dry-run ไม่สำเร็จ");
    load();
  }

  return (
    <AdminLayout>
      <SeoHead
        path="/admin/line-groups"
        title="จัดการห้องแอดมิน LINE | ผูกกลุ่มผู้รับแจ้งเตือน"
        description="เลือกและผูกห้องแอดมิน LINE กับกลุ่มผู้รับแจ้งเตือนของแต่ละร้าน พร้อมปุ่มทดสอบส่งข้อความ"
      />
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" /> จัดการห้องแอดมิน LINE
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              ผูกได้หลายห้องต่อหนึ่งประเภท (ออเดอร์ / คิวงาน / ออกเอกสาร) แจ้งเตือนจะเข้าทุกห้องที่เปิดรับของประเภทนั้น
            </p>
          </div>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="ml-1">รีเฟรช</span>
          </Button>
        </header>

        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5" data-testid="invite-bot-guide">
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 mb-3 text-sm" data-testid="admin-line-bind-hint">
            <b>ขั้นที่ 0 — ผูกบัญชี LINE ของคุณกับสิทธิ์แอดมินก่อน</b>
            <p className="text-xs mt-1 text-muted-foreground">
              ถ้าพิมพ์ “เชื่อมห้องแอดมิน” แล้วบอทตอบว่า “ยังไม่ได้ยืนยันสิทธิ์แอดมิน” แปลว่า LINE ที่คุณใช้พิมพ์ยังไม่ถูกผูก:
              เข้าหน้า <b>/staff</b> แล้วล็อกอินด้วย LINE บัญชีเดียวกับที่ใช้พิมพ์ในกลุ่ม จากนั้นเจ้าของร้านกดอนุมัติที่หน้า
              <b> อนุมัติ LINE พนักงาน</b> (เลือกบทบาท “admin”) แล้วค่อยกลับไปพิมพ์คำสั่งในกลุ่มอีกครั้ง
            </p>
            <div className="flex gap-2 mt-2 flex-wrap">
              <Button asChild size="sm" variant="outline" className="rounded-lg">
                <a href="/admin/staff-line">ไปหน้าอนุมัติ LINE พนักงาน</a>
              </Button>
              <Button asChild size="sm" variant="ghost" className="rounded-lg">
                <a href="/staff">ล็อกอิน LINE ที่หน้า /staff</a>
              </Button>
            </div>
          </div>
          <h2 className="font-bold flex items-center gap-2"><UserPlus className="w-4 h-4 text-primary" /> เชิญบอทเข้ากลุ่ม (ทำก่อนถึงจะเจอห้องให้กดเชื่อม)</h2>
          <ol className="text-sm mt-2 space-y-1 list-decimal ml-4">
            <li>สแกน QR / กดลิงก์ด้านล่างเพื่อ “เพิ่มเพื่อน” LINE OA ของร้านนั้นก่อน</li>
            <li>เปิดกลุ่ม LINE ที่ต้องการ → เมนู ☰ → “เชิญ” → เลือกบัญชี OA ของร้าน (ค้นหาด้วยชื่อหรือ ID ด้านล่าง)</li>
            <li>พิมพ์คำสั่ง เช่น “เชื่อมห้องแอดมิน” <b>ในกลุ่มนั้น</b> — ห้องจะโผล่ในหน้านี้ทันที แล้วค่อยเปิดสวิตช์รับแจ้งเตือน</li>
          </ol>
          <div className="grid gap-3 sm:grid-cols-2 mt-3">
            {stores.map((s) => {
              const basic = (s.line_basic_id || "").trim();
              const idForUrl = basic.replace(/^@/, "");
              const addUrl = idForUrl ? `https://line.me/R/ti/p/@${idForUrl}` : null;
              return (
                <div key={s.id} className="rounded-xl border border-border bg-card p-3">
                  <div className="font-semibold text-sm">{s.display_name || s.id}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    LINE OA ID: {basic ? (basic.startsWith("@") ? basic : `@${basic}`) : "ยังไม่ได้ตั้งค่า"}
                  </div>
                  {addUrl ? (
                    <div className="flex items-center gap-3 mt-2">
                      <img
                        src={`https://qr-official.line.me/gs/M_${idForUrl}_GW.png`}
                        alt={`QR เพิ่มเพื่อน LINE OA ${s.display_name || s.id}`}
                        loading="lazy"
                        className="w-20 h-20 rounded-lg border border-border bg-background object-contain"
                      />
                      <div className="flex flex-col gap-1.5">
                        <Button asChild size="sm" className="rounded-lg">
                          <a href={addUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-3.5 h-3.5 mr-1" /> เพิ่มเพื่อน / เปิดบัญชี OA
                          </a>
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="rounded-lg"
                          onClick={openLineChats}
                        >
                          <MessageSquare className="w-3.5 h-3.5 mr-1" /> เปิดกลุ่ม LINE ของร้านนี้
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg"
                          onClick={() => setQr({ url: addUrl, label: s.display_name || s.id })}
                        >
                          <QrCode className="w-3.5 h-3.5 mr-1" /> QR เต็มจอ / ดาวน์โหลด
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(`@${idForUrl}`);
                              toast.success("คัดลอก LINE OA ID แล้ว — ใช้ค้นหาตอนกด “เชิญ” ในกลุ่ม");
                            } catch { toast.error("คัดลอกไม่สำเร็จ"); }
                          }}
                        >
                          <QrCode className="w-3.5 h-3.5 mr-1" /> คัดลอก ID สำหรับค้นหา
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-2">
                      ยังไม่ได้ใส่ LINE OA ID ของร้านนี้ — ตั้งค่าได้ที่หน้าตั้งค่า LINE ก่อน
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5" data-testid="line-routing-summary">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <h2 className="font-bold flex items-center gap-2"><Route className="w-4 h-4 text-primary" /> สรุปปลายทางที่ใช้อยู่ตอนนี้</h2>
            <Button asChild size="sm" variant="outline" className="rounded-lg">
              <Link to="/admin/line-delivery-log"><History className="w-3.5 h-3.5 mr-1" /> ประวัติการส่ง/ผลทดสอบ</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="rounded-lg">
              <Link to="/admin/line-room-admins">ผูกห้องกับแอดมิน</Link>
            </Button>
          </div>
          {routing.length === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูลปลายทาง</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {routing.map((r) => (
                <div key={`${r.store_id}-${r.channel_type}`} className="rounded-xl border border-border p-3">
                  <div className="text-xs text-muted-foreground">{storeLabel(stores, r.store_id)}</div>
                  <div className="font-semibold text-sm mt-0.5">{TYPE_META[r.channel_type as ChannelType]?.title ?? r.channel_type}</div>
                  <Badge className={`${SOURCE_META[r.source].cls} text-[10px] mt-1.5`}>{SOURCE_META[r.source].label}</Badge>
                  <div className="text-xs text-muted-foreground mt-1.5">
                    {(r.room_names ?? []).length > 0
                      ? (r.room_names ?? []).map((n, i) => `${n} (${(r.destinations ?? [])[i] ?? ""})`).join(" · ")
                      : "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {(Object.keys(TYPE_META) as ChannelType[]).map((type) => {
          const list = groupsOf(type);
          return (
            <section key={type} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                <h2 className="font-bold">{TYPE_META[type].title}</h2>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(TYPE_META[type].command);
                      toast.success("คัดลอกคำสั่งแล้ว — ไปวางในกลุ่ม LINE");
                    } catch { toast.error("คัดลอกไม่สำเร็จ"); }
                  }}
                >
                  <Copy className="w-3.5 h-3.5 mr-1" /> คัดลอกคำสั่ง “{TYPE_META[type].command}”
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{TYPE_META[type].hint}</p>

              {type === "order_group" && (
                <div
                  className="mb-3 rounded-xl border border-border bg-muted/30 p-3 text-sm"
                  data-testid="order-group-status"
                >
                  {list.some((r) => r.is_active) ? (
                    <div className="space-y-1">
                      <div className="font-semibold flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" /> เชื่อมกลุ่มแล้ว
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ส่งเข้า: {list.filter((r) => r.is_active).map((r) => r.display_name || "กลุ่ม LINE").join(" · ")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ทดสอบได้จากปุ่ม “ทดสอบส่งแจ้งเตือน” ในการ์ดของกลุ่มด้านล่าง
                      </div>
                      {dryRun && (
                        <div
                          className={`mt-2 rounded-lg border p-2 text-xs ${dryRun.ok ? "border-emerald-600/40 bg-emerald-600/10" : "border-destructive/40 bg-destructive/5"}`}
                          data-testid="order-dry-run-result"
                        >
                          {dryRun.ok
                            ? `ส่งการ์ดคำสั่งซื้อทดสอบเข้า “${dryRun.room}” สำเร็จ • ${dryRun.at} — เปิด LINE เพื่อยืนยันว่าข้อความปรากฏในกลุ่ม`
                            : `ส่งไม่สำเร็จ (${dryRun.error}) • ${dryRun.at}`}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="font-semibold flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600" /> ยังไม่ได้ตั้งค่า
                      </div>
                      <ol className="list-decimal ml-4 text-xs text-muted-foreground space-y-0.5">
                        <li>เชิญ LINE OA ของร้านเข้ากลุ่มที่ใช้แจ้งออเดอร์</li>
                        <li>พิมพ์ “เชื่อมกลุ่มออเดอร์” ในกลุ่มนั้น (เฉพาะผู้ดูแลที่ผูก LINE แล้ว)</li>
                        <li>กลับมาหน้านี้แล้วเปิดสวิตช์รับแจ้งเตือน</li>
                      </ol>
                      <div className="text-xs text-muted-foreground">
                        ระหว่างนี้ลูกค้ายังสั่งซื้อได้ตามปกติ ออเดอร์จะถูกบันทึกและแจ้งเตือนในระบบเหมือนเดิม
                      </div>
                    </div>
                  )}
                </div>
              )}

              {list.length === 0 && (
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  ยังไม่มีห้องที่ผูกไว้ — เชิญ LINE OA เข้ากลุ่ม แล้วพิมพ์ “{TYPE_META[type].command}” ในกลุ่มนั้น
                </div>
              )}

              <div className="space-y-3">
                {list.map((row) => {
                  const busy = busyId === row.id;
                  return (
                    <article key={row.id} className="rounded-xl border border-border p-3 sm:p-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                            {row.display_name || "กลุ่ม LINE"}
                            {row.is_hub && row.is_active && (
                              <Badge className="bg-primary text-[10px]"><Target className="w-3 h-3 mr-1" />ห้องสำรองของประเภทนี้</Badge>
                            )}
                            {row.is_active
                              ? <Badge className="bg-emerald-600 text-[10px]">เปิดรับ</Badge>
                              : <Badge variant="secondary" className="text-[10px]">ปิดอยู่</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            ร้าน: {storeLabel(stores, row.store_id)} · ผูกเมื่อ {row.linked_at ? new Date(row.linked_at).toLocaleString("th-TH") : "-"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            ผลทดสอบล่าสุด: {row.last_test_status
                              ? `${row.last_test_status === "success" ? "สำเร็จ" : "ล้มเหลว"}${row.last_test_at ? ` • ${new Date(row.last_test_at).toLocaleString("th-TH")}` : ""}`
                              : "ยังไม่เคยทดสอบ"}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">รับแจ้งเตือน</span>
                          <Switch
                            checked={row.is_active}
                            disabled={busy}
                            onCheckedChange={(v) => setActive(row, v)}
                            aria-label="เปิด/ปิดรับแจ้งเตือน"
                          />
                        </div>
                      </div>

                      {!isGroup(row.line_destination_id) && (
                        <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-xs flex items-start gap-2 text-destructive">
                          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                          ปลายทางนี้เป็นแชทส่วนตัว ไม่ใช่กลุ่ม — ระบบจะไม่ส่งแจ้งเตือนเข้าไป
                        </div>
                      )}

                      {type === "order_group" ? (
                        <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground" data-testid="order-group-note">
                          ห้องนี้ใช้แจ้งเตือนคำสั่งซื้อเท่านั้น — คำสั่งคิวและการอ่านไฟล์ด้วย AI ถูกปิดไว้เสมอ
                          <div className="mt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-lg"
                              data-testid="order-dry-run-btn"
                              disabled={busy || !row.is_active}
                              onClick={() => sendOrderDryRun(row)}
                            >
                              {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                              ทดสอบส่งการ์ด “คำสั่งซื้อใหม่” (dry-run)
                            </Button>
                          </div>
                        </div>
                      ) : (
                      <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 space-y-2" data-testid="queue-command-perms">
                        <div className="text-xs font-semibold">คำสั่งคิวในห้องนี้ (เช็คคิว / รับงาน / ปิดจ๊อบ)</div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs text-muted-foreground">อนุญาตให้ใช้คำสั่งคิวในห้องนี้</span>
                          <Switch
                            checked={!!row.queue_commands_enabled}
                            disabled={busy}
                            onCheckedChange={(v) => setQueueFlags(row, v, null)}
                            aria-label="อนุญาตคำสั่งคิวในห้องนี้"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs text-muted-foreground">
                            เฉพาะบัญชีที่ได้รับสิทธิ์ (ผูก LINE + เป็นผู้ดูแล/อยู่ในรายชื่อของห้อง)
                          </span>
                          <Switch
                            checked={row.queue_require_admin !== false}
                            disabled={busy || !row.queue_commands_enabled}
                            onCheckedChange={(v) => setQueueFlags(row, !!row.queue_commands_enabled, v)}
                            aria-label="จำกัดเฉพาะบัญชีที่ได้รับสิทธิ์"
                          />
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          จัดรายชื่อผู้มีสิทธิ์ต่อห้องได้ที่{" "}
                          <Link to="/admin/line-room-admins" className="underline">ผูกห้อง ↔ แอดมิน</Link>
                        </div>
                      </div>
                      )}

                      {helpFor?.channelId === row.id && (
                        <div
                          className="mt-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs space-y-2"
                          data-testid="line-404-help"
                        >
                          <div className="font-semibold flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            LINE ตอบว่าบอทไม่ได้อยู่ในห้องนี้แล้ว ({helpFor.code}) — ต้องเชื่อมใหม่
                          </div>
                          <div>
                            ห้องที่ต้องไปกดเชื่อม: <b>{row.display_name || "กลุ่ม LINE"}</b>{" "}
                            (ร้าน {storeLabel(stores, row.store_id)} · {TYPE_META[type].title})
                          </div>
                          <ol className="list-decimal ml-4 space-y-1">
                            <li>เปิดกลุ่ม LINE ชื่อนี้ในมือถือ</li>
                            <li>เมนู ☰ → “เชิญ” → เชิญ LINE OA ของร้านนี้เข้ากลุ่มอีกครั้ง</li>
                            <li>พิมพ์คำสั่ง “{TYPE_META[type].command}” <b>ในกลุ่มนั้น</b></li>
                            <li>กลับมาหน้านี้ เปิดสวิตช์รับแจ้งเตือน แล้วกด “ทดสอบส่งแจ้งเตือน” ใหม่</li>
                          </ol>
                          <div className="flex gap-2 flex-wrap pt-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              className="rounded-lg"
                              onClick={async () => {
                                try { await navigator.clipboard.writeText(TYPE_META[type].command); } catch { /* ignore */ }
                                toast.info(`คัดลอกคำสั่งแล้ว — วางในกลุ่ม “${row.display_name || "กลุ่มนี้"}”`);
                                openLineChats();
                              }}
                            >
                              <MessageSquare className="w-3.5 h-3.5 mr-1" /> เปิด LINE + คัดลอกคำสั่ง
                            </Button>
                            <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => setHelpFor(null)}>
                              ปิดคำแนะนำ
                            </Button>
                          </div>
                        </div>
                      )}

                      <div className="mt-3 flex gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="rounded-lg"
                          onClick={async () => {
                            try { await navigator.clipboard.writeText(TYPE_META[type].command); } catch { /* ignore */ }
                            toast.info(`เปิด LINE แล้ว — เข้ากลุ่ม “${row.display_name || "กลุ่มนี้"}” แล้ววางคำสั่ง “${TYPE_META[type].command}”`);
                            openLineChats();
                          }}
                        >
                          <MessageSquare className="w-3.5 h-3.5 mr-1" /> เปิดห้องนี้ใน LINE + คัดลอกคำสั่ง
                        </Button>
                        <Button size="sm" className="rounded-lg" onClick={() => sendTest(row)} disabled={busy || !row.is_active}>
                          {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                          ทดสอบส่งแจ้งเตือน
                        </Button>
                        {row.is_active && (
                          <Button size="sm" variant="outline" className="rounded-lg" onClick={() => useOnly(row)} disabled={busy}>
                            <Route className="w-3.5 h-3.5 mr-1" /> ใช้ห้องนี้ห้องเดียว
                          </Button>
                        )}
                        {row.is_hub ? (
                          <Button size="sm" variant="secondary" className="rounded-lg" onClick={() => clearHub(row)} disabled={busy}>
                            <Target className="w-3.5 h-3.5 mr-1" /> ยกเลิกห้องสำรอง
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="rounded-lg" onClick={() => makeHub(row)} disabled={busy}>
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> ใช้เป็นห้องสำรอง
                          </Button>
                        )}
                        {row.is_active && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-lg text-destructive"
                            disabled={busy}
                            onClick={() => { if (confirm("ยกเลิกการเชื่อมห้องนี้?")) setActive(row, false); }}
                          >
                            <Unlink className="w-3.5 h-3.5 mr-1" /> ยกเลิกการเชื่อม
                          </Button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}

        <ol className="text-xs text-muted-foreground list-decimal ml-4 space-y-1">
          <li>เชิญ LINE OA ของร้านเข้ากลุ่มที่ต้องการให้แจ้งเตือน</li>
          <li>พิมพ์คำสั่งเชื่อมในกลุ่มนั้น (คัดลอกได้จากปุ่มด้านบน)</li>
          <li>กลับมาหน้านี้ เปิดสวิตช์ “รับแจ้งเตือน” ของห้องที่ต้องการ (เลือกได้หลายห้อง) แล้วกด “ทดสอบส่งแจ้งเตือน”</li>
        </ol>
      </div>
      {qr && (
        <QrLinkDialog
          open={!!qr}
          onOpenChange={(o) => { if (!o) setQr(null); }}
          url={qr.url}
          label={`LINE OA ${qr.label}`}
          hint="สแกนเพื่อเพิ่มเพื่อน OA ของร้านนี้ แล้วเชิญเข้ากลุ่มที่ต้องการ"
        />
      )}
    </AdminLayout>
  );
}