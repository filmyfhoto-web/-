/**
 * Modal shown after a successful `window.print()` from the print preview.
 * Matches the "พิมพ์เอกสารเรียบร้อยแล้ว" confirmation UI (reference image 3).
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onReprint: () => void;
  onBackToList: () => void;
}

export function PrintCompleteDialog({ open, onOpenChange, onReprint, onBackToList }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm text-center" data-testid="print-complete-dialog">
        <DialogHeader className="items-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-full bg-success/15 grid place-items-center">
            <CheckCircle2 className="w-10 h-10 text-success" aria-hidden />
          </div>
          <DialogTitle className="text-lg">พิมพ์เอกสารเรียบร้อยแล้ว</DialogTitle>
          <DialogDescription>
            หากพิมพ์ไม่ครบ สามารถกด "พิมพ์อีกครั้ง" ได้
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={onReprint} data-testid="pc-reprint">พิมพ์อีกครั้ง</Button>
          <Button variant="outline" onClick={onBackToList} data-testid="pc-back-list">
            กลับไปที่รายการเอกสาร
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="pc-close">
            ปิดหน้าต่าง
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}