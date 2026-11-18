import { useState } from "react";
import { Copy, ExternalLink, QrCode, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { copyToClipboard } from "@/lib/productLink";
import QrLinkDialog from "@/components/QrLinkDialog";
import { PUBLIC_ORIGIN } from "@/lib/hostMode";

export const STAFF_APP_PATH = "/launch?app=staff";

export function staffAppUrl(): string {
  return `${PUBLIC_ORIGIN}${STAFF_APP_PATH}`;
}

/** Owner card: shortcut to invite staff + the staff app link to send them. */
export default function StaffInviteLinkCard() {
  const [qrOpen, setQrOpen] = useState(false);
  const url = staffAppUrl();

  const copy = async () => {
    const ok = await copyToClipboard(url);
    ok ? toast.success("คัดลอกลิงก์แล้ว") : toast.error("คัดลอกไม่สำเร็จ");
  };

  return (
    <Card data-testid="staff-invite-link-card">
      <CardHeader>
        <CardTitle className="text-base">ลิงก์เพิ่มพนักงาน</CardTitle>
        <CardDescription>สร้างคำเชิญ (อีเมล / LINE / ลิงก์สมัครงาน) และส่งลิงก์เข้าใช้งานให้พนักงาน</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button size="sm" asChild data-testid="staff-invite-open">
          <Link to="/admin/staff"><UserPlus className="mr-1 h-4 w-4" />เปิดหน้าเชิญพนักงาน</Link>
        </Button>
        <div className="rounded-md bg-muted/50 p-2 font-mono text-[11px] break-all" data-testid="staff-app-url">{url}</div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={copy}><Copy className="mr-1 h-4 w-4" />คัดลอก</Button>
          <Button size="sm" variant="outline" onClick={() => setQrOpen(true)}><QrCode className="mr-1 h-4 w-4" />QR</Button>
          <Button size="sm" variant="outline" asChild>
            <a href={STAFF_APP_PATH} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-4 w-4" />เปิดดู</a>
          </Button>
        </div>
      </CardContent>
      <QrLinkDialog open={qrOpen} onOpenChange={setQrOpen} url={url} label="เข้าใช้งานสำหรับพนักงาน" hint="ให้พนักงานสแกนเพื่อเข้าระบบ" />
    </Card>
  );
}
