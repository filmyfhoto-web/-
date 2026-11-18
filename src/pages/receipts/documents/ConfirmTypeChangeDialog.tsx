import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  fromNo: string | null;
  fromLabel: string;
  toLabel: string;
}

/**
 * Confirmation prompt shown before re-issuing a saved document as another
 * type. Explicitly tells the user the original number stays untouched and
 * a brand-new running number (with the correct prefix) will be allocated.
 */
export default function ConfirmTypeChangeDialog({
  open,
  onCancel,
  onConfirm,
  fromNo,
  fromLabel,
  toLabel,
}: Props) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent data-testid="confirm-type-change-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>ย้ายเอกสารไปเป็น "{toLabel}"?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                ระบบจะ <b>คัดลอกข้อมูลทั้งหมด</b> จากใบนี้
                {fromNo ? <> (<span className="font-mono">{fromNo}</span> · {fromLabel})</> : null}
                {" "}ไปสร้างเอกสารใหม่ประเภท <b>{toLabel}</b>
                {" "}และ <b>รันเลขใหม่</b> ตาม prefix ของประเภทนั้น (QT / DN / RC …)
              </p>
              <p className="text-muted-foreground">
                เลขเดิม{fromNo ? <> <span className="font-mono">{fromNo}</span></> : null} ยังคงอยู่และไม่ถูกแก้ไข ใบใหม่จะมีลิงก์ย้อนกลับมาที่ใบเดิมเสมอ
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="confirm-type-change-cancel">ยกเลิก</AlertDialogCancel>
          <AlertDialogAction
            data-testid="confirm-type-change-confirm"
            onClick={onConfirm}
          >
            ยืนยันสร้างใบใหม่
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}