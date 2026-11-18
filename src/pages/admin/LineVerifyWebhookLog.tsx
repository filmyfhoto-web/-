import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Webhook, RefreshCw, Loader2, Eye, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

type EventRow = {
  id: string;
  received_at: string;
  event_type: string | null;
  source_user_id: string | null;
  message_text: string | null;
  signature_ok: boolean | null;
  handler_result: any;
  handler_error: string | null;
  raw: any;
};

function mask(u?: string | null) {
  if (!u) return "—";
  if (u.length <= 8) return u;
  return `${u.slice(0, 4)}…${u.slice(-4)}`;
}

function sanitizePayload(p: any): any {
  if (!p) return p;
  try {
    const clone = JSON.parse(JSON.stringify(p));
    const walk = (o: any) => {
      if (!o || typeof o !== "object") return;
      for (const k of Object.keys(o)) {
        if (/token|secret|signature|authorization/i.test(k) && typeof o[k] === "string") {
          o[k] = "***";
        } else if (typeof o[k] === "object") walk(o[k]);
      }
    };
    walk(clone);
    return clone;
  } catch { return p; }
}

export default function AdminLineVerifyWebhookLog() {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<EventRow | null>(null);
  const [filter, setFilter] = useState<"all" | "verify">("verify");

  async function load() {
    setLoading(true);
    try {
      let q = supabase
        .from("line_webhook_events")
        .select("id, received_at, event_type, source_user_id, message_text, signature_ok, handler_result, handler_error, raw")
        .order("received_at", { ascending: false })
        .limit(100);
      if (filter === "verify") {
        q = q.or("message_text.ilike.link %,event_type.eq.follow,event_type.eq.unfollow");
      }
      const { data, error } = await q;
      if (error) throw error;
      setRows((data as any) || []);
    } catch (e: any) { toast.error(e?.message || "โหลดไม่สำเร็จ"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  return (
    <AdminLayout>
      <SeoHead title="Webhook Log สำหรับ Verify LINE" description="ดู event ที่เกี่ยวกับการยืนยันตัวตน LINE" path="/admin/line-verify-webhook-log" />
      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Webhook className="w-6 h-6 text-primary" /> Log การรับ Webhook สำหรับ Verify LINE</h1>
          <p className="text-sm text-muted-foreground mt-1">event ล่าสุดจาก LINE — payload ถูก sanitize (ตัด token/signature) ก่อนแสดง</p>
        </div>
        <div className="flex gap-2">
          <Button variant={filter === "verify" ? "default" : "outline"} size="sm" onClick={() => setFilter("verify")} className="rounded-xl">verify only</Button>
          <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")} className="rounded-xl">ทั้งหมด</Button>
          <Button variant="outline" onClick={load} disabled={loading} className="rounded-xl">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />} รีเฟรช
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-card">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">ยังไม่มี event</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-accent text-xs">
                <tr>
                  <th className="text-left p-3">เวลา</th>
                  <th className="text-left p-3">event</th>
                  <th className="text-left p-3">LINE userId</th>
                  <th className="text-left p-3">ข้อความ</th>
                  <th className="text-center p-3">signature</th>
                  <th className="text-center p-3">handler</th>
                  <th className="text-center p-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-3 text-xs whitespace-nowrap">{new Date(r.received_at).toLocaleString("th-TH")}</td>
                    <td className="p-3"><Badge variant="outline" className="text-[10px]">{r.event_type || "—"}</Badge></td>
                    <td className="p-3 font-mono text-xs">{mask(r.source_user_id)}</td>
                    <td className="p-3 text-xs max-w-[240px] truncate">{r.message_text || "—"}</td>
                    <td className="p-3 text-center">
                      {r.signature_ok ? <CheckCircle2 className="w-4 h-4 text-success inline" /> : <XCircle className="w-4 h-4 text-destructive inline" />}
                    </td>
                    <td className="p-3 text-center">
                      {r.handler_error
                        ? <Badge variant="destructive" className="text-[10px]">error</Badge>
                        : <Badge className="text-[10px]">ok</Badge>}
                    </td>
                    <td className="p-3 text-center">
                      <Button size="sm" variant="ghost" onClick={() => setSelected(r)} className="rounded-lg">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>Raw payload (sanitized)</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div><b>รับเมื่อ:</b> {new Date(selected.received_at).toLocaleString("th-TH")}</div>
                <div><b>event:</b> {selected.event_type || "—"}</div>
                <div><b>userId:</b> <span className="font-mono">{selected.source_user_id || "—"}</span></div>
                <div><b>signature ok:</b> {String(selected.signature_ok)}</div>
              </div>
              {selected.handler_error && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-2 text-destructive">
                  handler_error: {selected.handler_error}
                </div>
              )}
              <div>
                <div className="font-semibold mb-1">handler_result</div>
                <pre className="bg-muted p-2 rounded-lg overflow-auto text-[11px]">{JSON.stringify(selected.handler_result, null, 2)}</pre>
              </div>
              <div>
                <div className="font-semibold mb-1">raw</div>
                <pre className="bg-muted p-2 rounded-lg overflow-auto text-[11px]">{JSON.stringify(sanitizePayload(selected.raw), null, 2)}</pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}