import { useCallback, useEffect, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, BellRing, CheckCircle2, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * GROUP-ONLY POLICY — หน้าตรวจสอบ
 * แสดงว่ากลุ่ม LINE ใดเป็นปลายทางจริง ได้รับข้อความล่าสุดเมื่อไร
 * และผู้รับรายบุคคล (1:1) ถูกปิดครบแล้วหรือยัง
 */
type LastEvent = {
  event_type: string | null;
  status: string | null;
  created_at: string | null;
  sent_at: string | null;
  last_error: string | null;
  text: string | null;
};

type GroupRow = {
  id: string;
  destination_id: string;
  display_name: string | null;
  store_id: string | null;
  is_active: boolean;
  linked_at: string | null;
  is_primary: boolean;
  last_event: LastEvent | null;
  sent_7d: number;
  failed_7d: number;
};

type RecipientRow = {
  id: string;
  label: string | null;
  masked_user_id: string;
  enabled: boolean;
  notify_orders: boolean;
  updated_at: string | null;
};

type Status = {
  groups: GroupRow[];
  recipients: RecipientRow[];
  one_to_one_leak_30d: number;
  checked_at: string;
};

function fmt(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok",
    }).format(new Date(iso));
  } catch { return iso; }
}

function maskDest(id: string): string {
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}

export default function AdminLineGroupNotifyStatus() {
  const [data, setData] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: res, error: err } = await supabase.rpc("admin_line_group_notify_status" as any);
    if (err) setError(err.message);
    else { setError(null); setData(res as unknown as Status); }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeRecipients = (data?.recipients ?? []).filter((r) => r.enabled || r.notify_orders);
  const clean = activeRecipients.length === 0 && (data?.one_to_one_leak_30d ?? 0) === 0;

  return (
    <AdminLayout>
      <SeoHead
        title="สถานะแจ้งเตือนกลุ่ม LINE"
        description="ตรวจสอบกลุ่ม LINE ที่รับแจ้งเตือนออเดอร์และใบเขียนเบิก และสถานะผู้รับรายบุคคล"
        path="/admin/line-notify-status"
      />
      <div className="max-w-5xl mx-auto p-4 space-y-4">
        <header className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <BellRing className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold">สถานะแจ้งเตือนกลุ่ม LINE</h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> รีเฟรช
          </Button>
        </header>

        {error && (
          <div className="border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            อ่านข้อมูลไม่ได้: {error}
          </div>
        )}

        <section
          className={`border p-4 flex items-start gap-3 ${clean ? "border-primary/40 bg-primary/5" : "border-destructive/40 bg-destructive/10"}`}
          data-testid="group-only-summary"
        >
          {clean ? <ShieldCheck className="w-5 h-5 text-primary mt-0.5" /> : <AlertTriangle className="w-5 h-5 text-destructive mt-0.5" />}
          <div className="text-sm space-y-1">
            <p className="font-semibold">
              {clean ? "ปลอดภัย: แจ้งเตือนเข้ากลุ่มเท่านั้น" : "พบผู้รับรายบุคคลที่ยังเปิดอยู่"}
            </p>
            <p className="text-muted-foreground">
              คำสั่งซื้อใหม่ · ใบเขียนเบิก · ใบสั่งซื้อ ใช้ปลายทางกลุ่มเดียวกัน และฐานข้อมูลบล็อกการส่งเข้าแชทส่วนตัวไว้แล้ว
            </p>
            <p className="text-muted-foreground">
              ข้อความถึงแอดมินที่หลุดไปแชทส่วนตัวใน 30 วัน: <b>{data?.one_to_one_leak_30d ?? 0}</b> · ตรวจเมื่อ {fmt(data?.checked_at)}
            </p>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-sm">กลุ่มปลายทาง (order_group)</h2>
          <div className="space-y-2">
            {(data?.groups ?? []).map((g) => (
              <div key={g.id} className="bg-card border border-border p-3 shadow-card space-y-2" data-testid="group-card">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{g.display_name || "(ไม่มีชื่อ)"}</span>
                  {g.is_primary && <Badge>ใช้งานจริง</Badge>}
                  {!g.is_active && <Badge variant="secondary">ปิดอยู่</Badge>}
                  <span className="text-xs text-muted-foreground font-mono">{maskDest(g.destination_id)}</span>
                  <span className="text-xs text-muted-foreground">โทเคนร้าน: {g.store_id || "default"}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  ส่งสำเร็จ 7 วัน: <b>{g.sent_7d}</b> · ล้มเหลว/ข้าม: <b>{g.failed_7d}</b>
                </div>
                <div className="text-xs">
                  {g.last_event ? (
                    <div className="space-y-0.5">
                      <div>
                        ล่าสุด: <b>{g.last_event.event_type}</b> · สถานะ {g.last_event.status} · {fmt(g.last_event.sent_at || g.last_event.created_at)}
                      </div>
                      {g.last_event.last_error && <div className="text-destructive">ผิดพลาด: {g.last_event.last_error}</div>}
                      {g.last_event.text && (
                        <pre className="whitespace-pre-wrap bg-muted/50 p-2 text-[11px] leading-relaxed">{g.last_event.text}</pre>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">ยังไม่มีข้อความส่งเข้ากลุ่มนี้</span>
                  )}
                </div>
              </div>
            ))}
            {!loading && (data?.groups ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">ยังไม่ได้ตั้งค่ากลุ่มรับออเดอร์</p>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Users className="w-4 h-4" /> ผู้รับรายบุคคล (ปิดถาวร)
          </h2>
          <div className="bg-card border border-border shadow-card divide-y divide-border">
            {(data?.recipients ?? []).map((r) => (
              <div key={r.id} className="p-3 flex items-center justify-between gap-2 text-sm" data-testid="recipient-row">
                <div>
                  <div className="font-medium">{r.label || "(ไม่มีป้ายชื่อ)"}</div>
                  <div className="text-xs text-muted-foreground font-mono">{r.masked_user_id}</div>
                </div>
                {r.enabled || r.notify_orders ? (
                  <Badge variant="destructive">ยังเปิดอยู่</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> ปิดแล้ว
                  </span>
                )}
              </div>
            ))}
            {(data?.recipients ?? []).length === 0 && (
              <div className="p-3 text-sm text-muted-foreground">ไม่มีรายชื่อผู้รับรายบุคคล</div>
            )}
          </div>
        </section>

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/line-group-roles">บทบาทกลุ่ม LINE</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/line-groups">จัดการกลุ่มแจ้งเตือน</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/line-notifications">ดู log การส่ง</Link>
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
