import AdminLayout from "@/components/layout/AdminLayout";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { RefreshCw, Send, ExternalLink, Search, CheckCircle, XCircle, Clock } from "lucide-react";
import { publicOrigin } from "@/lib/hostMode";

type Row = {
  id: string;
  contact_name: string;
  phone: string;
  school_name: string;
  matched_slug: string | null;
  matched_org_id: string | null;
  status: "queued" | "sent" | "failed" | string;
  error: string | null;
  notified_at: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
};

export default function AdminLinkRequests() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [params] = useSearchParams();
  const highlightId = params.get("id") || "";

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("link_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      setRows((data as any[]) ?? []);
    } catch (e: any) {
      toast.error(e?.message || "โหลดคำขอไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (!qq) return true;
      return [r.contact_name, r.phone, r.school_name, r.matched_slug || ""].some((s) =>
        String(s).toLowerCase().includes(qq)
      );
    });
  }, [rows, q, status]);

  async function retry(r: Row) {
    setBusy(r.id);
    try {
      const { data, error } = await supabase.functions.invoke("link-request-notify", { body: { request_id: r.id } });
      if (error) throw error;
      if (!(data as any)?.ok) throw new Error(JSON.stringify(data));
      toast.success("ส่งซ้ำเรียบร้อย");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "ส่งซ้ำไม่สำเร็จ");
      await load();
    } finally { setBusy(null); }
  }

  async function markSent(r: Row) {
    const { error } = await supabase.rpc("admin_link_request_update_status" as any, {
      p_id: r.id, p_status: "sent", p_error: null, p_note: "manual-mark",
    });
    if (error) return toast.error(error.message);
    toast.success("อัปเดตเป็นส่งแล้ว");
    load();
  }

  function statusBadge(s: string) {
    if (s === "sent") return <Badge className="bg-success text-white text-[10px] gap-1"><CheckCircle className="w-3 h-3" />ส่งแล้ว</Badge>;
    if (s === "failed") return <Badge variant="outline" className="border-destructive text-destructive text-[10px] gap-1"><XCircle className="w-3 h-3" />ล้มเหลว</Badge>;
    return <Badge variant="outline" className="border-warning text-warning text-[10px] gap-1"><Clock className="w-3 h-3" />รอส่ง</Badge>;
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold">คำขอลิงก์จากลูกค้า</h1>
        <Button variant="outline" className="rounded-xl" onClick={load}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> รีเฟรช
        </Button>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-card p-3 mb-4 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา ชื่อ / เบอร์ / โรงเรียน / slug" className="rounded-xl pl-9" />
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="rounded-xl w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทั้งหมด</SelectItem>
            <SelectItem value="queued">รอส่ง</SelectItem>
            <SelectItem value="sent">ส่งแล้ว</SelectItem>
            <SelectItem value="failed">ล้มเหลว</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-accent text-xs">
              <tr>
                <th className="text-left p-3">เวลา</th>
                <th className="text-left p-3">ชื่อผู้ติดต่อ</th>
                <th className="text-left p-3">เบอร์</th>
                <th className="text-left p-3">โรงเรียน/หน่วยงาน</th>
                <th className="text-left p-3">ลิงก์ที่จับคู่</th>
                <th className="text-left p-3">สถานะ</th>
                <th className="text-right p-3">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                  {loading ? "กำลังโหลด..." : "ยังไม่มีคำขอลิงก์"}
                </td></tr>
              )}
              {filtered.map((r) => {
                const isHi = r.id === highlightId;
                const url = r.matched_slug ? `${publicOrigin()}/s/${r.matched_slug}` : null;
                return (
                  <tr key={r.id} className={`border-t border-border ${isHi ? "bg-primary/5 ring-2 ring-primary" : ""}`}>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="p-3 font-medium">{r.contact_name}</td>
                    <td className="p-3 text-xs">{r.phone}</td>
                    <td className="p-3 text-xs">{r.school_name}</td>
                    <td className="p-3 text-xs">
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                          {r.matched_slug} <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : <span className="text-muted-foreground">— ไม่พบ —</span>}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col gap-1">
                        {statusBadge(r.status)}
                        {r.error && (
                          <span className="text-[10px] text-destructive line-clamp-2" title={r.error}>
                            {r.error}
                          </span>
                        )}
                        {r.notified_at && (
                          <span className="text-[10px] text-muted-foreground">
                            ส่งเมื่อ {new Date(r.notified_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="outline" className="rounded-xl" disabled={busy === r.id} onClick={() => retry(r)}>
                          <Send className={`w-3 h-3 mr-1 ${busy === r.id ? "animate-pulse" : ""}`} /> ส่งซ้ำ
                        </Button>
                        {r.status !== "sent" && (
                          <Button size="sm" variant="ghost" className="rounded-xl text-muted-foreground" onClick={() => markSent(r)}>
                            ทำเครื่องหมายส่งแล้ว
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}