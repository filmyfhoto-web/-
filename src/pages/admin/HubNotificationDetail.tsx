import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import SeoHead from "@/components/SeoHead";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Bell, CheckCheck, ClipboardList, MessageCircle, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtDateTime } from "@/lib/format";
import {
  catalogFor, friendlyBody, friendlyTime, isRawErrorCode, relatedLinks, resolveActions,
  GROUP_STYLE, type HubGroup, type NotiLike,
} from "@/components/admin/hub/notificationCatalog";

const ICON: Record<HubGroup, typeof Bell> = {
  order: ShoppingCart, requisition: ClipboardList, line: MessageCircle, system: Bell,
};

type Row = NotiLike & { id: string; created_at: string };

/** หน้ารายละเอียดของการ์ดงาน 1 ใบ — ดูข้อมูลครบและไปต่อได้ในที่เดียว */
export default function HubNotificationDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("notifications")
        .select("id,type,title,body,link,ref_id,read,created_at")
        .eq("id", id)
        .maybeSingle();
      if (!alive) return;
      setRow((data as Row) ?? null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [id]);

  async function setRead(read: boolean) {
    if (!row) return;
    setRow({ ...row, read });
    const { error } = await (supabase as any).from("notifications").update({ read }).eq("id", row.id);
    if (error) {
      setRow({ ...row, read: !read });
      toast.error("อัปเดตสถานะไม่สำเร็จ");
      return;
    }
    toast.success(read ? "ทำเครื่องหมายว่าอ่านแล้ว" : "ทำเครื่องหมายว่ายังไม่อ่าน");
  }

  const cat = catalogFor(row?.type ?? null);
  const style = GROUP_STYLE[cat.group];
  const Icon = ICON[cat.group];

  return (
    <div className="min-h-screen bg-background" data-testid="hub-noti-detail-page">
      <SeoHead
        title="รายละเอียดงานที่ต้องทำ | NATTA GROUP"
        description="ดูรายละเอียดแจ้งเตือน พร้อมลิงก์ไปยังออเดอร์ ใบเขียนเบิก และ LINE OA ในที่เดียว"
        path={`/admin/customer-hub/n/${id}`}
      />
      <div className="max-w-3xl mx-auto px-3 sm:px-5 py-5 space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)} data-testid="hub-noti-detail-back">
            <ArrowLeft className="w-4 h-4 mr-1" /> ย้อนกลับ
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/work-docs">งานที่ต้องทำวันนี้</Link>
          </Button>
        </div>

        {loading && <div className="ng-card p-6"><div className="h-16 bg-muted animate-pulse" /></div>}

        {!loading && !row && (
          <div className="ng-card p-10 text-center text-sm text-muted-foreground">
            ไม่พบรายการแจ้งเตือนนี้ (อาจถูกลบไปแล้ว)
          </div>
        )}

        {!loading && row && (
          <>
            <section className="ng-card p-5 flex items-start gap-4">
              <span className={`w-12 h-12 shrink-0 grid place-items-center ${style.icon}`}>
                <Icon className="w-6 h-6" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`border px-2 py-0.5 text-[11px] font-semibold ${style.chip}`}>{cat.badge}</span>
                  <span className={`text-[11px] font-semibold ${row.read ? "text-muted-foreground" : "text-primary"}`}>
                    {row.read ? "ดำเนินการแล้ว" : "● ยังไม่อ่าน"}
                  </span>
                  <span className="text-xs text-muted-foreground">{friendlyTime(row.created_at)}</span>
                </div>
                <h1 className="text-2xl font-extrabold mt-1">{row.title || cat.label}</h1>
                <p className="text-base text-muted-foreground mt-1">{friendlyBody(row.body, cat.hint)}</p>
              </div>
            </section>

            <section className="ng-card p-5 space-y-2 text-sm">
              <h2 className="text-base font-bold mb-1">ข้อมูลที่เกี่ยวข้อง</h2>
              <p className="text-muted-foreground">ชนิดงาน: {cat.label} — {cat.hint}</p>
              <p className="text-muted-foreground">เวลาที่แจ้ง: {fmtDateTime(row.created_at)}</p>
              {row.ref_id && <p className="text-muted-foreground break-all">รหัสอ้างอิง: {row.ref_id}</p>}
              {row.link && <p className="text-muted-foreground break-all">ลิงก์ที่แนบมา: {row.link}</p>}
              {isRawErrorCode(row.body) && (
                <p className="text-xs text-muted-foreground break-all">รหัสทางเทคนิค: {row.body}</p>
              )}
              <p className="text-xs text-muted-foreground">รหัสชนิดในระบบ: {row.type ?? "-"}</p>
            </section>

            <section className="ng-card p-5 space-y-3">
              <h2 className="text-base font-bold">ทำงานต่อ</h2>
              <div className="flex flex-wrap gap-2">
                {resolveActions(row).map((a) => (
                  <Button
                    key={a.label}
                    asChild
                    size="sm"
                    variant={a.variant === "secondary" ? "outline" : "default"}
                    className={a.variant === "secondary" ? "" : "bg-primary hover:bg-primary text-white"}
                  >
                    <Link to={a.to} onClick={() => toast.success(`กำลังเปิด: ${a.label}`)}>{a.label}</Link>
                  </Button>
                ))}
                <Button variant="outline" size="sm" onClick={() => void setRead(!row.read)} data-testid="hub-noti-detail-toggle">
                  <CheckCheck className="w-4 h-4 mr-1" />
                  {row.read ? "ทำเครื่องหมายยังไม่อ่าน" : "ทำเครื่องหมายอ่านแล้ว"}
                </Button>
              </div>
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">ไปยังหน้าที่เกี่ยวข้อง</p>
                <div className="flex flex-wrap gap-2">
                  {relatedLinks(row).map((a) => (
                    <Button key={a.label} asChild size="sm" variant="outline">
                      <Link to={a.to}>{a.label}</Link>
                    </Button>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
