import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { recordConsent } from "@/lib/consent";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null | undefined;
  onAccepted: () => void;
  title?: string;
  description?: string;
};

export default function ConsentGate({
  open,
  onOpenChange,
  userId,
  onAccepted,
  title = "ก่อนดำเนินการต่อ กรุณายอมรับนโยบาย",
  description = "เราอัปเดตนโยบายความเป็นส่วนตัวและเงื่อนไขการใช้งานเล็กน้อย กรุณาอ่านและยืนยันเพื่อสั่งซื้อหรือส่งรายการต่อ",
}: Props) {
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);

  async function accept() {
    if (!userId) {
      toast.error("กรุณาเข้าสู่ระบบก่อน");
      return;
    }
    setSaving(true);
    try {
      await recordConsent(userId, ["terms", "privacy"], "pre_order");
      toast.success("บันทึกการยอมรับนโยบายแล้ว");
      onOpenChange(false);
      onAccepted();
    } catch (e) {
      toast.error(friendlyError(e, "บันทึกการยอมรับไม่สำเร็จ กรุณาลองใหม่"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="text-sm space-y-3">
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>
              <Link to="/privacy-policy" target="_blank" rel="noopener" className="underline hover:text-primary">
                อ่านนโยบายความเป็นส่วนตัว
              </Link>
            </li>
            <li>
              <Link to="/terms-of-use" target="_blank" rel="noopener" className="underline hover:text-primary">
                อ่านเงื่อนไขการใช้งาน
              </Link>
            </li>
          </ul>
          <div className="flex items-start gap-2 pt-1">
            <Checkbox
              id="consent-gate-check"
              checked={checked}
              onCheckedChange={(v) => setChecked(v === true)}
            />
            <Label htmlFor="consent-gate-check" className="text-sm leading-snug">
              ฉันได้อ่านและยอมรับ นโยบายความเป็นส่วนตัว และ เงื่อนไขการใช้งาน
            </Label>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogAction
            disabled={!checked || saving}
            onClick={(e) => {
              e.preventDefault();
              accept();
            }}
          >
            {saving ? "กำลังบันทึก..." : "ยอมรับและดำเนินการต่อ"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}