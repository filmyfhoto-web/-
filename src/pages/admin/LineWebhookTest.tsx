import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, Send, Inbox, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

type Result = {
  ok: boolean;
  verdict?: string;
  reason_th?: string;
  error?: string;
  store?: { id: string; label: string | null };
  sample?: { text: string; line_user_id: string };
  http?: { status: number; body: string; latency_ms: number };
  total_ms?: number;
  message?: { id: string; conversation_id: string; text: string; direction: string; created_at: string } | null;
  conversation?: {
    id: string; store_id: string | null; channel: string | null; display_name: string | null;
    last_message_preview: string | null; unread_count: number | null; last_message_at: string | null;
  } | null;
  latest_webhook_event?: { id: string; signature_ok: boolean; event_type: string; created_at: string } | null;
};

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border last:border-0">
      {ok === undefined ? <span className="w-5" /> : ok
        ? <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
        : <XCircle className="w-5 h-5 text-destructive shrink-0" />}
      <div className="text-sm text-muted-foreground w-40 shrink-0">{label}</div>
      <div className="text-sm font-medium break-all flex-1">{value}</div>
    </div>
  );
}

export default function AdminLineWebhookTest() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [ranAt, setRanAt] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("line-webhook-selftest", { body: {} });
      if (error) throw error;
      setResult(data as Result);
      setRanAt(new Date().toLocaleString("th-TH"));
      if ((data as Result)?.ok) toast.success("ส่งข้อความทดสอบสำเร็จ — ขึ้นในกล่องข้อความแล้ว");
      else toast.warning((data as Result)?.reason_th || "ทดสอบไม่ผ่าน");
    } catch (e: any) {
      toast.error(e?.message || "เรียกฟังก์ชันไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminLayout>
      <SeoHead
        title="ทดสอบ LINE Webhook"
        description="ส่งข้อความตัวอย่างเข้า webhook จริง แล้วยืนยันว่าบันทึกลงฐานข้อมูลและขึ้นในกล่องข้อความแอดมินทันที"
        path="/admin/line-webhook-test"
      />
      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Inbox className="w-6 h-6 text-primary" /> ทดสอบ LINE Webhook
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ระบบจะสร้างข้อความตัวอย่าง เซ็น signature ด้วย Channel secret จริง ยิงเข้า webhook
            แล้วตรวจว่าถูกบันทึกลงฐานข้อมูลและปรากฏในกล่องข้อความแอดมิน
          </p>
          {ranAt && <p className="text-xs text-muted-foreground mt-1">ทดสอบล่าสุด: {ranAt}</p>}
        </div>
        <Button onClick={run} disabled={loading} className="rounded-xl">
          {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
          ส่งข้อความตัวอย่าง
        </Button>
      </div>

      {!result ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
          <p>กด "ส่งข้อความตัวอย่าง" เพื่อเริ่มทดสอบ</p>
          <p className="text-xs mt-2">ข้อความจะขึ้นต้นด้วย [TEST] และล้างได้จากปุ่มล้างข้อมูลทดสอบ</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-4 shadow-card">
            <div className="flex items-center gap-2 flex-wrap">
              {result.ok ? <CheckCircle2 className="w-5 h-5 text-success" /> : <XCircle className="w-5 h-5 text-destructive" />}
              <div className="font-semibold">{result.ok ? "ผ่าน" : "ไม่ผ่าน"}</div>
              {result.verdict && <Badge variant={result.ok ? "default" : "destructive"} className="text-[10px]">{result.verdict}</Badge>}
              {typeof result.total_ms === "number" && <Badge variant="outline" className="text-[10px]">{result.total_ms} ms</Badge>}
            </div>
            <p className="text-sm text-muted-foreground mt-2">{result.reason_th || result.error}</p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 shadow-card">
            <div className="font-semibold mb-2">รายละเอียดการทดสอบ</div>
            <Row label="ร้าน / แชนแนล" value={result.store ? `${result.store.label || result.store.id}` : "-"} />
            <Row label="ข้อความตัวอย่าง" value={result.sample?.text || "-"} />
            <Row
              label="ตอบกลับจาก webhook"
              value={result.http ? `HTTP ${result.http.status} (${result.http.latency_ms} ms)` : "-"}
              ok={result.http ? result.http.status === 200 : undefined}
            />
            <Row
              label="บันทึกในฐานข้อมูล"
              value={result.message ? `film_messages · ${result.message.id}` : "ไม่พบข้อความ"}
              ok={!!result.message}
            />
            <Row
              label="ปรากฏใน Inbox"
              value={result.conversation ? `${result.conversation.display_name || "ลูกค้า LINE"} · ยังไม่อ่าน ${result.conversation.unread_count ?? 0}` : "ไม่พบห้องสนทนา"}
              ok={!!result.conversation}
            />
            <Row
              label="signature"
              value={result.latest_webhook_event ? (result.latest_webhook_event.signature_ok ? "ตรวจผ่าน" : "ไม่ผ่าน") : "-"}
              ok={result.latest_webhook_event ? result.latest_webhook_event.signature_ok : undefined}
            />
          </div>

          {result.ok && (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="rounded-xl">
                <Link to="/film-shop/app?p=inbox">
                  <ExternalLink className="w-4 h-4 mr-1" /> เปิดกล่องข้อความแอดมิน
                </Link>
              </Button>
              <Button asChild variant="ghost" className="rounded-xl">
                <Link to="/admin/line-webhook-events">ดูเหตุการณ์ Webhook</Link>
              </Button>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
