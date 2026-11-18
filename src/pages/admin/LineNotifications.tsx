import AdminLayout from "@/components/layout/AdminLayout";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageCircle, RefreshCw, RotateCcw, ChevronDown, ChevronRight } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { useRealtimeRefresh } from "@/hooks/useRealtimeTable";
import { toast } from "sonner";

type Row = {
  id: string;
  created_at: string;
  last_attempt_at: string | null;
  sent_at: string | null;
  kind: string | null;
  type: string | null;
  direction: string | null;
  recipient: string | null;
  message: string | null;
  sent_status: "pending" | "sent" | "failed" | "skipped";
  error_message: string | null;
  retry_count: number | null;
  order_id: string | null;
  document_id: string | null;
  idempotency_key: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
  pending: "bg-amber-100 text-amber-700",
  skipped: "bg-slate-100 text-slate-700",
};

export default function AdminLineNotifications() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [retrying, setRetrying] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("line_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []) as Row[]);
  }
  useEffect(() => { load(); }, []);
  useRealtimeRefresh(["line_notifications"], () => load());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (statusFilter !== "all" && r.sent_status !== statusFilter) return false;
      if (kindFilter !== "all" && (r.kind || r.type) !== kindFilter) return false;
      if (q) {
        const blob = [r.message, r.recipient, r.idempotency_key, r.order_id, r.document_id, r.error_message].join(" ").toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, kindFilter, search]);

  const kinds = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { const k = r.kind || r.type; if (k) s.add(k); });
    return Array.from(s).sort();
  }, [rows]);

  const stats = useMemo(() => {
    const acc = { sent: 0, failed: 0, pending: 0, skipped: 0 };
    rows.forEach(r => { (acc as any)[r.sent_status] = ((acc as any)[r.sent_status] || 0) + 1; });
    return acc;
  }, [rows]);

  async function retry(ids: string[]) {
    if (!ids.length) return;
    setRetrying(ids.join(","));
    try {
      const { data, error } = await supabase.functions.invoke("line-notify-retry", { body: { ids } });
      if (error) throw error;
      const okCount = (data?.results ?? []).filter((r: any) => r.ok).length;
      toast.success(`ส่งซ้ำสำเร็จ ${okCount}/${ids.length} รายการ`);
      load();
    } catch (e: any) {
      toast.error(e?.message || "ส่งซ้ำไม่สำเร็จ");
    } finally {
      setRetrying(null);
    }
  }

  const failedIds = filtered.filter(r => r.sent_status === "failed").map(r => r.id);

  return (
    <AdminLayout>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageCircle className="w-6 h-6 text-primary" /> สถานะการส่ง LINE
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-xl" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> รีเฟรช
          </Button>
          <Button className="rounded-xl" onClick={() => retry(failedIds)} disabled={!failedIds.length || retrying !== null}>
            <RotateCcw className="w-4 h-4 mr-2" /> ลองส่งใหม่ที่ล้มเหลว ({failedIds.length})
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {(["sent", "failed", "pending", "skipped"] as const).map(s => (
          <div key={s} className="bg-card rounded-2xl border border-border p-3 shadow-card">
            <div className="text-xs text-muted-foreground capitalize">{s}</div>
            <div className="text-2xl font-bold">{(stats as any)[s] || 0}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <Input placeholder="ค้นหาข้อความ / order / document …" value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs rounded-xl" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 rounded-xl"><SelectValue placeholder="สถานะ" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกสถานะ</SelectItem>
            <SelectItem value="sent">sent</SelectItem>
            <SelectItem value="failed">failed</SelectItem>
            <SelectItem value="pending">pending</SelectItem>
            <SelectItem value="skipped">skipped</SelectItem>
          </SelectContent>
        </Select>
        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="w-48 rounded-xl"><SelectValue placeholder="ประเภท" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกประเภท</SelectItem>
            {kinds.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-3 py-2 w-8"></th>
                <th className="px-3 py-2">เวลา</th>
                <th className="px-3 py-2">ประเภท</th>
                <th className="px-3 py-2">ทิศทาง</th>
                <th className="px-3 py-2">สถานะ</th>
                <th className="px-3 py-2">retry</th>
                <th className="px-3 py-2">ข้อความ / ข้อผิดพลาด</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const open = !!expanded[r.id];
                return (
                  <>
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="px-3 py-2">
                        <button onClick={() => setExpanded(e => ({ ...e, [r.id]: !open }))}>
                          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">{fmtDateTime(r.created_at)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.kind || r.type || "-"}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">{r.direction || "-"}</td>
                      <td className="px-3 py-2">
                        <Badge className={`${STATUS_STYLE[r.sent_status] || ""}`} variant="secondary">
                          {r.sent_status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-center">{r.retry_count || 0}</td>
                      <td className="px-3 py-2 max-w-md">
                        <div className="truncate text-muted-foreground">{r.error_message || (r.message || "").split("\n")[0]}</div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {(r.sent_status === "failed" || r.sent_status === "pending") && (
                          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => retry([r.id])} disabled={retrying !== null}>
                            <RotateCcw className="w-3.5 h-3.5 mr-1" /> ส่งใหม่
                          </Button>
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-muted/20 border-t border-border">
                        <td></td>
                        <td colSpan={7} className="px-3 py-3">
                          <div className="grid sm:grid-cols-2 gap-3 text-xs">
                            <div>
                              <div className="font-semibold mb-1">ข้อความเต็ม</div>
                              <pre className="whitespace-pre-wrap bg-background p-2 rounded-lg border border-border max-h-64 overflow-auto">{r.message || "-"}</pre>
                            </div>
                            <div className="space-y-1">
                              <div><span className="text-muted-foreground">ผู้รับ:</span> <code className="text-xs">{r.recipient || "-"}</code></div>
                              <div><span className="text-muted-foreground">idempotency_key:</span> <code className="text-xs break-all">{r.idempotency_key || "-"}</code></div>
                              {r.order_id && <div><span className="text-muted-foreground">order_id:</span> <code>{r.order_id}</code></div>}
                              {r.document_id && <div><span className="text-muted-foreground">document_id:</span> <code>{r.document_id}</code></div>}
                              {r.sent_at && <div><span className="text-muted-foreground">sent_at:</span> {fmtDateTime(r.sent_at)}</div>}
                              {r.last_attempt_at && <div><span className="text-muted-foreground">last_attempt:</span> {fmtDateTime(r.last_attempt_at)}</div>}
                              {r.error_message && (
                                <div className="text-rose-600">
                                  <div className="font-semibold">error</div>
                                  <div className="whitespace-pre-wrap">{r.error_message}</div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {!filtered.length && (
                <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">ไม่มีรายการ</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}