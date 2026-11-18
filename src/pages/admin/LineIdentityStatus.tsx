import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, IdCard, RefreshCw, ExternalLink, Send } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

type Check = { name: string; label: string; ok: boolean; status: "ok" | "fail" | "warn" | "skip"; detail?: string; hint?: string };

export default function AdminLineIdentityStatus() {
  const [loading, setLoading] = useState(false);
  const [checks, setChecks] = useState<Check[]>([]);
  const [pushing, setPushing] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("line-connection-test", { body: { only: "identity" } });
      if (error) throw error;
      setChecks((data?.checks || []) as Check[]);
    } catch (e: any) { toast.error(e?.message || "ตรวจไม่สำเร็จ"); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);

  async function testPush() {
    setPushing(true);
    try {
      const { data, error } = await supabase.functions.invoke("line-connection-test", { body: { only: "push" } });
      if (error) throw error;
      const push = (data?.checks || []).find((c: Check) => c.name === "push");
      if (push?.ok) toast.success("ส่งข้อความหาแอดมินสำเร็จ — เช็คแอป LINE");
      else toast.error(push?.detail || "ส่งไม่สำเร็จ");
    } catch (e: any) { toast.error(e?.message || "ทดสอบไม่สำเร็จ"); }
    finally { setPushing(false); }
  }

  return (
    <AdminLayout>
      <SeoHead title="สถานะข้อมูลระบุตัวตน LINE" description="ตรวจ LINE_LOGIN_CHANNEL_ID และ LINE_ADMIN_USER_ID" path="/admin/line-identity-status" />
      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><IdCard className="w-6 h-6 text-primary" /> สถานะข้อมูลระบุตัวตน LINE</h1>
          <p className="text-sm text-muted-foreground mt-1">ตรวจว่า Channel ID สำหรับ LINE Login และ userId ของแอดมินพร้อมใช้งานหรือยัง</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refresh} disabled={loading} className="rounded-xl">
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />} ตรวจซ้ำ
          </Button>
          <Button onClick={testPush} disabled={pushing} className="rounded-xl">
            {pushing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />} ทดสอบส่งหาแอดมิน
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {checks.map((c) => {
          const Icon = c.ok ? CheckCircle2 : c.status === "warn" ? AlertTriangle : XCircle;
          const color = c.ok ? "text-success" : c.status === "warn" ? "text-amber-500" : "text-destructive";
          return (
            <div key={c.name} className="bg-card border border-border rounded-2xl p-5 shadow-card">
              <div className="flex items-start gap-3">
                <Icon className={`w-6 h-6 ${color} flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold font-mono text-sm">{c.label}</div>
                    <Badge variant={c.ok ? "default" : "destructive"} className="text-[10px]">{c.ok ? "พร้อมใช้งาน" : c.status === "warn" ? "ตรวจสอบ" : "ยังไม่พร้อม"}</Badge>
                  </div>
                  {c.detail && <div className="text-sm text-muted-foreground mt-2 break-all">{c.detail}</div>}
                  {c.hint && (
                    <div className="mt-2 text-xs bg-amber-50 border border-amber-200 rounded-lg p-2 text-amber-800">
                      <b>คำแนะนำ:</b> {c.hint}
                    </div>
                  )}
                  {c.name === "login_channel_id" && (
                    <div className="mt-3 text-xs">
                      <a href="https://developers.line.biz/console/" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
                        เปิด LINE Developers Console <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                  {c.name === "admin_user_id" && (
                    <div className="mt-3 text-xs">
                      <Link to="/admin/line-webhook-events" className="text-primary underline">ดู userId จาก webhook events →</Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AdminLayout>
  );
}