import { Compass, Share, PlusSquare, Check, Bell, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";

const STEPS = [
  { icon: Compass, title: "เปิดด้วย Safari", detail: "ถ้าเปิดจาก LINE ให้กด ⋯ แล้วเลือก “เปิดในเบราว์เซอร์”" },
  { icon: Share, title: "แตะปุ่มแชร์", detail: "ไอคอนสี่เหลี่ยมมีลูกศรขึ้น ที่แถบล่างของ Safari" },
  { icon: PlusSquare, title: "เลือก “เพิ่มไปยังหน้าจอโฮม”", detail: "เลื่อนรายการลงมาจนเจอเมนูนี้" },
  { icon: Check, title: "แตะ “เพิ่ม”", detail: "จะได้ไอคอนแอปแอดมินบนหน้าจอโฮมทันที" },
];

/** ขั้นตอนติดตั้งบน iPhone แบบสั้น มีไอคอนประกอบ + ปุ่มไปหน้าตั้งค่า */
export default function IosInstallSteps() {
  return (
    <Card data-testid="ios-install-steps">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">ติดตั้งบน iPhone — 4 ขั้นตอน</CardTitle>
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
