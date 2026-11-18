import CustomerLayout from "@/components/layout/CustomerLayout";
import SeoHead from "@/components/SeoHead";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fmtDateTime } from "@/lib/format";
import { ArrowLeft, Bug, RefreshCw, Loader2, Settings } from "lucide-react";

type ActivityRow = {
  id: string;
  action: string;
  created_at: string;
  detail: Record<string, unknown> | null;
};

type NotifRow = {
  id: string;
  kind: string | null;
  recipient: string | null;
  sent_status: string | null;
  error_message: string | null;
  created_at: string;
  last_attempt_at: string | null;
  order_id: string | null;
};

const LINE_EVENTS = [
  "line_link_start",
  "line_link_success",
  "line_link_error",
  "line_link_test_ok",
  "line_link_test_error",
  "line_unlink",
];

function statusColor(s: string | null | undefined) {
  switch (s) {
    case "sent": return "bg-success text-success-foreground";
    case "failed": return "bg-destructive text-destructive-foreground";
    case "pending": return "bg-amber-500 text-white";
    case "deduped": return "bg-muted text-foreground";
    default: return "bg-muted text-foreground";
  }
}

export default function LineDebug() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<ActivityRow[]>([]);
  const [notifs, setNotifs] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!user) return;
    setLoading(true);
    try {
      const [a, n] = await Promise.all([
        supabase
          .from("activity_logs")
          .select("id, action, created_at, detail")
          .eq("user_id", user.id)
          .in("action", LINE_EVENTS)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("line_notifications")
          .select("id, kind, recipient, sent_status, error_message, created_at, last_attempt_at, order_id")
          .order("created_at", { ascending: false })
          .limit(30),
      ]);
      setLogs((a.data || []) as ActivityRow[]);
      setNotifs((n.data || []) as NotifRow[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  return (
    <CustomerLayout>
      <SeoHead title="LINE debug log" description="แสดง log การเชื่อมต่อ LINE และข้อความที่ระบบส่ง เพื่อใช้ตรวจสอบเมื่อเชื่อมไม่สำเร็จ" path="/account/line-debug" />
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Bug className="w-6 h-6 text-primary" /> LINE Debug Log</h1>
          <p className="text-sm text-muted-foreground">ดูประวัติเหตุการณ์การเชื่อมต่อ LINE และสถานะการส่งข้อความล่าสุด</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-xl" asChild>
            <Link to="/account"><ArrowLeft className="w-4 h-4 mr-1" /> กลับ</Link>
          </Button>
          <Button variant="outline" className="rounded-xl" asChild>
            <Link to="/account/line"><Settings className="w-4 h-4 mr-1" /> คู่มือตั้งค่า</Link>
          </Button>
          <Button className="rounded-xl bg-primary text-primary-foreground" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            รีเฟรช
          </Button>
        </div>
      </div>

      <section className="bg-card border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border font-bold">เหตุการณ์การเชื่อมต่อของฉัน (ล่าสุด 50 รายการ)</div>
        {logs.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">ยังไม่มีเหตุการณ์</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-accent text-xs"><tr>
                <th className="text-left p-3">เวลา</th>
                <th className="text-left p-3">เหตุการณ์</th>
                <th className="text-left p-3">รายละเอียด</th>
              </tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="p-3 text-xs whitespace-nowrap">{fmtDateTime(l.created_at)}</td>
                    <td className="p-3"><Badge variant="outline">{l.action}</Badge></td>
                    <td className="p-3"><pre className="text-[11px] whitespace-pre-wrap break-words">{l.detail ? JSON.stringify(l.detail, null, 2) : "—"}</pre></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-card border border-border rounded-2xl shadow-card overflow-hidden mt-4">
        <div className="px-5 py-3 border-b border-border font-bold">ข้อความที่ระบบส่งล่าสุด (30 รายการ)</div>
        {notifs.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">ยังไม่มีข้อความที่ส่ง</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-accent text-xs"><tr>
                <th className="text-left p-3">เวลา</th>
                <th className="text-left p-3">ประเภท</th>
                <th className="text-left p-3">สถานะ</th>
                <th className="text-left p-3">เหตุผล / error</th>
              </tr></thead>
              <tbody>
                {notifs.map((n) => (
                  <tr key={n.id} className="border-t border-border">
                    <td className="p-3 text-xs whitespace-nowrap">{fmtDateTime(n.created_at)}</td>
                    <td className="p-3"><Badge variant="outline">{n.kind || "—"}</Badge></td>
                    <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-[11px] ${statusColor(n.sent_status)}`}>{n.sent_status || "—"}</span></td>
                    <td className="p-3 text-xs break-words max-w-md">{n.error_message || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </CustomerLayout>
  );
}