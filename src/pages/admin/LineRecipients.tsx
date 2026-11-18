import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { Button } from "@/components/ui/button";
import { Users, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * GROUP-ONLY POLICY
 * คำสั่งซื้อใหม่ + ใบเขียนเบิก แจ้งเตือนเข้า "กลุ่ม LINE รับออเดอร์" กลุ่มเดียวเท่านั้น
 * ไม่ส่งเข้าแชทส่วนตัว (1:1) อีกต่อไป จึงไม่มีการจัดการรายชื่อผู้รับรายบุคคล/ปุ่มทดสอบส่งในหน้านี้
 */
export default function AdminLineRecipients() {
  return (
    <AdminLayout>
      <SeoHead
        title="ปลายทางแจ้งเตือน LINE"
        description="ระบบแจ้งเตือนออเดอร์และใบเขียนเบิกเข้ากลุ่ม LINE เท่านั้น"
        path="/admin/line-recipients"
      />
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <header className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold">ปลายทางแจ้งเตือน LINE</h1>
        </header>

        <section className="bg-card border border-border p-4 space-y-3 shadow-card">
          <h2 className="font-semibold text-sm">แจ้งเตือนเข้ากลุ่มเท่านั้น</h2>
          <p className="text-sm text-muted-foreground">
            คำสั่งซื้อใหม่ และใบเขียนเบิก ใช้ปลายทางเดียวกัน คือกลุ่ม LINE รับออเดอร์ที่เปิดใช้งานอยู่
            (กลุ่มล่าสุดเพียงกลุ่มเดียว เพื่อกันข้อความซ้ำ)
          </p>
          <p className="text-sm text-muted-foreground">
            ระบบเลิกส่งเข้าแชทส่วนตัวของแอดมินแล้ว ถ้าใครยังได้รับข้อความทดสอบ เช่น
            “ตรวจสอบโทเคนใหม่ / พร้อมรับแจ้งเตือนออเดอร์” จะไม่ได้รับอีกต่อไป
          </p>
        </section>

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/line-notify-status"><ExternalLink className="w-3.5 h-3.5 mr-1" /> สถานะแจ้งเตือนกลุ่ม</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/line-groups"><ExternalLink className="w-3.5 h-3.5 mr-1" /> จัดการกลุ่มแจ้งเตือน</Link>
          </Button>

          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/line-settings">กลับหน้าตั้งค่า LINE</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/line-notifications">ดู log การส่ง</Link>
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
