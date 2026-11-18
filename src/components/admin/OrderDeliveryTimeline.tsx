import { useCallback, useEffect, useMemo, useState } from "react";
import { liveChannel } from "@/lib/realtimeChannel";
import { Loader2, RefreshCw, Send, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { fmtDateTime } from "@/lib/format";
import { toast } from "sonner";

export interface OutboxRow {
  id: string;
  event_type: string;
  status: string;
  recipient: string | null;
  attempts: number;
  last_error: string | null;
  deduplicated: boolean;
  created_at: string;
  sent_at: string | null;
  next_retry_at: string | null;
  payload: any;
}

const EVENT_LABEL: Record<string, string> = {
  new_order: "แจ้งออเดอร์ใหม่",
  status_update: "อัปเดตสถานะ",
  manual_resend: "ส่งซ้ำโดยแอดมิน",
  quote_ready: "แจ้งใบเสนอราคา",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "รอส่ง",
  processing: "กำลังส่ง",
  sent: "ส่งแล้ว",
  failed: "ส่งไม่สำเร็จ (จะลองใหม่)",
  dead: "ส่งไม่สำเร็จถาวร",
  skipped: "ข้าม",
};

/** Colour by outcome, not by raw status string. */
export function statusTone(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "sent") return "default";
  if (status === "dead") return "destructive";
  if (status === "failed") return "destructive";
  return "secondary";
}

/**
 * Delivery status for one order, straight from the server-side outbox.
 *
 * This is the single admin-facing answer to "did the customer actually get
 * the LINE message?" — it shows the queue state, attempt count, and the
 * provider error, instead of the old per-browser guesswork.
 */
export default function OrderDeliveryTimeline({ orderId }: { orderId: string }) {
  const [rows, setRows] = useState<OutboxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("notification_outbox")
      .select("id,event_type,status,recipient,attempts,last_error,deduplicated,created_at,sent_at,next_retry_at,payload")
      .eq("ref_id", orderId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) toast.error(error.message);
    setRows((data ?? []) as OutboxRow[]);
    setLoading(false);
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  // Live updates while an admin watches a message move through the queue.
  useEffect(() => {
    const ch = liveChannel(`outbox:${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notification_outbox", filter: `ref_id=eq.${orderId}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [orderId, load]);

  const pending = useMemo(
    () => rows.filter((r) => r.status === "pending" || r.status === "processing").length,
    [rows],
  );

  async function resend(row: OutboxRow) {
    setBusyId(row.id);
    try {
      const { data, error } = await supabase.functions.invoke("notify-dispatch", {
        body: {
          action: "enqueue",
          ref_type: "order",
          ref_id: orderId,
          recipient: row.recipient,
          text: String(row.payload?.text || ""),
          // Makes a double-click collapse into the same queued message.
          client_request_id: `resend:${row.id}:${Math.floor(Date.now() / 10000)}`,
        },
      });
      if (error) throw error;
      toast.success((data as any)?.id ? "เข้าคิวส่งซ้ำแล้ว" : "เข้าคิวแล้ว");
      await load();
    } catch (e: any) {
      const msg = String(e?.message || e);
      toast.error(msg.includes("429") ? "ส่งซ้ำถี่เกินไป กรุณารอสักครู่" : msg);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-2" data-testid="order-delivery-timeline">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium flex items-center gap-1.5">
          <Radio className="w-4 h-4" /> สถานะการส่งแจ้งเตือน
          {pending > 0 && <Badge variant="secondary" className="ml-1">ในคิว {pending}</Badge>}
        </div>
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลด...
        </div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">ยังไม่มีการแจ้งเตือนสำหรับออเดอร์นี้</div>
      ) : (
        <ol className="relative border-l pl-4 space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="text-sm" data-testid="delivery-row">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{EVENT_LABEL[r.event_type] || r.event_type}</span>
                <Badge variant={statusTone(r.status)}>{STATUS_LABEL[r.status] || r.status}</Badge>
                {r.attempts > 1 && (
                  <span className="text-xs text-muted-foreground">พยายาม {r.attempts} ครั้ง</span>
                )}
                {r.deduplicated && (
                  <span className="text-xs text-muted-foreground">(ปลายทางได้รับแล้ว — กันส่งซ้ำ)</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                สร้าง {fmtDateTime(r.created_at)}
                {r.sent_at ? ` · ส่ง ${fmtDateTime(r.sent_at)}` : ""}
              </div>
              {r.last_error && (
                <div className="text-xs text-destructive mt-0.5 break-all">{r.last_error}</div>
              )}
              {(r.status === "dead" || r.status === "sent") && r.recipient && (
                <Button
                  size="sm" variant="outline" className="mt-1.5 h-7 rounded-lg"
                  disabled={busyId === r.id}
                  onClick={() => void resend(r)}
                >
                  {busyId === r.id
                    ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    : <Send className="w-3.5 h-3.5 mr-1" />}
                  ส่งซ้ำ
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
