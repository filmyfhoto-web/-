import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Users, Send, PauseCircle, PlayCircle, Unlink, Loader2, RefreshCw,
  CheckCircle2, XCircle, Target,
} from "lucide-react";
import { Copy, AlertTriangle } from "lucide-react";

type ChannelRow = {
  id: string;
  display_name: string | null;
  line_destination_id: string | null;
  is_active: boolean;
  is_hub: boolean | null;
  linked_at: string | null;
  linked_by: string | null;
  last_test_status: string | null;
  last_test_at: string | null;
};

type ServerConfig = {
  LINE_CHANNEL_ID: boolean;
  LINE_CHANNEL_SECRET: boolean;
  LINE_CHANNEL_ACCESS_TOKEN: boolean;
};

const CONFIG_LABELS: Record<keyof ServerConfig, string> = {
  LINE_CHANNEL_ID: "LINE_CHANNEL_ID",
  LINE_CHANNEL_SECRET: "LINE_CHANNEL_SECRET",
  LINE_CHANNEL_ACCESS_TOKEN: "LINE_CHANNEL_ACCESS_TOKEN",
};

type ChannelType = "admin_group" | "queue_group";

const TYPE_META: Record<ChannelType, { title: string; hint: string; command: string }> = {
  admin_group: {
    title: "ห้องแจ้งเตือนออเดอร์ (LINE Group)",
    hint: "รับเฉพาะออเดอร์ใหม่จากเว็บแอป",
    command: "เชื่อมห้องแอดมิน",
  },
  queue_group: {
    title: "กลุ่มรันคิวงาน NATTA.Q (LINE Group)",
    hint: "รับเฉพาะใบงาน/คิวงานที่ AI สร้างจากแชท",
    command: "เชื่อมกลุ่มรันคิว",
  },
};

