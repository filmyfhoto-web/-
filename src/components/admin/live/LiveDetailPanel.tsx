import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { fmtDateTime, fmtTHB } from "@/lib/format";
import {
  Copy, ExternalLink, MessageCircle, Phone, ShoppingCart, Eye, User2, X,
} from "lucide-react";
import { toast } from "sonner";

type Props = {
  lineUserId?: string | null;
  phone?: string | null;
  name?: string | null;
  onReply: (ctx: { orderId?: string | null; lineUserId?: string | null; name?: string | null }) => void;
  onClose?: () => void;
};

type OrderRow = { id: string; order_no: string | null; total: number | null; status: string | null; created_at: string; guest_name: string | null; guest_phone: string | null; line_user_id: string | null };
type ViewRow = { id: string; last_at: string; product_name: string | null; product_code: string | null; path: string | null };
type ChatRow = { id: string; received_at: string; event_type: string; message_text: string | null };

export default function LiveDetailPanel({ lineUserId, phone, name, onReply, onClose }: Props) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [views, setViews] = useState<ViewRow[]>([]);
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!lineUserId && !phone) return;
    (async () => {
      setLoading(true);
      const [oRes, vRes, cRes] = await Promise.all([
        (async () => {
          let q = supabase.from("orders").select("id, order_no, total, status, created_at, guest_name, guest_phone, line_user_id")
            .is("deleted_at", null).order("created_at", { ascending: false }).limit(10);
          if (lineUserId) q = q.eq("line_user_id", lineUserId);
          else if (phone) q = q.eq("guest_phone", phone);
          return q;
        })(),
        (async () => {
          let q = supabase.from("product_view_logs").select("id, last_at, product_name, product_code, path")
            .order("last_at", { ascending: false }).limit(10);
          if (lineUserId) q = q.eq("line_user_id", lineUserId);
          else if (phone) q = q.eq("guest_phone", phone);
          return q;
        })(),
        lineUserId ? supabase.from("line_webhook_events")
          .select("id, received_at, event_type, message_text")
          .eq("source_user_id", lineUserId)
          .in("event_type", ["message","postback","follow"])
          .order("received_at", { ascending: false }).limit(10) : Promise.resolve({ data: [] } as any),
      ]);
      setOrders((oRes.data ?? []) as any);
      setViews((vRes.data ?? []) as any);
      setChats((cRes.data ?? []) as any);
      setLoading(false);
    })();
  }, [lineUserId, phone]);

  const lastOrder = orders[0];
  const displayName = name || lastOrder?.guest_name || "ผู้เยี่ยมชม";
  const displayPhone = phone || lastOrder?.guest_phone;

  async function copyUid() {
    if (!lineUserId) return;
    try { await navigator.clipboard.writeText(lineUserId); toast.success("คัดลอก LINE UID แล้ว"); } catch {}
  }

  return (
    <Card className="sticky top-4">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <User2 className="w-4 h-4" /> รายละเอียดลูกค้า
          </CardTitle>
          {onClose && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="rounded-lg border p-3 bg-accent/30 space-y-1">
          <div className="font-medium">{displayName}</div>
          {displayPhone && <div className="text-xs">📞 {displayPhone}</div>}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            {lineUserId ? (
              <>
                <Badge className="bg-[#06C755] text-white text-[10px]">ผูก LINE แล้ว</Badge>
                <code className="text-[10px] text-muted-foreground truncate max-w-[140px]">{lineUserId}</code>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={copyUid}>
                  <Copy className="w-3 h-3" />
                </Button>
              </>
            ) : (
              <Badge variant="outline" className="text-[10px]">ยังไม่ผูก LINE</Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" className="rounded-lg bg-[#06C755] hover:bg-[#05b84c] text-white h-8"
              disabled={!lineUserId && !lastOrder}
              onClick={() => onReply({
                orderId: lastOrder?.id,
                lineUserId,
                name: displayName,
              })}
            >
              <MessageCircle className="w-3.5 h-3.5 mr-1" /> ตอบกลับ LINE
            </Button>
            {displayPhone && (
              <Button asChild size="sm" variant="outline" className="rounded-lg h-8">
                <a href={`tel:${displayPhone.replace(/[^0-9+]/g,"")}`}>
                  <Phone className="w-3.5 h-3.5 mr-1" /> โทร
                </a>
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-xs text-muted-foreground py-4 text-center">กำลังโหลด...</div>
        ) : (
          <>
            <Section title="ออเดอร์ล่าสุด" icon={<ShoppingCart className="w-3.5 h-3.5" />} empty={orders.length===0 ? "ยังไม่มีออเดอร์" : undefined}>
              {orders.map((o) => (
                <div key={o.id} className="block rounded-md border p-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-mono">{o.order_no || o.id.slice(0,8)}</span>
                    <span className="text-muted-foreground">{fmtDateTime(o.created_at)}</span>
                  </div>
                  <div className="flex justify-between text-xs mt-0.5">
                    <Badge variant="outline" className="text-[10px]">{o.status ?? "-"}</Badge>
                    <span className="font-medium">{fmtTHB(Number(o.total || 0))}</span>
                  </div>
                </div>
              ))}
            </Section>

            <Section title="สินค้าที่ดูล่าสุด" icon={<Eye className="w-3.5 h-3.5" />} empty={views.length===0 ? "ยังไม่มี" : undefined}>
              {views.map((v) => (
                <div key={v.id} className="rounded-md border p-2">
                  <div className="text-xs truncate">{v.product_name || v.product_code || v.path}</div>
                  <div className="text-[10px] text-muted-foreground">{fmtDateTime(v.last_at)}</div>
                </div>
              ))}
            </Section>

            {lineUserId && (
              <Section title="ข้อความ LINE ล่าสุด" icon={<MessageCircle className="w-3.5 h-3.5" />} empty={chats.length===0 ? "ยังไม่มีการทัก" : undefined}>
                {chats.map((c) => (
                  <div key={c.id} className="rounded-md border p-2">
                    <div className="text-xs whitespace-pre-wrap line-clamp-3">
                      {c.event_type === "follow" ? "🎉 เพิ่มเพื่อน LINE" : (c.message_text || `(${c.event_type})`)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{fmtDateTime(c.received_at)}</div>
                  </div>
                ))}
              </Section>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Section({ title, icon, children, empty }: { title: string; icon: React.ReactNode; children: React.ReactNode; empty?: string }) {
  return (
    <div>
      <div className="text-xs font-semibold flex items-center gap-1 mb-1 text-muted-foreground">
        {icon} {title}
      </div>
      {empty ? (
        <div className="text-xs text-muted-foreground italic">{empty}</div>
      ) : (
        <div className="space-y-1">{children}</div>
      )}
    </div>
  );
}