import { useEffect, useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Copy, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/productLink";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

/**
 * Scan-to-open QR for one workspace link. Staff hand a phone at the counter,
 * scan, and land straight on the install page for that app.
 */
export default function QrLinkDialog({
  open,
  onOpenChange,
  url,
  label,
  hint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  label: string;
  hint?: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Give the canvas a stable test hook once it mounts.
  useEffect(() => {
    if (!open) return;
    wrapRef.current?.querySelector("canvas")?.setAttribute("data-testid", "qr-canvas");
  }, [open, url]);

  const download = () => {
    const canvas = wrapRef.current?.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `qr-${label.replace(/[^\w\u0E00-\u0E7F]+/g, "-")}.png`;
    a.click();
    toast.success("ดาวน์โหลด QR แล้ว");
  };

  const copy = async () => {
    const ok = await copyToClipboard(url);
    ok ? toast.success("คัดลอกลิงก์แล้ว") : toast.error("คัดลอกไม่สำเร็จ");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-testid="qr-dialog">
        <DialogHeader>
          <DialogTitle>QR เปิด “{label}”</DialogTitle>
          <DialogDescription>{hint ?? "สแกนด้วยกล้องมือถือเพื่อเปิดลิงก์นี้ทันที"}</DialogDescription>
        </DialogHeader>
        <div ref={wrapRef} className="flex justify-center rounded-lg bg-white p-4">
          {open && <QRCodeCanvas value={url} size={224} level="M" includeMargin />}
        </div>
        <div className="rounded-md bg-muted/50 p-2 text-[11px] break-all font-mono">{url}</div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={download}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Download className="w-3.5 h-3.5" /> ดาวน์โหลด PNG
          </button>
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
          >
            <Copy className="w-3.5 h-3.5" /> คัดลอกลิงก์
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
          >
            <ExternalLink className="w-3.5 h-3.5" /> เปิดลิงก์
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}