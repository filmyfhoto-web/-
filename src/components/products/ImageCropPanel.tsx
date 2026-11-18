import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Crop, RotateCcw, Check } from "lucide-react";

/**
 * ครอป + ซูม + ลากภาพ ก่อนบันทึก
 * - viewport 1:1 (ไม่บังคับ ratio: อนุญาต free แต่ครอปเป็นสี่เหลี่ยมจตุรัส)
 * - zoom 1x..4x
 */
export default function ImageCropPanel({
  blob,
  onCancel,
  onCropped,
}: {
  blob: Blob;
  onCancel: () => void;
  onCropped: (cropped: Blob) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [url, setUrl] = useState<string>("");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    setZoom(1); setOffset({ x: 0, y: 0 });
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  function onDown(e: React.PointerEvent) {
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    setOffset({
      x: dragRef.current.ox + (e.clientX - dragRef.current.sx),
      y: dragRef.current.oy + (e.clientY - dragRef.current.sy),
    });
  }
  function onUp() { dragRef.current = null; }

  async function doCrop() {
    const wrap = wrapRef.current;
    const img = imgRef.current;
    if (!wrap || !img) return;
    const rect = wrap.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    // image natural size + drawn size
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const baseScale = Math.min(size / iw, size / ih); // "contain" default
    const drawW = iw * baseScale * zoom;
    const drawH = ih * baseScale * zoom;
    // center + offset
    const cx = rect.width / 2 + offset.x;
    const cy = rect.height / 2 + offset.y;
    const left = cx - drawW / 2;
    const top = cy - drawH / 2;
    // viewport square centered
    const vpLeft = (rect.width - size) / 2;
    const vpTop = (rect.height - size) / 2;
    // source rect on image
    const scaleToSrc = iw / drawW;
    const sx = (vpLeft - left) * scaleToSrc;
    const sy = (vpTop - top) * scaleToSrc;
    const sSize = size * scaleToSrc;
    // clamp
    const cropX = Math.max(0, Math.min(iw, sx));
    const cropY = Math.max(0, Math.min(ih, sy));
    const cropW = Math.max(1, Math.min(iw - cropX, sSize));
    const cropH = Math.max(1, Math.min(ih - cropY, sSize));

    const out = document.createElement("canvas");
    // Cap output at 1200x1200 for consistent storage size across desktop/mobile,
    // always encode as JPEG so uploads stay lean (WebP fallback if browser refuses).
    const MAX_OUT = 1200;
    const outSize = Math.min(MAX_OUT, Math.round(Math.max(cropW, cropH)));
    out.width = outSize;
    out.height = outSize;
    const ctx = out.getContext("2d")!;
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outSize, outSize);
    const outType = "image/jpeg";
    const newBlob: Blob = await new Promise((res) =>
      out.toBlob((b) => res(b ?? blob), outType, 0.9),
    );
    onCropped(newBlob);
  }

  return (
    <div className="space-y-2">
      <div
        ref={wrapRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="relative aspect-square w-full bg-black rounded-xl overflow-hidden cursor-move touch-none select-none"
      >
        {url && (
          <img
            ref={imgRef}
            src={url}
            alt=""
            draggable={false}
            style={{
              transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${zoom})`,
              transformOrigin: "center",
              position: "absolute",
              top: "50%",
              left: "50%",
              maxWidth: "100%",
              maxHeight: "100%",
              pointerEvents: "none",
            }}
          />
        )}
        {/* crop frame overlay (1:1 centered) */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 border-2 border-white/70 m-2 rounded-md shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Label className="text-xs whitespace-nowrap">ซูม {zoom.toFixed(1)}x</Label>
        <Slider value={[zoom]} min={1} max={4} step={0.1} onValueChange={(v) => setZoom(v[0])} className="flex-1" />
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}>
          <RotateCcw className="w-3 h-3" />
        </Button>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel} className="rounded-xl flex-1">ยกเลิก</Button>
        <Button onClick={doCrop} className="rounded-xl flex-1">
          <Check className="w-4 h-4 mr-1" /> ใช้รูปที่ครอป
        </Button>
      </div>
    </div>
  );
}