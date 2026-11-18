import { MonitorDown, MousePointerClick, Check, Settings, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";

const STEPS = [
  { icon: MonitorDown, title: "เปิดด้วย Chrome หรือ Edge", detail: "ใช้ลิงก์ติดตั้งด้านบนบนคอมพิวเตอร์" },
  { icon: MousePointerClick, title: "กดไอคอนติดตั้ง (⊕)", detail: "อยู่ท้ายแถบที่อยู่เว็บ หรือเมนู ⋮ → “ติดตั้ง”" },
  { icon: Check, title: "ยืนยัน “ติดตั้ง”", detail: "แอปจะเปิดเป็นหน้าต่างแยก พร้อมไอคอนบนเดสก์ท็อป" },
];

/** ขั้นตอนติดตั้งบนคอมพิวเตอร์ (Chrome/Edge) แบบสั้น มีไอคอน + ปุ่มนำทาง */
export default function DesktopInstallSteps() {
  return (
    <Card data-testid="desktop-install-steps">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">ติดตั้งบนคอมพิวเตอร์ — 3 ขั้นตอน</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ol className="space-y-2">
          {STEPS.map(({ icon: Icon, title, detail }, i) => (
            <li key={title} className="flex items-start gap-3 rounded-xl border bg-card/50 p-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {i + 1}. {title}
                </p>
                <p className="text-xs text-muted-foreground">{detail}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" className="rounded-xl" asChild>
            <Link to="/admin/settings">
              <Settings className="mr-1 h-4 w-4" /> ไปหน้าตั้งค่า
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="rounded-xl" asChild>
            <Link to="/admin/line-settings">
              <Bell className="mr-1 h-4 w-4" /> ตั้งค่าการแจ้งเตือน
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
