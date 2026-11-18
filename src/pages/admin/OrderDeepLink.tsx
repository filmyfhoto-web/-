import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { buildCpoDeepLink, buildWorkDocsOrderLink, buildWorkDocsRequisitionLink, isLikelyOrderId, parseOrderExport } from "@/lib/orderDeepLink";

const db = supabase as any;

/**
 * ตัวแก้ปลายทางของลิงก์ `/admin/orders/:id` ที่บอทส่งเข้ากลุ่ม LINE
 * — ใบสั่งซื้อลูกค้า → หน้าคำสั่งซื้อใหม่ พร้อมโฟกัสรายการนั้น
 * — ออเดอร์ทั่วไป → หน้า “งานและเอกสาร” พร้อมโฟกัสรายการนั้น
 * ไม่มีการทิ้ง id หรือ ?export อีกต่อไป
 */
export default function OrderDeepLink() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const nav = useNavigate();
  const exp = parseOrderExport(searchParams.toString());
  const [state, setState] = useState<"loading" | "notfound">("loading");

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!isLikelyOrderId(id)) { setState("notfound"); return; }
      const { data: cpo } = await db
        .from("customer_purchase_orders").select("id").eq("id", id).maybeSingle();
      if (!alive) return;
      if (cpo?.id) { nav(buildCpoDeepLink(id!, exp), { replace: true }); return; }
       const { data: order } = await db
         .from("orders").select("id").eq("id", id).maybeSingle();
       if (!alive) return;
       if (order?.id) { nav(buildWorkDocsOrderLink(id!), { replace: true }); return; }
       const { data: requisition } = await db
         .from("school_requisitions").select("id").eq("id", id).maybeSingle();
       if (!alive) return;
       if (requisition?.id) {
         nav(buildWorkDocsRequisitionLink(String(requisition.id)), { replace: true });
         return;
       }
       setState("notfound");
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, exp]);

  if (state === "notfound") {
    return (
      <AdminLayout title="ไม่พบออเดอร์">
        <Card className="mx-auto mt-8 max-w-lg">
          <CardContent className="space-y-3 p-6 text-center">
            <div className="text-base font-semibold">ไม่พบออเดอร์ที่ลิงก์นี้อ้างถึง</div>
            <p className="text-sm text-muted-foreground">
              อาจถูกลบไปแล้ว หรือลิงก์จากไลน์ไม่สมบูรณ์ ({id || "ไม่มีรหัส"})
            </p>
            <div className="flex justify-center gap-2 pt-1">
              <Button asChild size="sm">
                <Link to="/admin/customer-purchase-orders">ไปหน้าคำสั่งซื้อใหม่</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/home">หน้าหลักแอดมิน</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="กำลังเปิดออเดอร์">
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" /> กำลังเปิดออเดอร์จากลิงก์…
      </div>
    </AdminLayout>
  );
}
