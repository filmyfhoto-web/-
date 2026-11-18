import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, X, Loader2 } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  count: number;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  actionLabel?: string;
  confirmTitle?: string;
  confirmDescription?: string;
  disabled?: boolean;
  disabledHint?: string;
  /** e.g. "สินค้า", "ลูกค้า" — used inside the default summary line. */
  itemLabel?: string;
  /** First few item names shown so the user can sanity-check before confirming. */
  previewNames?: string[];
  /** When set, the user must type this word verbatim before confirm is enabled. */
  confirmWord?: string;
};

export default function BulkActionBar({
  count, onCancel, onConfirm,
  actionLabel = "ลบที่เลือก",
  confirmTitle,
  confirmDescription,
  disabled, disabledHint,
  itemLabel = "รายการ",
  previewNames,
  confirmWord,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");

  const title = confirmTitle ?? `ยืนยันลบ ${count} ${itemLabel}?`;
  const desc = confirmDescription ?? `กำลังจะลบ${itemLabel} จำนวน ${count} รายการ การลบไม่สามารถย้อนกลับได้`;
  const preview = (previewNames ?? []).slice(0, 5);
  const extra = (previewNames?.length ?? 0) - preview.length;
  const typedOk = !confirmWord || typed.trim() === confirmWord;

  async function handleConfirm(e: React.MouseEvent) {
    e.preventDefault();
    if (!typedOk || busy) return;
    setBusy(true);
    try { await onConfirm(); setOpen(false); setTyped(""); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-2xl border border-border bg-card/95 backdrop-blur px-4 py-2 shadow-lg">
      <span className="text-sm font-medium">เลือกแล้ว {count} รายการ</span>
      {disabled && disabledHint && <span className="text-xs text-muted-foreground">{disabledHint}</span>}
      <Button size="sm" variant="ghost" onClick={onCancel}>
        <X className="w-4 h-4 mr-1" /> ยกเลิก
      </Button>
      <AlertDialog open={open} onOpenChange={(v) => { if (!busy) { setOpen(v); if (!v) setTyped(""); } }}>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="destructive" disabled={disabled || count === 0}>
            <Trash2 className="w-4 h-4 mr-1" /> {actionLabel}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent data-testid="bulk-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="bulk-confirm-title">{title}</AlertDialogTitle>
            <AlertDialogDescription data-testid="bulk-confirm-desc">{desc}</AlertDialogDescription>
          </AlertDialogHeader>
          {preview.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm" data-testid="bulk-confirm-preview">
              <div className="text-xs text-muted-foreground mb-1">รายการที่จะลบ:</div>
              <ul className="space-y-0.5 list-disc list-inside">
                {preview.map((n, i) => <li key={i} className="truncate">{n}</li>)}
              </ul>
              {extra > 0 && <div className="text-xs text-muted-foreground mt-1">…และอีก {extra} รายการ</div>}
            </div>
          )}
          {confirmWord && (
            <div className="space-y-1">
              <Label htmlFor="bulk-confirm-word" className="text-xs">
                พิมพ์คำว่า <span className="font-mono font-semibold">{confirmWord}</span> เพื่อยืนยัน
              </Label>
              <Input
                id="bulk-confirm-word"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                data-testid="bulk-confirm-input"
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              disabled={!typedOk || busy}
              onClick={handleConfirm}
              data-testid="bulk-confirm-action"
            >
              {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              ยืนยันลบ {count} รายการ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}