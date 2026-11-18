import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Upload, X, ScanLine, Loader2, Video, VideoOff, ShieldAlert } from "lucide-react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { toast } from "sonner";

type ResKey = "auto" | "sd" | "hd" | "fhd";
const RES_PRESETS: Record<ResKey, { label: string; width?: number; height?: number }> = {
  auto: { label: "อัตโนมัติ" },
  sd: { label: "SD 640×480", width: 640, height: 480 },
  hd: { label: "HD 1280×720", width: 1280, height: 720 },
  fhd: { label: "FHD 1920×1080", width: 1920, height: 1080 },
};
const LS_RES_KEY = "pos.photoBarcode.resolution";
const LS_AUTO_UPGRADE_KEY = "pos.photoBarcode.autoUpgrade";

function loadRes(): ResKey {
  try {
    const v = localStorage.getItem(LS_RES_KEY) as ResKey | null;
    if (v && v in RES_PRESETS) return v;
  } catch {}
  return "auto";
}

/**
 * PhotoBarcodeDialog — capture a still photo (via camera or file upload) and
 * decode the barcode locally using ZXing. No AI credits are used.
 */
export default function PhotoBarcodeDialog({
  open,
  onOpenChange,
  onDecoded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDecoded: (code: string) => void;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [decoding, setDecoding] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [mode, setMode] = useState<"still" | "live">("still");
  const [resolution, setResolution] = useState<ResKey>(() => loadRes());
  const [permState, setPermState] = useState<"idle" | "requesting" | "granted" | "denied" | "unavailable">("idle");
  const [permError, setPermError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const captureInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const successCountRef = useRef(0);
  const lastDecodeAtRef = useRef(0);

  useEffect(() => {
    if (!open) {
      stopLive();
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      setImageUrl(null);
      setResult(null);
      setDecoding(false);
      setMode("still");
      setPermState("idle");
      setPermError(null);
      successCountRef.current = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => stopLive(), []);

  useEffect(() => {
    try { localStorage.setItem(LS_RES_KEY, resolution); } catch {}
  }, [resolution]);

  // Restart live scanning when resolution changes while in live mode.
  useEffect(() => {
    if (open && mode === "live" && permState === "granted") {
      stopLive();
      void startLive();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolution]);

  function stopLive() {
    try { controlsRef.current?.stop(); } catch {}
    controlsRef.current = null;
    const v = videoRef.current;
    const s = (v?.srcObject as MediaStream | null) ?? null;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      if (v) v.srcObject = null;
    }
  }

  async function startLive() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermState("unavailable");
      setPermError("อุปกรณ์นี้ไม่รองรับกล้อง หรือหน้าเว็บไม่ได้ใช้ HTTPS");
      return;
    }
    setPermState("requesting");
    setPermError(null);
    const preset = RES_PRESETS[resolution];
    const video: MediaTrackConstraints = { facingMode: { ideal: "environment" } };
    if (preset.width && preset.height) {
      video.width = { ideal: preset.width };
      video.height = { ideal: preset.height };
    }
    try {
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromConstraints(
        { video, audio: false },
        videoRef.current!,
        (res) => {
          if (res) {
            const text = res.getText().trim();
            setResult(text);
            maybeAutoUpgrade();
          }
        },
      );
      controlsRef.current = controls;
      setPermState("granted");
    } catch (e: any) {
      const name = e?.name || "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setPermState("denied");
        setPermError("ผู้ใช้ปฏิเสธการใช้กล้อง — กดไอคอนกล้องบน URL เพื่ออนุญาตแล้วลองใหม่");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setPermState("unavailable");
        setPermError("ไม่พบกล้องที่รองรับความละเอียดที่เลือก ลองเปลี่ยนความละเอียด");
      } else {
        setPermState("denied");
        setPermError(e?.message || "เปิดกล้องไม่สำเร็จ");
      }
    }
  }

  async function switchToLive() {
    setMode("live");
    setResult(null);
    if (imageUrl) { URL.revokeObjectURL(imageUrl); setImageUrl(null); }
    await startLive();
  }

  function switchToStill() {
    stopLive();
    setMode("still");
  }

  function maybeAutoUpgrade() {
    let enabled = true;
    try {
      if (localStorage.getItem(LS_AUTO_UPGRADE_KEY) === "0") enabled = false;
    } catch {}
    if (!enabled) return;
    const now = Date.now();
    if (now - lastDecodeAtRef.current < 5000) successCountRef.current += 1;
    else successCountRef.current = 1;
    lastDecodeAtRef.current = now;
    if (successCountRef.current >= 3) {
      successCountRef.current = 0;
      setResolution((prev) => (prev === "auto" || prev === "sd" ? "hd" : prev === "hd" ? "fhd" : prev));
    }
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    stopLive();
    setMode("still");
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setResult(null);
    setDecoding(true);
    try {
      const img = await loadImage(url);
      const reader = new BrowserMultiFormatReader();
      const decoded = await reader.decodeFromImageElement(img);
      const text = decoded.getText().trim();
      setResult(text);
    } catch (e) {
      toast.error("อ่านบาร์โค้ดจากรูปไม่สำเร็จ", {
        description: "ลองถ่ายใหม่ให้ชัดขึ้น หรือใช้กล้องสด",
      });
    } finally {
      setDecoding(false);
    }
  }

  function useResult() {
    if (!result) return;
    onDecoded(result);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="photo-barcode-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" /> ถ่ายรูปอ่านบาร์โค้ด
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          สแกนสด ถ่ายรูป หรือเลือกไฟล์จากแกลเลอรี — อ่านบาร์โค้ดในเครื่องด้วย ZXing ไม่ใช้ AI เครดิต
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground">ความละเอียดกล้อง</label>
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value as ResKey)}
            className="h-8 rounded-md border bg-background px-2 text-sm"
            data-testid="photo-barcode-resolution"
          >
            {(Object.keys(RES_PRESETS) as ResKey[]).map((k) => (
              <option key={k} value={k}>{RES_PRESETS[k].label}</option>
            ))}
          </select>
          {mode === "live" ? (
            <Button variant="ghost" size="sm" onClick={switchToStill} data-testid="photo-barcode-stop-live">
              <VideoOff className="h-4 w-4 mr-1" /> หยุดสด
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={switchToLive} data-testid="photo-barcode-start-live">
              <Video className="h-4 w-4 mr-1" /> สแกนสด
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input
            ref={captureInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            data-testid="photo-barcode-capture-input"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            data-testid="photo-barcode-upload-input"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          <Button
            variant="outline"
            onClick={() => captureInputRef.current?.click()}
            data-testid="photo-barcode-capture-btn"
          >
            <Camera className="h-4 w-4 mr-1" /> ถ่ายรูป
          </Button>
          <Button
            variant="outline"
            onClick={() => uploadInputRef.current?.click()}
            data-testid="photo-barcode-upload-btn"
          >
            <Upload className="h-4 w-4 mr-1" /> เลือกไฟล์
          </Button>
        </div>

        {mode === "live" && (
          <div className="rounded-md overflow-hidden bg-black aspect-video relative">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-contain"
              data-testid="photo-barcode-video"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative w-[70%] h-[45%] border-2 border-emerald-400/80 rounded-md shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
                <span className="absolute -top-0.5 -left-0.5 w-4 h-4 border-t-4 border-l-4 border-emerald-300 rounded-tl-md" />
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 border-t-4 border-r-4 border-emerald-300 rounded-tr-md" />
                <span className="absolute -bottom-0.5 -left-0.5 w-4 h-4 border-b-4 border-l-4 border-emerald-300 rounded-bl-md" />
                <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 border-b-4 border-r-4 border-emerald-300 rounded-br-md" />
                <div className="absolute left-2 right-2 top-1/2 h-[2px] bg-emerald-400/70 animate-pulse" />
              </div>
            </div>
            <div className="absolute bottom-1 left-0 right-0 text-center text-[11px] text-white/80 pointer-events-none">
              วางบาร์โค้ดในกรอบ • {RES_PRESETS[resolution].label}
            </div>
            {permState === "requesting" && (
              <div className="absolute inset-0 grid place-items-center text-white text-sm bg-black/40">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> กำลังขออนุญาตกล้อง…
                </div>
              </div>
            )}
          </div>
        )}

        {mode === "live" && (permState === "denied" || permState === "unavailable") && (
          <div
            className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm flex gap-2"
            data-testid="photo-barcode-perm-error"
          >
            <ShieldAlert className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
            <div className="space-y-2">
              <div>{permError}</div>
              <Button size="sm" variant="outline" onClick={startLive}>
                ลองขออนุญาตกล้องอีกครั้ง
              </Button>
            </div>
          </div>
        )}

        {mode === "still" && imageUrl && (
          <div className="rounded-md overflow-hidden bg-muted aspect-video grid place-items-center">
            <img src={imageUrl} alt="preview" className="max-h-full max-w-full object-contain" />
          </div>
        )}

        {decoding && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> กำลังอ่านบาร์โค้ด…
          </div>
        )}

        {result && !decoding && (
          <div
            className="rounded-md border p-3 bg-green-50 dark:bg-green-950/30"
            data-testid="photo-barcode-result"
          >
            <div className="text-xs text-muted-foreground">บาร์โค้ดที่อ่านได้</div>
            <div className="font-mono text-base">{result}</div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-1" /> ปิด
          </Button>
          <Button
            disabled={!result || decoding}
            onClick={useResult}
            data-testid="photo-barcode-use-btn"
          >
            ใช้บาร์โค้ดนี้
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}