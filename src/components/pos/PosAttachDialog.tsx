import { useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Paperclip, Trash2, Loader2, ExternalLink } from "lucide-react";
import { attachmentUrl, formatBytes, type PosAttachment } from "@/lib/posAttachments";

/**
 * แนบไฟล์เอกสารประกอบก่อนปิดบิล — รายการไฟล์แสดงให้ตรวจก่อนส่งออเดอร์
 * และถูกบันทึกไว้ให้พนักงาน/แอดมินเปิดดูภายหลัง
 */
export default function PosAttachDialog({
  open, onOpenChange, files, busy, onPick, onRemove,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  files: PosAttachment[];
  busy: boolean;
  onPick: (files: File[]) => void;
  onRemove: (f: PosAttachment) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="pos-attach-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paperclip className="h-5 w-5" aria-hidden /> แนบไฟล์เอกสาร
          </DialogTitle>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          data-testid="pos-attach-input"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (picked.length) onPick(picked);
          }}
        />

        <Button
          className="h-12 w-full"
          disabled={busy}
          data-testid="pos-attach-pick"
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Paperclip className="mr-2 h-4 w-4" />}
          เลือกไฟล์ (รูปภาพ/PDF/เอกสาร)
        </Button>

        <ul className="max-h-64 space-y-2 overflow-y-auto" data-testid="pos-attach-list">
          {files.length === 0 && (
            <li className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              ยังไม่มีไฟล์แนบ
            </li>
          )}
          {files.map((f) => (
            <li
              key={f.id}
              data-testid="pos-attach-item"
              className="flex items-center gap-2 rounded-lg border bg-card p-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{f.file_name}</div>
                <div className="text-xs text-muted-foreground">{formatBytes(Number(f.size_bytes || 0))}</div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label="เปิดไฟล์"
                onClick={async () => {
                  const url = await attachmentUrl(f.storage_path);
                  if (url) window.open(url, "_blank", "noopener");
                }}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="text-destructive" aria-label="ลบไฟล์" onClick={() => onRemove(f)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>

        <p className="text-xs text-muted-foreground">
          ไฟล์จะผูกกับใบเสร็จอัตโนมัติเมื่อปิดบิล และเปิดดูได้เฉพาะพนักงาน/แอดมิน (สูงสุด 20MB ต่อไฟล์)
        </p>
      </DialogContent>
    </Dialog>
  );
}