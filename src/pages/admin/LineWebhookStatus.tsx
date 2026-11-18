import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, CheckCircle2, Clock, ExternalLink, Loader2, RefreshCw, Webhook, XCircle } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { useRealtimeRefresh } from "@/hooks/useRealtimeTable";
import { toast } from "sonner";

type Ev = {
  id: string;
  received_at: string;
  signature_ok: boolean;
  event_type: string | null;
  source_user_id: string | null;
  handler_error: string | null;
  handler_result: string | null;
};

function relTime(iso: string): string {
  const d = new Date(iso).getTime();
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return `${s} วินาทีที่แล้ว`;
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชั่วโมงที่แล้ว`;
  return `${Math.floor(s / 86400)} วันที่แล้ว`;
}

export default function AdminLineWebhookStatus() {
  const [rows, setRows] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("line_webhook_events")
      .select("id, received_at, signature_ok, event_type, source_user_id, handler_error, handler_result")
      .gte("received_at", new Date(Date.now() - 7 * 86400_000).toISOString())
      .order("received_at", { ascending: false })
      .limit(500);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []) as Ev[]);
  }
  useEffect(() => { load(); }, []);
  useRealtimeRefresh(["line_webhook_events"], () => load());

  const stats = useMemo(() => {
    const now = Date.now();
    const in24 = rows.filter(r => now - new Date(r.received_at).getTime() < 86400_000);
    const okCount = in24.filter(r => r.signature_ok).length;
    const failCount = in24.filter(r => !r.signature_ok).length;
    const users = new Set(in24.map(r => r.source_user_id).filter(Boolean) as string[]);
    const byType = new Map<string, number>();
    for (const r of in24) {
      const t = r.event_type || "unknown";
      byType.set(t, (byType.get(t) ?? 0) + 1);
    }
    // Bucket by day for 7d bar
    const days: { label: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - i);
      const end = new Date(start); end.setDate(end.getDate() + 1);
      const c = rows.filter(r => {
        const t = new Date(r.received_at).getTime();
        return t >= start.getTime() && t < end.getTime();
      }).length;
      days.push({ label: start.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit" }), count: c });
    }
    const errors = rows.filter(r => r.handler_error).slice(0, 5);
    const last = rows[0] || null;
    return { total24: in24.length, okCount, failCount, users: users.size, byType, days, errors, last };
  }, [rows]);

  const verdict = useMemo(() => {
    if (!stats.last) return { tone: "warn", title: "ยังไม่มี event เข้ามาเลย", desc: "ลองให้แอดมินทัก LINE OA หรือกด Verify ใน LINE Console เพื่อทดสอบว่า Webhook ทำงาน" };
    const fresh = Date.now() - new Date(stats.last.received_at).getTime() < 86400_000;
    if (!fresh) return { tone: "warn", title: "ไม่มี event ใน 24 ชั่วโมงล่าสุด", desc: "อาจเป็นเรื่องปกติหากไม่มีคนทัก OA — ให้ลองทักหา OA แล้วรีเฟรชหน้านี้" };
    if (stats.failCount > 0 && stats.okCount === 0) return { tone: "error", title: "Signature ตรวจสอบไม่ผ่านทุก event", desc: "ตรวจ LINE_CHANNEL_SECRET ให้ตรงกับ Channel ปัจจุบันในหน้า LINE Console" };
    return { tone: "ok", title: "Webhook ทำงานปกติ", desc: `รับ ${stats.total24} event ใน 24 ชม. — ล่าสุด ${relTime(stats.last.received_at)}` };
  }, [stats]);

  const maxDay = Math.max(1, ...stats.days.map(d => d.count));

  return (
    <AdminLayout>
      <SeoHead title="สรุปสถานะ LINE Webhook — แอดมิน" description="ดาชบอร์ดสรุปสถานะ webhook ของ LINE OA และ event ล่าสุด" path="/admin/line-webhook-status" />
      <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Webhook className="w-6 h-6 text-primary" /> สรุปสถานะ LINE Webhook</h1>
          <p className="text-sm text-muted-foreground">ตรวจว่าแจ้งเตือน LINE ไหลเข้ามาแล้วหรือยัง พร้อมสถิติ 24 ชม. / 7 วัน</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-xl" asChild><Link to="/admin/line-webhook-events">Event รายการดิบ <ExternalLink className="w-3.5 h-3.5 ml-1" /></Link></Button>
          <Button variant="outline" className="rounded-xl" asChild><Link to="/admin/line-notifications">สถานะการส่ง</Link></Button>
          <Button variant="outline" className="rounded-xl" asChild><Link to="/admin/line-settings">ตั้งค่า</Link></Button>
          <Button className="rounded-xl bg-primary text-primary-foreground" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />} รีเฟรช
          </Button>
        </div>
      </div>

      {/* Verdict card */}
      <div className={`rounded-2xl border shadow-card p-4 mb-4 ${
        verdict.tone === "ok" ? "bg-emerald-50 border-emerald-200" :
        verdict.tone === "error" ? "bg-rose-50 border-rose-200" :
        "bg-amber-50 border-amber-200"
      }`}>
        <div className="flex items-start gap-3">
          {verdict.tone === "ok" ? <CheckCircle2 className="w-6 h-6 text-emerald-600 mt-0.5" /> :
            verdict.tone === "error" ? <XCircle className="w-6 h-6 text-rose-600 mt-0.5" /> :
            <AlertTriangle className="w-6 h-6 text-amber-600 mt-0.5" />}
          <div>
            <div className="font-bold text-lg">{verdict.title}</div>
            <div className="text-sm text-muted-foreground">{verdict.desc}</div>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard icon={<Activity className="w-4 h-4" />} label="Event ใน 24 ชม." value={stats.total24} />
        <StatCard icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} label="Signature ผ่าน" value={stats.okCount} />
        <StatCard icon={<XCircle className="w-4 h-4 text-rose-600" />} label="Signature ล้มเหลว" value={stats.failCount} tone={stats.failCount > 0 ? "warn" : undefined} />
        <StatCard icon={<Clock className="w-4 h-4" />} label="Unique users" value={stats.users} />
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        {/* 7-day sparkline */}
        <div className="bg-card rounded-2xl border border-border shadow-card p-4">
          <div className="font-semibold text-sm mb-3">Event 7 วันล่าสุด</div>
          <div className="flex items-end gap-2 h-32">
            {stats.days.map(d => (
              <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-primary/80 rounded-t"
                     style={{ height: `${Math.max(4, (d.count / maxDay) * 100)}%` }} title={`${d.count} event`} />
                <div className="text-[10px] text-muted-foreground">{d.label}</div>
                <div className="text-[10px] font-mono">{d.count}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Type breakdown */}
        <div className="bg-card rounded-2xl border border-border shadow-card p-4">
          <div className="font-semibold text-sm mb-3">ประเภท Event (24 ชม.)</div>
          {stats.byType.size === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">ยังไม่มีข้อมูล</div>
          ) : (
            <div className="space-y-2">
              {Array.from(stats.byType.entries()).sort((a,b) => b[1]-a[1]).map(([t, n]) => (
                <div key={t} className="flex items-center justify-between text-sm">
                  <Badge variant="outline">{t}</Badge>
                  <span className="font-mono">{n}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Handler errors */}
      <div className="bg-card rounded-2xl border border-border shadow-card p-4 mb-4">
        <div className="font-semibold text-sm mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600" /> Handler error ล่าสุด
        </div>
        {stats.errors.length === 0 ? (
          <div className="text-sm text-muted-foreground">ไม่มี error — ระบบทำงานปกติ</div>
        ) : (
          <ul className="space-y-2 text-xs">
            {stats.errors.map(e => (
              <li key={e.id} className="p-2 rounded-lg bg-rose-50 border border-rose-200">
                <div className="text-[11px] text-muted-foreground">{fmtDateTime(e.received_at)} · {e.event_type || "—"}</div>
                <div className="text-rose-700 font-mono break-all">{e.handler_error}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminLayout>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone?: "warn" }) {
  return (
    <div className={`bg-card rounded-2xl border shadow-card p-4 ${tone === "warn" ? "border-amber-300" : "border-border"}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}