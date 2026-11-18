import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import LineAdminGroupCard from "@/components/admin/LineAdminGroupCard";
import {
  KeyRound, Send, Loader2, RefreshCw, CheckCircle2, XCircle,
  Plus, Trash2, Smartphone, ExternalLink, Wand2, Copy, UserPlus,
} from "lucide-react";

type Status = {
  ok: boolean;
  source: "database" | "env" | "none";
  updated_at: string | null;
  bot_valid: boolean;
  bot?: any;
  recipients_enabled: number;
};

type Recipient = {
  id: string;
  line_user_id: string;
  label: string | null;
  enabled: boolean;
};

const UID_SHAPE = /^U[0-9a-f]{32}$/;

const CHANNELS = [
  { id: "default", label: "ร้านที่ 1 (หลัก)" },
  { id: "shop2", label: "ร้านที่ 2" },
] as const;

const WEBHOOK_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/line-webhook`;

export default function AdminLineSettings() {
  const [channel, setChannel] = useState<string>("default");
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);

  const [rows, setRows] = useState<Recipient[]>([]);
  const [newUid, setNewUid] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  const [easyLabel, setEasyLabel] = useState("");
  const [code, setCode] = useState<{ code: string; expires_at: string; oa_url: string | null } | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);
  const [senders, setSenders] = useState<{ line_user_id: string; display_name: string | null; last_seen: string }[]>([]);
  const [sendersBusy, setSendersBusy] = useState(false);

  async function loadStatus() {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("line-credentials", { body: { action: "status", channel } });
    if (error) toast.error("โหลดสถานะไม่สำเร็จ", { description: error.message });
    else setStatus(data as Status);
    setLoading(false);
  }

  async function loadRecipients() {
    const { data, error } = await supabase
      .from("admin_line_recipients" as any)
      .select("id, line_user_id, label, enabled")
      .order("created_at", { ascending: false });
    if (!error) setRows((data as any) ?? []);
  }

  useEffect(() => { loadRecipients(); }, []);
  // Re-check status whenever the admin switches shop OA.
  useEffect(() => { loadStatus(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [channel]);

  async function genCode() {
    setCodeBusy(true);
    const { data, error } = await supabase.functions.invoke("line-credentials", {
      body: { action: "gen_code", label: easyLabel.trim() || undefined },
    });
    setCodeBusy(false);
    const res = data as any;
    if (error || res?.ok === false) { toast.error("สร้างรหัสไม่สำเร็จ", { description: res?.error || error?.message }); return; }
    setCode({ code: res.code, expires_at: res.expires_at, oa_url: res.oa_url ?? null });
    toast.success("สร้างรหัสแล้ว — ให้ผู้รับส่งข้อความรหัสนี้เข้า LINE OA");
  }

  async function loadSenders() {
    setSendersBusy(true);
    const { data, error } = await supabase.functions.invoke("line-credentials", { body: { action: "recent_senders" } });
    setSendersBusy(false);
    const res = data as any;
    if (error || res?.ok === false) { toast.error("โหลดรายชื่อไม่สำเร็จ", { description: res?.error || error?.message }); return; }
    setSenders(res.senders ?? []);
    if ((res.senders ?? []).length === 0) toast.info("ยังไม่มีคนใหม่ที่ทักหา OA");
  }

  async function addFromSender(uid: string, name: string | null) {
    const { data, error } = await supabase.functions.invoke("line-credentials", {
      body: { action: "add_recipient", line_user_id: uid, label: name || undefined },
    });
    const res = data as any;
    if (error || res?.ok === false) { toast.error("เพิ่มไม่สำเร็จ", { description: res?.error || error?.message }); return; }
    toast.success("เพิ่มผู้รับแจ้งเตือนแล้ว");
    setSenders((s) => s.filter((x) => x.line_user_id !== uid));
    loadRecipients(); loadStatus();
  }

  async function test(to?: string) {
    setTesting(true);
    const { data, error } = await supabase.functions.invoke("line-credentials", { body: { action: "test", to } });
    setTesting(false);
    const res = data as any;
    if (error || res?.ok === false) {
      toast.error("ส่งทดสอบไม่สำเร็จ", { description: res?.error || res?.results?.[0]?.body || error?.message });
      return;
    }
    toast.success(`ส่งทดสอบสำเร็จ ${res?.results?.length ?? 1} เครื่อง — เช็คแอป LINE`);
  }

  async function addRecipient() {
    const uid = newUid.trim();
    if (!UID_SHAPE.test(uid)) {
      toast.error("รูปแบบ LINE User ID ไม่ถูกต้อง", { description: "ต้องขึ้นต้นด้วย U ตามด้วย hex 32 ตัว" });
      return;
    }
    setAddBusy(true);
    const { error } = await supabase.from("admin_line_recipients" as any).insert({
      line_user_id: uid, label: newLabel.trim() || null, enabled: true, notify_orders: true,
    });
    setAddBusy(false);
    if (error) { toast.error("เพิ่มไม่สำเร็จ", { description: error.message }); return; }
    setNewUid(""); setNewLabel("");
    toast.success("เพิ่มเครื่องรับแจ้งเตือนแล้ว");
    loadRecipients(); loadStatus();
  }

  async function toggle(r: Recipient, enabled: boolean) {
    setRows((s) => s.map((x) => (x.id === r.id ? { ...x, enabled } : x)));
    const { error } = await supabase.from("admin_line_recipients" as any).update({ enabled }).eq("id", r.id);
    if (error) { toast.error("อัปเดตไม่สำเร็จ"); loadRecipients(); }
  }

  async function remove(r: Recipient) {
    const { error } = await supabase.from("admin_line_recipients" as any).delete().eq("id", r.id);
    if (error) { toast.error("ลบไม่สำเร็จ", { description: error.message }); return; }
    toast.success("ลบแล้ว");
    loadRecipients(); loadStatus();
  }

  return (
    <AdminLayout>
      <SeoHead title="ตั้งค่า LINE (ผู้รับแจ้งเตือน)" description="จัดการกลุ่มแจ้งเตือนและเครื่องรับแจ้งเตือน LINE" path="/admin/line-settings" />

      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><KeyRound className="w-6 h-6 text-primary" /> ตั้งค่า LINE</h1>
          <p className="text-sm text-muted-foreground mt-1">จัดการกลุ่มและเครื่อง/บัญชีที่จะได้รับแจ้งเตือน (คีย์ทั้งหมดตั้งค่าใน Environment ของระบบเท่านั้น)</p>
          <p className="text-xs text-primary mt-2">
            การผูกกลุ่มแจ้งเตือนไม่เกี่ยวกับสิทธิ์เข้าแอปพนักงาน — เชิญ OA เข้ากลุ่มแล้วใช้คำสั่งบนการ์ดด้านล่างได้ทันที
          </p>
        </div>
        <Button variant="outline" onClick={() => { loadStatus(); loadRecipients(); }} disabled={loading} className="rounded-xl">
          {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />} ตรวจซ้ำ
        </Button>
      </div>

      {/* ห้องแจ้งเตือนออเดอร์ + กลุ่มรันคิว NATTA.Q (แยกกันคนละกลุ่ม) */}
      <LineAdminGroupCard storeId={channel} channelType="admin_group" />

      {/* เลือก LINE OA ของร้าน */}
      <section className="bg-card border border-border rounded-2xl p-4 shadow-card mb-4">
        <div className="text-sm font-semibold mb-2">LINE OA ที่ต้องการตั้งค่า</div>
        <div className="flex flex-wrap gap-2">
          {CHANNELS.map((c) => (
            <Button
              key={c.id}
              variant={channel === c.id ? "default" : "outline"}
              className="rounded-xl"
              onClick={() => setChannel(c.id)}
            >
              {c.label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          แนะนำให้ตั้ง Webhook URL แยกรายร้าน (ด้านล่าง) เพื่อกันสับสนระหว่าง OA — ถ้าใช้ URL รวมก็ยังทำงานได้
          ระบบจะแยกให้อัตโนมัติจาก Channel secret ของแต่ละ OA
        </p>

        <div className="mt-3 space-y-2">
          <div className="text-xs font-semibold">Webhook URL แยกรายร้าน (ใส่ใน LINE Developers → Messaging API)</div>
          {CHANNELS.map((c) => {
            const url = `${WEBHOOK_BASE}?ch=${c.id}`;
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-2">
                <Badge variant={channel === c.id ? "default" : "outline"} className="text-[10px]">{c.label}</Badge>
                <Input readOnly value={url} className="font-mono text-xs flex-1 min-w-[240px] h-9" />
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => { navigator.clipboard.writeText(url); toast.success(`คัดลอก Webhook URL ${c.label} แล้ว`); }}
                >
                  <Copy className="w-4 h-4 mr-1" /> คัดลอก
                </Button>
              </div>
            );
          })}
          <p className="text-[11px] text-muted-foreground">
            URL รวม (ใช้ได้เหมือนเดิม): <span className="font-mono break-all">{WEBHOOK_BASE}</span>
          </p>
        </div>
      </section>

      {/* สถานะปัจจุบัน */}
      <section className="bg-card border border-border rounded-2xl p-5 shadow-card mb-4">
        <div className="flex items-center gap-2 mb-3">
          {status?.bot_valid ? <CheckCircle2 className="w-5 h-5 text-success" /> : <XCircle className="w-5 h-5 text-destructive" />}
          <h2 className="font-bold">สถานะการเชื่อมต่อ</h2>
          {status && (
            <Badge variant={status.bot_valid ? "default" : "destructive"} className="text-[10px]">
              {status.bot_valid ? "ใช้งานได้" : "โทเคนใช้ไม่ได้"}
            </Badge>
          )}
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">กำลังตรวจสอบ…</p>
        ) : status ? (
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>บัญชี OA: <b>{status.bot?.displayName || "—"}</b> {status.bot?.basicId ? <span className="text-muted-foreground">({status.bot.basicId})</span> : null}</div>
            <div>เครื่องที่รับแจ้งเตือน: <b>{status.recipients_enabled}</b></div>
            {status.updated_at && <div className="text-muted-foreground">อัปเดตล่าสุด: {new Date(status.updated_at).toLocaleString("th-TH")}</div>}
            {!status.bot_valid && status.bot?.detail && <div className="text-destructive break-all sm:col-span-2">{String(status.bot.detail).slice(0, 200)}</div>}
          </div>
        ) : null}
      </section>

      {/* แจ้งเตือนเข้ากลุ่มเท่านั้น (Group-only) */}
      <section className="bg-card border border-border rounded-2xl p-5 shadow-card">
        <div className="flex items-center gap-2 mb-1">
          <Smartphone className="w-5 h-5 text-primary" />
          <h2 className="font-bold">ปลายทางแจ้งเตือน: กลุ่ม LINE เท่านั้น</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          คำสั่งซื้อใหม่ และใบเขียนเบิก จะแจ้งเตือนเข้า “กลุ่ม LINE รับออเดอร์” ที่เปิดใช้งานอยู่กลุ่มเดียวเท่านั้น
          ระบบไม่ส่งเข้าแชทส่วนตัว (1:1) ของแอดมินอีกต่อไป จึงไม่มีรายชื่อผู้รับรายบุคคลให้ตั้งค่าแล้ว
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="rounded-lg" asChild>
            <Link to="/admin/line-groups">จัดการกลุ่มแจ้งเตือน</Link>
          </Button>
          <Button variant="outline" size="sm" className="rounded-lg" asChild>
            <Link to="/admin/line-notifications">ดู log การส่ง</Link>
          </Button>
        </div>
      </section>

    </AdminLayout>
  );
}