export default function LineAdminGroupCard({
  storeId = "default",
  channelType = "admin_group",
}: { storeId?: string; channelType?: ChannelType }) {
  const [row, setRow] = useState<ChannelRow | null>(null);
  const [hubOther, setHubOther] = useState<string | null>(null);
  const [linkerName, setLinkerName] = useState<string | null>(null);
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("line_notification_channels" as any)
      .select("id, display_name, line_destination_id, is_active, is_hub, linked_at, linked_by, last_test_status, last_test_at")
      .eq("store_id", storeId)
      .eq("channel_type", channelType)
      .order("linked_at", { ascending: false })
      .limit(1);
    const found = ((data as any[]) ?? [])[0] ?? null;
    setRow(found);
    const { data: hubRows } = await supabase
      .from("line_notification_channels" as any)
      .select("id, display_name, store_id")
      .eq("is_hub", true)
      .eq("is_active", true)
      .eq("channel_type", channelType)
      .limit(1);
    const hub = ((hubRows as any[]) ?? [])[0] ?? null;
    setHubOther(hub && hub.id !== found?.id ? (hub.display_name || hub.store_id || "ห้องอื่น") : null);
    if (found?.linked_by) {
      const { data: prof } = await supabase
        .from("profiles").select("full_name, email").eq("id", found.linked_by).maybeSingle();
      setLinkerName((prof as any)?.full_name || (prof as any)?.email || null);
    } else setLinkerName(null);
    setLoading(false);
  }, [storeId, channelType]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const realtime = supabase
      .channel(`line-groups:${storeId}:${channelType}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "line_notification_channels", filter: `store_id=eq.${storeId}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(realtime); };
  }, [storeId, channelType, load]);

  useEffect(() => {
    supabase.functions.invoke("line-config-check", { body: {} }).then(({ data }) => {
      const sc = (data as any)?.server_config;
      if (sc) setConfig(sc as ServerConfig);
    }).catch(() => { /* presence check is best-effort */ });
  }, []);

  const configReady = Boolean(
    config?.LINE_CHANNEL_ID && config?.LINE_CHANNEL_SECRET && config?.LINE_CHANNEL_ACCESS_TOKEN,
  );

  async function sendTest() {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("send-line-notification", {
      body: { store_id: storeId, channel_type: channelType },
    });
    if (error || !(data as any)?.ok) {
      toast.error("ส่งข้อความทดสอบไม่สำเร็จ", { description: (data as any)?.error_code || error?.message });
    } else {
      toast.success("ส่งข้อความทดสอบเข้าห้องแอดมินแล้ว");
    }
    setBusy(false);
    load();
  }

  async function setActive(active: boolean) {
    if (!row) return;
    setBusy(true);
    const { error } = await supabase
      .from("line_notification_channels" as any)
      .update({ is_active: active } as any)
      .eq("id", row.id);
    if (error) toast.error("อัปเดตสถานะไม่สำเร็จ", { description: error.message });
    else toast.success(active ? "เปิดรับแจ้งเตือนแล้ว" : "ปิดรับแจ้งเตือนชั่วคราวแล้ว");
    setBusy(false);
    load();
  }

  /** ศูนย์รวมแจ้งเตือน — มีผลเฉพาะภายในประเภทเดียวกัน (ออเดอร์ / รันคิว แยกกัน) */
  async function setHub(on: boolean) {
    if (!row) return;
    setBusy(true);
    if (on) {
      await supabase.from("line_notification_channels" as any)
        .update({ is_hub: false } as any).eq("is_hub", true).eq("channel_type", channelType);
    }
    const { error } = await supabase
      .from("line_notification_channels" as any)
      .update({ is_hub: on } as any)
      .eq("id", row.id);
    if (error) toast.error("ตั้งค่าศูนย์รวมแจ้งเตือนไม่สำเร็จ", { description: error.message });
    else toast.success(on ? "แจ้งเตือนทั้งหมดจะเข้าห้องนี้ห้องเดียว" : "ยกเลิกศูนย์รวมแจ้งเตือนแล้ว");
    setBusy(false);
    load();
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 mb-6">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <h2 className="font-bold text-base flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" /> {TYPE_META[channelType].title}
        </h2>
        <Button variant="outline" size="sm" className="rounded-lg" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {row?.is_active
          ? <Badge className="bg-emerald-600">เชื่อมแล้ว</Badge>
          : row
            ? <Badge variant="secondary">ปิดใช้งานชั่วคราว</Badge>
            : <Badge variant="outline">ยังไม่เชื่อม</Badge>}
        {row?.display_name && <span className="text-sm">{row.display_name}</span>}
        {row?.is_hub && row?.is_active && <Badge className="bg-primary">ศูนย์รวมแจ้งเตือน</Badge>}
      </div>

      {/* ปลายทางที่ขึ้นต้นด้วย U คือแชทส่วนตัว ไม่ใช่กลุ่ม — ระบบจะไม่ส่งแจ้งเตือนไปที่นั่น */}
      {row?.line_destination_id && !/^[CR]/.test(row.line_destination_id) && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 mb-3 text-xs space-y-2">
          <div className="flex items-start gap-2 font-semibold text-destructive">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            ปลายทางนี้เป็นแชทส่วนตัว ไม่ใช่ LINE Group — ระบบจะไม่ส่งแจ้งเตือนเข้าไป
          </div>
          <p className="text-muted-foreground">
            เชิญ LINE OA เข้ากลุ่มที่สร้างไว้ แล้วพิมพ์คำสั่งด้านล่างในกลุ่มนั้น ระบบจะย้ายปลายทางให้อัตโนมัติ
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <code className="rounded-lg bg-muted px-2 py-1 text-xs font-mono">{TYPE_META[channelType].command}</code>
        <Button
          size="sm"
          variant="outline"
          className="rounded-lg"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(TYPE_META[channelType].command);
              toast.success("คัดลอกคำสั่งแล้ว — ไปวางในกลุ่ม LINE ได้เลย");
            } catch {
              toast.error("คัดลอกไม่สำเร็จ");
            }
          }}
        >
          <Copy className="w-3.5 h-3.5 mr-1" /> คัดลอกคำสั่งเชื่อมกลุ่ม
        </Button>
      </div>

      {row && (
        <dl className="grid gap-1 text-xs text-muted-foreground mb-3">
          <div>เวลาเชื่อม: {row.linked_at ? new Date(row.linked_at).toLocaleString("th-TH") : "-"}</div>
          <div>ผู้เชื่อม: {linkerName || "-"}</div>
          <div>
            ผลทดสอบล่าสุด: {row.last_test_status
              ? `${row.last_test_status === "success" ? "สำเร็จ" : "ล้มเหลว"}${row.last_test_at ? ` • ${new Date(row.last_test_at).toLocaleString("th-TH")}` : ""}`
              : "ยังไม่เคยทดสอบ"}
          </div>
        </dl>
      )}

      <div className="flex gap-2 flex-wrap mb-4">
        <Button size="sm" className="rounded-lg" onClick={sendTest} disabled={busy || !row?.is_active || !configReady}>
          {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />} ทดสอบแจ้งเตือน
        </Button>
        {row?.is_active && (
          <Button size="sm" variant="outline" className="rounded-lg" onClick={() => setActive(false)} disabled={busy}>
            <PauseCircle className="w-3.5 h-3.5 mr-1" /> ปิดชั่วคราว
          </Button>
        )}
        {row && !row.is_active && (
          <Button size="sm" variant="outline" className="rounded-lg" onClick={() => setActive(true)} disabled={busy}>
            <PlayCircle className="w-3.5 h-3.5 mr-1" /> เปิดใหม่
          </Button>
        )}
        {row?.is_active && (
          <Button
            size="sm"
            variant={row.is_hub ? "secondary" : "outline"}
            className="rounded-lg"
            onClick={() => setHub(!row.is_hub)}
            disabled={busy}
          >
            <Target className="w-3.5 h-3.5 mr-1" />
            {row.is_hub ? "ยกเลิกศูนย์รวมแจ้งเตือน" : "ตั้งเป็นศูนย์รวมแจ้งเตือน (ที่เดียว)"}
          </Button>
        )}
        {row?.is_active && (
          <Button
            size="sm"
            variant="ghost"
            className="rounded-lg text-destructive"
            disabled={busy}
            onClick={() => { if (confirm("ยกเลิกการเชื่อมห้องแอดมินนี้?")) setActive(false); }}
          >
            <Unlink className="w-3.5 h-3.5 mr-1" /> ยกเลิกการเชื่อม
          </Button>
        )}
      </div>

      {hubOther && (
        <p className="text-xs text-muted-foreground mb-3">
          ตอนนี้แจ้งเตือนทั้งหมดถูกส่งไปที่ “{hubOther}” ห้องเดียว — ห้องนี้จะไม่ได้รับแจ้งเตือนจนกว่าจะเปลี่ยนศูนย์รวม
        </p>
      )}

      {!configReady && (
        <p className="text-xs text-destructive mb-3">
          ยังตั้งค่าเซิร์ฟเวอร์ไม่ครบ — ปุ่มทดสอบถูกปิดไว้ ต้องมีค่า LINE_CHANNEL_ID, LINE_CHANNEL_SECRET และ LINE_CHANNEL_ACCESS_TOKEN ครบก่อน
        </p>
      )}

      <div className="rounded-xl bg-muted/40 p-3 mb-3">
        <div className="text-xs font-semibold mb-2">ค่าตั้งค่าเซิร์ฟเวอร์ (แสดงเฉพาะสถานะ ไม่แสดงค่า)</div>
        <div className="grid gap-1">
          {(Object.keys(CONFIG_LABELS) as (keyof ServerConfig)[]).map((k) => (
            <div key={k} className="flex items-center gap-2 text-xs">
              {config?.[k]
                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                : <XCircle className="w-3.5 h-3.5 text-destructive" />}
              <span className="font-mono">{CONFIG_LABELS[k]}</span>
              <span className="text-muted-foreground">{config?.[k] ? "configured" : "not configured"}</span>
            </div>
          ))}
        </div>
      </div>

      <ol className="text-xs text-muted-foreground list-decimal ml-4 space-y-1">
        <li>{TYPE_META[channelType].hint} — เชิญ LINE OA ของร้านเข้ากลุ่มนี้</li>
        <li>พิมพ์ในกลุ่มว่า “{TYPE_META[channelType].command}” — กลุ่มแรกเชื่อมได้ทันที ไม่ต้องอนุมัติบัญชีพนักงาน</li>
        <li>หากมีกลุ่มจริงผูกอยู่แล้ว เจ้าของร้านต้องยกเลิกหรือเปลี่ยนจากหน้านี้เพื่อป้องกันการผูกผิดกลุ่ม</li>
        <li>ระบบจะตอบการ์ดยืนยัน แล้วกด “ทดสอบแจ้งเตือน” เพื่อตรวจสอบ</li>
        <li>ระบบจะไม่ส่งแจ้งเตือนเข้าแชทส่วนตัวของ LINE ร้านอีกต่อไป ส่งเฉพาะกลุ่มเท่านั้น</li>
      </ol>
    </section>
  );
}
