import { useState } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConsentStatus } from "@/lib/consent";
import ConsentGate from "@/components/consent/ConsentGate";
import { useAuth } from "@/contexts/AuthContext";

/**
 * แถบเตือนระดับ global — แสดงเมื่อผู้ใช้ login แล้วแต่ consent หมดอายุ
 * เปลี่ยน CURRENT_*_VERSION → banner กลับมาทันที (auto re-consent)
 */
export default function ConsentReminderBanner() {
  const { user, refresh } = useAuth();
  const { ok } = useConsentStatus();
  const [open, setOpen] = useState(false);

  if (!user || ok) return null;

  return (
    <div
      data-testid="consent-reminder-banner"
      className="bg-warning/15 border-b border-warning/30 text-foreground"
    >
      <div className="container mx-auto px-4 py-2 flex flex-wrap items-center gap-3 text-sm">
        <ShieldAlert className="w-4 h-4 text-warning shrink-0" />
        <span className="flex-1 min-w-[200px]">
          นโยบายความเป็นส่วนตัว / เงื่อนไขการใช้งานมีเวอร์ชันใหม่ — โปรดยอมรับก่อนทำรายการ
        </span>
        <Link to="/privacy-policy" target="_blank" rel="noopener" className="text-xs underline">
          อ่านนโยบาย
        </Link>
        <Link to="/terms-of-use" target="_blank" rel="noopener" className="text-xs underline">
          อ่านเงื่อนไข
        </Link>
        <Button
          size="sm"
          className="rounded-lg h-8"
          data-testid="consent-reminder-open"
          onClick={() => setOpen(true)}
        >
          ยอมรับเวอร์ชันล่าสุด
        </Button>
      </div>
      <ConsentGate
        open={open}
        onOpenChange={setOpen}
        userId={user.id}
        onAccepted={async () => {
          await refresh();
        }}
      />
    </div>
  );
}