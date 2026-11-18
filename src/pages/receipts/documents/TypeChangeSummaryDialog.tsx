import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowRight, Copy, ExternalLink, History } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getDocLabel } from "../lib/docTheme";

interface Props {
  open: boolean;
  onClose: () => void;
  storeSlug: string | undefined;
  fromNo: string | null;
  fromType: string | null;
  newNo: string | null;
  newId: string | null;
  newType: string | null;
  onOpenNew: () => void;
  onViewActivity?: () => void;
}

/**
 * Summary card shown after a saved document was duplicated into another
 * type. Surfaces the old + new numbers, prefix swap (e.g. QT → DN), and a
 * primary action to open the new document. The original row is untouched.
 */
export default function TypeChangeSummaryDialog({
  open,
  onClose,
  fromNo,
  fromType,
  newNo,
  newId,
  newType,
  onOpenNew,
  onViewActivity,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent data-testid="type-change-summary-dialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle>ย้ายประเภทเอกสารสำเร็จ</DialogTitle>
          <DialogDescription>
            ระบบสร้างเอกสารใหม่และรันเลขใหม่ให้แล้ว เลขเดิมยังคงอยู่ไม่ถูกแก้ไข
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border p-3 text-sm flex items-center justify-between gap-3 bg-muted/30">
          <div className="text-center">
            <div className="text-[11px] text-muted-foreground">{getDocLabel(fromType)}</div>
            <div className="font-mono font-bold">{fromNo ?? "—"}</div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <div className="text-center">
            <div className="text-[11px] text-muted-foreground">{getDocLabel(newType)}</div>
            <div className="font-mono font-bold text-emerald-700 dark:text-emerald-300" data-testid="type-change-new-no">{newNo ?? "—"}</div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          {onViewActivity && newId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onViewActivity}
              data-testid="type-change-view-activity"
            >
              <History className="h-3.5 w-3.5 mr-1.5" /> ดูประวัติ
            </Button>
          )}
          {newNo && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard?.writeText(newNo);
                toast({ title: "คัดลอกเลขใหม่แล้ว" });
              }}
              data-testid="type-change-copy"
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" /> คัดลอกเลขใหม่
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>ปิด</Button>
          {newId && (
            <Button size="sm" onClick={onOpenNew} data-testid="type-change-open-new">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> เปิดเอกสารใหม่
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}