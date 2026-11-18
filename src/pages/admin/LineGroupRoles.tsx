import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
  BellRing, ClipboardList, Loader2, RefreshCw, Send, ShieldCheck, Rocket, Bot,
} from "lucide-react";

/**
 * บทบาทกลุ่ม LINE (อ่าน/ปรับสิทธิ์เฉพาะ 2 กลุ่มหลัก)
 *  - 🚀ออเดอร์ขั้นเทพ  = แจ้งเตือนคำสั่งซื้อหน้าเว็บ + ใบเบิกของ
 *  - 🤖botรันงาน       = คิวงานของ Film shop
 * หน้านี้ไม่แตะ business logic ของการส่ง — เรียกเฉพาะ RPC/edge function เดิม
 */

const ORDER_DEST = "C84f362c628aa1d92e30baef6ecfffedf";
const QUEUE_DEST = "C7b423589f0fae66e0efd67c400013a4c";

type ChannelRow = {
  id: string;
  store_id: string;
  channel_type: string;
  display_name: string | null;
  line_destination_id: string | null;
  is_active: boolean;
  is_hub: boolean | null;
  queue_commands_enabled: boolean | null;
  queue_require_admin: boolean | null;
  doc_commands_enabled: boolean | null;
  last_test_status: string | null;
  last_test_at: string | null;
};

type RoleDef = {
  key: "order" | "queue";
  dest: string;
  channelType: "order_group" | "queue_group";
  title: string;
  icon: typeof Rocket;
  purpose: string;
  duties: string[];
  notDuties: string[];
};

const ROLES: RoleDef[] = [
  {
    key: "order",
    dest: ORDER_DEST,
    channelType: "order_group",
    title: "🚀 ออเดอร์ขั้นเทพ",
    icon: Rocket,
    purpose: "กลุ่มแจ้งเตือนงานที่ลูกค้าสั่งเข้ามาทางเว็บ",
    duties: ["คำสั่งซื้อใหม่จากหน้าเว็บ", "ใบเบิกของ (ใบเขียนเบิก) ใหม่", "อัปเดตสถานะออเดอร์ที่สำคัญ"],
    notDuties: ["ไม่รับคำสั่งรันคิวงาน", "ไม่ใช้ออกเลขเอกสาร/อ่านไฟล์ด้วย AI"],
  },
  {
    key: "queue",
    dest: QUEUE_DEST,
    channelType: "queue_group",
    title: "🤖 botรันงาน",
    icon: Bot,
    purpose: "กลุ่มรันคิวงานของ Film shop",
    duties: ["รับ/รันคิวงานหน้าร้าน Film shop", "คำสั่งคิวจากแชท (เช่น รับงาน, ปิดงาน)"],
    notDuties: ["ไม่รับแจ้งเตือนออเดอร์หน้าเว็บ", "ไม่รับใบเบิกของ"],
  },
];

function fmt(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(iso));
  } catch { return iso; }
}

