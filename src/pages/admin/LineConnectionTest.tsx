import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, Play, Send, Activity } from "lucide-react";
import { toast } from "sonner";

type Check = {
  name: string; label: string; ok: boolean;
  status: "ok" | "fail" | "skip" | "warn";
  detail?: string; hint?: string; latency_ms?: number;
};

function StatusIcon({ s }: { s: Check["status"] }) {
  if (s === "ok") return <CheckCircle2 className="w-5 h-5 text-success" />;
  if (s === "warn") return <AlertTriangle className="w-5 h-5 text-amber-500" />;
  return <XCircle className="w-5 h-5 text-destructive" />;
}

export default function AdminLineConnectionTest() {
  const [loading, setLoading] = useState<string | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [ranAt, setRanAt] = useState<string | null>(null);

  async function run(only: "all" | "token" | "webhook" | "push") {
    setLoading(only);
    try {
      const { data, error } = await supabase.functions.invoke("line-connection-test", { body: { only } });
      if (error) throw error;
      if (only === "push") {
        // merge push result without wiping other checks
        setChecks((prev) => {
          const withoutPush = prev.filter((c) => c.name !== "push");
          return [...withoutPush, ...((data?.checks || []) as Check[])];
        });
      } else {
        setChecks((data?.checks || []) as Check[]);
      }
      setRanAt(new Date().toLocaleString("th-TH"));
      if (data?.ok) toast.success("ตรวจเสร็จ — ผ่านทุกจุด");
      else toast.warning("ตรวจเสร็จ — พบข้อควรแก้ไข");
    } catch (e: any) {
      toast.error(e?.message || "เรียกฟังก์ชันไม่สำเร็จ");
    } finally {
      setLoading(null);
    }
  }

  return (
    <AdminLayout>
      <SeoHead title="ทดสอบการเชื่อมต่อ LINE" description="ตรวจ token, webhook และสถานะตอบกลับของ LINE Messaging API" path="/admin/line-connection-test" />
      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Activity className="w-6 h-6 text-primary" /> ทดสอบการเชื่อมต่อ LINE</h1>
          <p className="text-sm text-muted-foreground mt-1">ตรวจ access token, webhook endpoint, และการส่งข้อความจริงกับ LINE Messaging API</p>
          {ranAt && <p className="text-xs text-muted-foreground mt-1">ตรวจล่าสุด: {ranAt}</p>}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => run("all")} disabled={loading !== null} className="rounded-xl">
            {loading === "all" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
            รันการทดสอบทั้งหมด
          </Button>
          <Button variant="outline" onClick={() => run("push")} disabled={loading !== null} className="rounded-xl">
            {loading === "push" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
            ส่งข้อความทดสอบหาแอดมิน
          </Button>
        </div>
      </div>

      {checks.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
          <p>กด "รันการทดสอบทั้งหมด" เพื่อเริ่ม</p>
          <p className="text-xs mt-2">ระบบจะเรียก LINE API 3 endpoint และรายงานผลพร้อมคำแนะนำ</p>
        </div>
      ) : (
        <div className="space-y-3">
          {checks.map((c) => (
            <div key={c.name} className="bg-card border border-border rounded-2xl p-4 shadow-card">
              <div className="flex items-start gap-3">
                <StatusIcon s={c.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold">{c.label}</div>
                    <Badge variant={c.ok ? "default" : "destructive"} className="text-[10px]">{c.status.toUpperCase()}</Badge>
                    {typeof c.latency_ms === "number" && <Badge variant="outline" className="text-[10px]">{c.latency_ms} ms</Badge>}
                    <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" disabled={loading !== null}
                      onClick={() => run(c.name.startsWith("webhook") ? "webhook" : c.name === "token" ? "token" : c.name === "push" ? "push" : "all")}>
                      ทดสอบซ้ำ
                    </Button>
                  </div>
                  {c.detail && <div className="text-sm text-muted-foreground mt-1 break-words">{c.detail}</div>}
                  {c.hint && (
                    <div className="mt-2 text-xs bg-amber-50 border border-amber-200 rounded-lg p-2 text-amber-800">
                      <b>คำแนะนำ:</b> {c.hint}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}