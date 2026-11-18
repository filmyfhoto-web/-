import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { useLineStores, storeLabel } from "@/hooks/useLineStores";
import { History, RefreshCw, Loader2, ArrowLeft, CheckCircle2, XCircle, RotateCw } from "lucide-react";
import { botLabel, deliveryReason, isNattaqBot, retryLineDelivery } from "@/lib/lineDeliveryStatus";

type LogRow = {
  id: string;
  created_at: string;
  channel_type: string;
  store_id: string;
  room_name: string;
  kind: string;
  status: string;
  error_code: string | null;
  attempts: number;
  title: string | null;
  sender_store_id: string | null;
  notification_id: string | null;
  channel_id: string | null;
  order_id: string | null;
};

const TYPES: { key: string | null; label: string }[] = [
  { key: null, label: "ทั้งหมด" },
  { key: "admin_group", label: "ออเดอร์" },
  { key: "queue_group", label: "คิวงาน NATTA.Q" },
  { key: "doc_group", label: "ออกเอกสาร" },
];

const TYPE_LABEL: Record<string, string> = {
  admin_group: "ออเดอร์",
  queue_group: "คิวงาน",
  doc_group: "ออกเอกสาร",
};

export default function AdminLineDeliveryLog() {
  const { stores } = useLineStores();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [type, setType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("admin_line_delivery_log", {
      p_limit: 200,
      p_type: type,
    });
    if (error) toast.error("โหลดประวัติไม่สำเร็จ", { description: error.message });
    setRows(((data as LogRow[]) ?? []));
    setLoading(false);
  }, [type]);

  useEffect(() => { void load(); }, [load]);

  const retry = async (r: LogRow) => {
    setRetrying(r.id);
    const res = await retryLineDelivery({
      notificationId: r.notification_id,
      channelId: r.channel_id,
      channelType: r.channel_type,
      storeId: r.store_id,
    });
    setRetrying(null);
    if (res.ok) toast.success(`ส่งซ้ำเข้าห้อง “${r.room_name}” สำเร็จ`);
    else toast.error("ส่งซ้ำไม่สำเร็จ", { description: res.error || deliveryReason("failed", res.errorCode) });
    void load();
  };

  useEffect(() => {
    const ch = supabase
      .channel("admin-line-delivery-log")
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "line_delivery_logs" }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load]);

  const ok = rows.filter((r) => r.status === "sent").length;
  const failed = rows.filter((r) => r.status !== "sent").length;

  return (
    <AdminLayout>
      <SeoHead
        path="/admin/line-delivery-log"
        title="ประวัติการส่งแจ้งเตือน LINE | ผลทดสอบและการส่งจริง"
        description="ดูผลการส่งแจ้งเตือน LINE และผลทดสอบ แยกตามประเภทออเดอร์ คิวงาน และการออกเอกสาร"
      />
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <History className="w-5 h-5 text-primary" /> ประวัติการส่งแจ้งเตือน LINE
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              ผลการส่งจริงและผลทดสอบ แยกตามประเภท พร้อมเวลาและสาเหตุที่ส่งไม่สำเร็จ
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" className="rounded-xl">
              <Link to="/admin/line-groups"><ArrowLeft className="w-4 h-4 mr-1" /> ตั้งค่าห้อง</Link>
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span className="ml-1">รีเฟรช</span>
            </Button>
          </div>
        </header>

        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <Button
              key={t.label}
              size="sm"
              variant={type === t.key ? "default" : "outline"}
              className="rounded-full"
              onClick={() => setType(t.key)}
            >
              {t.label}
            </Button>
          ))}
          <div className="ml-auto flex items-center gap-2 text-xs">
            <Badge className="bg-emerald-600 text-[10px]">สำเร็จ {ok}</Badge>
            <Badge variant="secondary" className="text-[10px]">ไม่สำเร็จ {failed}</Badge>
          </div>
        </div>

        {rows.length === 0 && !loading && (
          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground text-center">
            ยังไม่มีประวัติการส่งของประเภทนี้
          </div>
        )}

        <div className="space-y-2" data-testid="line-delivery-log-list">
          {rows.map((r) => {
            const sent = r.status === "sent";
            return (
              <article key={r.id} className="rounded-xl border border-border bg-card p-3 flex items-start gap-3">
                {sent
                  ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
                  : <XCircle className="w-4 h-4 mt-0.5 text-destructive shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                    {TYPE_LABEL[r.channel_type] ?? r.channel_type}
                    <Badge variant="secondary" className="text-[10px]">
                      {r.kind === "test" ? "ทดสอบ" : "ส่งจริง"}
                    </Badge>
                    <span className="text-xs font-normal text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("th-TH")}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    ร้าน: {storeLabel(stores, r.store_id)} · ห้อง: {r.room_name}
                    {r.attempts > 1 ? ` · พยายาม ${r.attempts} ครั้ง` : ""}
                  </div>
                  <div className="mt-1">
                    <Badge variant={isNattaqBot(r.sender_store_id) ? "default" : "secondary"} className="text-[10px]">
                      ส่งด้วย {botLabel(r.sender_store_id, isNattaqBot(r.sender_store_id) ? undefined : storeLabel(stores, r.sender_store_id))}
                    </Badge>
                  </div>
                  {r.title && <div className="text-xs mt-1 truncate">{r.title}</div>}
                  <div className={`text-xs mt-1 ${sent ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>
                    {deliveryReason(r.status, r.error_code)}
                  </div>
                  <Button
                    variant="outline" size="sm"
                    className="mt-2 h-8 rounded-lg"
                    data-testid="line-delivery-retry"
                    disabled={retrying === r.id}
                    onClick={() => void retry(r)}
                  >
                    {retrying === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                    <span className="ml-1">ลองส่งใหม่</span>
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
}