export default function AdminLineGroupRoles() {
  const [rows, setRows] = useState<ChannelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("line_notification_channels" as any)
      .select("id, store_id, channel_type, display_name, line_destination_id, is_active, is_hub, queue_commands_enabled, queue_require_admin, doc_commands_enabled, last_test_status, last_test_at")
      .in("line_destination_id", [ORDER_DEST, QUEUE_DEST]);
    if (error) toast.error("โหลดข้อมูลกลุ่มไม่สำเร็จ", { description: error.message });
    setRows(((data as any[]) ?? []) as ChannelRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const byRole = useMemo(() => {
    const map: Record<string, { main?: ChannelRow; others: ChannelRow[] }> = {};
    for (const role of ROLES) {
      const same = rows.filter((r) => r.line_destination_id === role.dest);
      map[role.key] = {
        main: same.find((r) => r.channel_type === role.channelType),
        others: same.filter((r) => r.channel_type !== role.channelType),
      };
    }
    return map;
  }, [rows]);

  async function callRpc(fn: string, args: Record<string, unknown>, okMsg: string, busyKey: string) {
    setBusy(busyKey);
    const { error } = await (supabase as any).rpc(fn, args);
    setBusy(null);
    if (error) toast.error("บันทึกไม่สำเร็จ", { description: error.message });
    else toast.success(okMsg);
    await load();
  }

  async function sendTest(role: RoleDef, row: ChannelRow) {
    setBusy(`test-${role.key}`);
    const { data, error } = await supabase.functions.invoke("send-line-notification", {
      body: {
        store_id: row.store_id,
        channel_type: row.channel_type,
        channel_id: row.id,
        ...(role.key === "order" ? { dry_run_order: true } : {}),
      },
    });
    setBusy(null);
    const ok = !error && !!(data as any)?.ok;
    if (ok) toast.success(`ส่งตัวอย่างเข้า ${role.title} แล้ว — เปิด LINE เพื่อดูข้อความ`);
    else toast.error("ส่งตัวอย่างไม่สำเร็จ", {
      description: String((data as any)?.error || (data as any)?.error_code || error?.message || "ไม่ทราบสาเหตุ"),
    });
    await load();
  }

  return (
    <AdminLayout>
      <SeoHead
        path="/admin/line-group-roles"
        title="บทบาทกลุ่ม LINE | ออเดอร์ขั้นเทพ และ botรันงาน"
        description="กำหนดความหมายและสิทธิ์ของกลุ่ม LINE ออเดอร์ขั้นเทพ (แจ้งเตือนออเดอร์และใบเบิกของ) กับ botรันงาน (คิวงาน Film shop) พร้อมทดสอบส่งแจ้งเตือนตัวอย่าง"
      />
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" /> บทบาทกลุ่ม LINE
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              กำหนดว่ากลุ่มไหนทำหน้าที่อะไร และทดสอบส่งแจ้งเตือนตัวอย่างได้ทันที
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> รีเฟรช
          </Button>
        </header>

        {ROLES.map((role) => {
          const entry = byRole[role.key] ?? { others: [] };
          const row = entry.main;
          const Icon = role.icon;
          return (
            <section key={role.key} className="bg-card border border-border shadow-card p-4 space-y-3" data-testid={`role-${role.key}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-2">
                  <Icon className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <h2 className="font-bold">{role.title}</h2>
                    <p className="text-sm text-muted-foreground">{role.purpose}</p>
                  </div>
                </div>
                {row ? (
                  row.is_active ? <Badge>เปิดใช้งาน</Badge> : <Badge variant="secondary">ปิดอยู่</Badge>
                ) : (
                  <Badge variant="destructive">ยังไม่ได้เชื่อมกลุ่ม</Badge>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <div className="border border-border p-3 space-y-1">
                  <p className="font-semibold flex items-center gap-1">
                    {role.key === "order" ? <BellRing className="w-4 h-4" /> : <ClipboardList className="w-4 h-4" />} รับผิดชอบ
                  </p>
                  <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
                    {role.duties.map((d) => <li key={d}>{d}</li>)}
                  </ul>
                </div>
                <div className="border border-border p-3 space-y-1">
                  <p className="font-semibold">ไม่รับผิดชอบ</p>
                  <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
                    {role.notDuties.map((d) => <li key={d}>{d}</li>)}
                  </ul>
                </div>
              </div>

              {row && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3 border border-border p-3">
                    <div className="text-sm">
                      <p className="font-medium">เปิดรับข้อความเข้ากลุ่มนี้</p>
                      <p className="text-xs text-muted-foreground">โทเคนร้าน: {row.store_id} · ทดสอบล่าสุด: {row.last_test_status || "—"} {fmt(row.last_test_at)}</p>
                    </div>
                    <Switch
                      checked={row.is_active}
                      disabled={busy !== null}
                      onCheckedChange={(v) =>
                        callRpc("admin_line_channel_toggle", { p_channel_id: row.id, p_active: v },
                          v ? "เปิดรับข้อความแล้ว" : "ปิดรับข้อความแล้ว", `active-${role.key}`)
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 border border-border p-3">
                    <div className="text-sm">
                      <p className="font-medium">อนุญาตคำสั่งรันคิวงานในกลุ่มนี้</p>
                      <p className="text-xs text-muted-foreground">
                        {role.key === "order" ? "แนะนำให้ปิด — กลุ่มนี้ใช้แจ้งเตือนอย่างเดียว" : "ต้องเปิดไว้ เพื่อให้ทีม Film shop สั่งงานคิวได้"}
                      </p>
                    </div>
                    <Switch
                      checked={!!row.queue_commands_enabled}
                      disabled={busy !== null}
                      onCheckedChange={(v) =>
                        callRpc("admin_line_channel_queue_flags",
                          { p_channel_id: row.id, p_enabled: v, p_require_admin: row.queue_require_admin },
                          "บันทึกสิทธิ์คำสั่งคิวแล้ว", `queue-${role.key}`)
                      }
                    />
                  </div>

                  {entry.others.length > 0 && (
                    <div className="border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-1">
                      <p className="font-semibold">รายการซ้อนของกลุ่มนี้ (ประเภทอื่น)</p>
                      {entry.others.map((o) => (
                        <div key={o.id} className="flex items-center justify-between gap-2">
                          <span>{o.channel_type} · {o.display_name || "—"}</span>
                          {o.is_active ? (
                            <Button
                              size="sm" variant="outline"
                              disabled={busy !== null}
                              onClick={() => callRpc("admin_line_channel_toggle", { p_channel_id: o.id, p_active: false }, "ปิดรายการซ้อนแล้ว", `off-${o.id}`)}
                            >
                              ปิด
                            </Button>
                          ) : <span className="text-muted-foreground">ปิดอยู่</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  <Button
                    size="sm"
                    className="w-full sm:w-auto"
                    disabled={busy !== null || !row.is_active}
                    onClick={() => void sendTest(role, row)}
                  >
                    {busy === `test-${role.key}` ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                    ทดสอบส่งแจ้งเตือนตัวอย่าง
                  </Button>
                </div>
              )}

              {!row && !loading && (
                <p className="text-sm text-muted-foreground">
                  ยังไม่พบห้องประเภท {role.channelType} ของกลุ่มนี้ — เชื่อมกลุ่มก่อนที่หน้า “จัดการห้องแอดมิน LINE”
                </p>
              )}
            </section>
          );
        })}

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" asChild><Link to="/admin/line-groups">จัดการห้องแอดมิน LINE</Link></Button>
          <Button variant="outline" size="sm" asChild><Link to="/admin/line-notify-status">สถานะแจ้งเตือนกลุ่ม</Link></Button>
        </div>
      </div>
    </AdminLayout>
  );
}
