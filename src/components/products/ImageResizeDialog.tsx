import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ImageCropPanel from "./ImageCropPanel";

/**
 * ImageResizeDialog — thin dialog wrapper around the existing ImageCropPanel.
 * Accepts either a Blob or a URL string; fetches URL → Blob on open so the
 * crop UI stays a single non-destructive path with zoom / drag / reset /
 * cancel / confirm. No new dependency.
 */
export default function ImageResizeDialog({
  open,
  source,
  onOpenChange,
  onConfirm,
  title = "ปรับขนาดรูปภาพ",
}: {
  open: boolean;
  source: Blob | string | null;
  onOpenChange: (o: boolean) => void;
  onConfirm: (blob: Blob) => void;
  title?: string;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!open || !source) { setBlob(null); setErr(null); return; }
    if (source instanceof Blob) { setBlob(source); return; }
    setErr(null);
    fetch(source, { mode: "cors" })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
      .then((b) => { if (!cancelled) setBlob(b); })
      .catch(() => { if (!cancelled) setErr("โหลดรูปเพื่อครอปไม่สำเร็จ"); });
    return () => { cancelled = true; };
  }, [open, source]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="image-resize-dialog">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {err && <div className="text-sm text-destructive">{err}</div>}
        {!err && !blob && <div className="text-sm text-muted-foreground py-8 text-center">กำลังโหลดรูป…</div>}
        {blob && (
          <ImageCropPanel
            blob={blob}
            onCancel={() => onOpenChange(false)}
            onCropped={(b) => { onConfirm(b); onOpenChange(false); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}