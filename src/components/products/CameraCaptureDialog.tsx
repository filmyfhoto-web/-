import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Camera, Barcode, ScanText, Loader2, RefreshCw, AlertTriangle,
  CheckCircle2, Wand2, ListPlus, X, Pencil, ExternalLink, Check, Crop, Save,
  Zap, ZapOff, Focus,
} from "lucide-react";
import { startBarcodeScan, type StopScan } from "@/lib/barcode";
import { supabase } from "@/integrations/supabase/client";
import {
  logScan, loadScanPrefs, saveScanPrefs, startScanSession, endScanSession,
} from "@/lib/scanLog";
import ImageCropPanel from "./ImageCropPanel";

export type CaptureResult = {
  file?: File;
  previewUrl?: string;
  barcode?: string;
  name?: string;
  /** OCR raw text shown to the user (editable) */
  raw_text?: string;
  /** Suggested category id (from existing product matching barcode) */
  category_id?: string;
  /** Suggested unit (from existing product matching barcode) */
  unit?: string;
  /** Existing duplicate match if any */
  duplicate?: { id: string; name: string; table: "products" | "rds_products" } | null;
};

type QueueItem = CaptureResult & { uid: string };

/** Return a normalized crop rectangle (0..1) over the camera frame for the given focus mode. */
function guideRect(focus: "barcode" | "name" | "full") {
  if (focus === "barcode") return { x: 0.08, y: 0.38, w: 0.84, h: 0.24 };
  if (focus === "name")    return { x: 0.06, y: 0.30, w: 0.88, h: 0.40 };
  return { x: 0.05, y: 0.05, w: 0.90, h: 0.90 };
}

async function cropBlobToRect(srcBlob: Blob, rect: { x: number; y: number; w: number; h: number }): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image(); i.onload = () => resolve(i); i.onerror = reject;
    i.src = URL.createObjectURL(srcBlob);
  });
  const cw = Math.max(1, Math.round(img.width * rect.w));
  const ch = Math.max(1, Math.round(img.height * rect.h));
  const cx = Math.round(img.width * rect.x);
  const cy = Math.round(img.height * rect.y);
  const cnv = document.createElement("canvas");
  cnv.width = cw; cnv.height = ch;
  cnv.getContext("2d")!.drawImage(img, cx, cy, cw, ch, 0, 0, cw, ch);
  URL.revokeObjectURL(img.src);
  return await new Promise<Blob>((res) => cnv.toBlob((b) => res(b!), "image/jpeg", 0.92));
}

/** ย่อภาพก่อนส่ง OCR — max 1024px ด้านยาวสุด, JPEG q=0.75 → เร็วขึ้นมากบนมือถือ/เน็ตช้า */
async function downscaleForOcr(blob: Blob, maxSide = 1024, quality = 0.75): Promise<Blob> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image(); i.onload = () => resolve(i); i.onerror = reject;
      i.src = URL.createObjectURL(blob);
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    if (scale >= 0.999) { URL.revokeObjectURL(img.src); return blob; }
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const cnv = document.createElement("canvas");
    cnv.width = w; cnv.height = h;
    cnv.getContext("2d")!.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(img.src);
    return await new Promise<Blob>((res) => cnv.toBlob((b) => res(b || blob), "image/jpeg", quality));
  } catch { return blob; }
}

/** Apply continuous AF or manual focus distance if the device/track supports it. */
async function applyFocusConstraints(track: MediaStreamTrack, auto: boolean, distance: number) {
  if (!track || !(track as any).applyConstraints) return;
  const caps: any = track.getCapabilities?.() || {};
  const advanced: any = {};
  if (Array.isArray(caps.focusMode)) {
    if (auto && caps.focusMode.includes("continuous")) advanced.focusMode = "continuous";
    else if (!auto && caps.focusMode.includes("manual")) advanced.focusMode = "manual";
  }
  if (!auto && caps.focusDistance) {
    const { min, max } = caps.focusDistance;
    advanced.focusDistance = min + (max - min) * Math.max(0, Math.min(1, distance));
  }
  if (Object.keys(advanced).length === 0) return;
  try { await (track as any).applyConstraints({ advanced: [advanced] }); } catch { /* ignore */ }
}

/** Toggle torch (flashlight) if supported by the device. Returns true when applied. */
async function applyTorch(track: MediaStreamTrack, on: boolean): Promise<boolean> {
  if (!track || !(track as any).applyConstraints) return false;
  const caps: any = track.getCapabilities?.() || {};
  if (!caps.torch) return false;
  try {
    await (track as any).applyConstraints({ advanced: [{ torch: on }] });
    return true;
  } catch { return false; }
}

async function lookupBarcode(code: string): Promise<{
  duplicate: CaptureResult["duplicate"];
  suggestion?: { name?: string; unit?: string; category_id?: string };
}> {
  if (!code) return { duplicate: null };
  const trimmed = code.trim();
  // admin products table
  const a = await supabase
    .from("products" as any)
    .select("id,name,unit,category_id")
    .eq("barcode", trimmed)
    .limit(1)
    .maybeSingle();
  if (a.data) {
    return {
      duplicate: { id: (a.data as any).id, name: (a.data as any).name, table: "products" },
      suggestion: {
        name: (a.data as any).name,
        unit: (a.data as any).unit,
        category_id: (a.data as any).category_id,
      },
    };
  }
  // receipt-side products
  const b = await supabase
    .from("rds_products" as any)
    .select("id,name,unit")
    .eq("barcode", trimmed)
    .limit(1)
    .maybeSingle();
  if (b.data) {
    return {
      duplicate: { id: (b.data as any).id, name: (b.data as any).name, table: "rds_products" },
      suggestion: { name: (b.data as any).name, unit: (b.data as any).unit },
    };
  }
  return { duplicate: null };
}

export default function CameraCaptureDialog({
  open,
  onOpenChange,
  onCapture,
  onQueueComplete,
  onBulkSave,
  focus,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCapture: (r: CaptureResult) => void;
  /** Called when user finishes a continuous-scan session with the queued barcodes */
  onQueueComplete?: (items: CaptureResult[]) => void;
  /** Called when user clicks "บันทึกคิวทั้งหมด" - parent saves all items in one go */
  onBulkSave?: (items: CaptureResult[]) => void | Promise<void>;
  /** Hint for what the user wants to capture, shown in the dialog header */
  focus?: "barcode" | "name" | "full";
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopScanRef = useRef<StopScan | null>(null);

  const initialPrefs = loadScanPrefs();
  // Resolve the effective focus: explicit prop wins, otherwise remember the last one used.
  const effectiveFocus: "barcode" | "name" | "full" = focus ?? initialPrefs.lastFocus ?? "full";
  const [removeBg, setRemoveBgState] = useState(initialPrefs.removeBg);
  const [autoOcr, setAutoOcrState] = useState(initialPrefs.autoOcr);
  // Auto-enable continuous when launching from the dedicated barcode/name buttons,
  // so user can shoot several items in one go and confirm them later.
  const [continuous, setContinuousState] = useState(
    initialPrefs.continuous || focus === "barcode" || focus === "name",
  );
  const [dupHandling, setDupHandlingState] = useState<"confirm" | "skip">(initialPrefs.dupHandling);
  const [autoFocus, setAutoFocusState] = useState(initialPrefs.autoFocus);
  const [focusDistance, setFocusDistanceState] = useState<number>(initialPrefs.focusDistance);
  const [showGuide, setShowGuideState] = useState(initialPrefs.showGuide);
  const [queueLimit, setQueueLimitState] = useState<number>(initialPrefs.queueLimit || 0);
  const [torchOn, setTorchOnState] = useState<boolean>(initialPrefs.torch);
  const [torchSupported, setTorchSupported] = useState(false);
  const [focusStatus, setFocusStatus] = useState<"unsupported" | "searching" | "locked">("unsupported");
  const [focusCaps, setFocusCaps] = useState<{
    focusMode?: string[];
    focusDistance?: { min: number; max: number; step: number };
  } | null>(null);
  const setRemoveBg = (v: boolean) => { setRemoveBgState(v); saveScanPrefs({ removeBg: v }); };
  const setAutoOcr = (v: boolean) => { setAutoOcrState(v); saveScanPrefs({ autoOcr: v }); };
  const setContinuous = (v: boolean) => { setContinuousState(v); saveScanPrefs({ continuous: v }); };
  const setDupHandling = (v: "confirm" | "skip") => { setDupHandlingState(v); saveScanPrefs({ dupHandling: v }); };
  const setAutoFocus = (v: boolean) => { setAutoFocusState(v); saveScanPrefs({ autoFocus: v }); };
  const setFocusDistance = (v: number) => { setFocusDistanceState(v); saveScanPrefs({ focusDistance: v }); };
  const setShowGuide = (v: boolean) => { setShowGuideState(v); saveScanPrefs({ showGuide: v }); };
  const setQueueLimit = (v: number) => {
    const n = Math.max(0, Math.min(999, Math.floor(Number(v) || 0)));
    setQueueLimitState(n); saveScanPrefs({ queueLimit: n });
  };
  const setTorch = async (v: boolean) => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    const applied = track ? await applyTorch(track, v) : false;
    if (!applied) { toast.error("อุปกรณ์นี้ไม่รองรับไฟฉาย"); return; }
    setTorchOnState(v); saveScanPrefs({ torch: v });
  };
  const [scannedBarcode, setScannedBarcode] = useState("");
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [shotBlob, setShotBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState<null | "bg" | "ocr" | "save" | "lookup">(null);
  const [cropMode, setCropMode] = useState(false);
  const [ocrName, setOcrName] = useState("");
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [ocrRaw, setOcrRaw] = useState("");
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrAttempted, setOcrAttempted] = useState(false);
  const [duplicate, setDuplicate] = useState<CaptureResult["duplicate"]>(null);
  const [suggestion, setSuggestion] = useState<{ name?: string; unit?: string; category_id?: string } | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ barcode: string; name: string }>({ barcode: "", name: "" });
  const seenBarcodesRef = useRef<Set<string>>(new Set());

  // start / stop camera + barcode scanner
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let focusPoll: number | undefined;
    startScanSession();
    logScan("scan_session_start", { continuous, removeBg, autoOcr, dupHandling, focus: effectiveFocus });
    // Remember the focus mode the user just opened so it auto-applies next time.
    saveScanPrefs({ lastFocus: effectiveFocus });
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            // จำกัดความละเอียดให้พอเหมาะเพื่อ decode barcode + OCR เร็วขึ้น
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 24, max: 30 },
          },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          // Detect focus capabilities (Chrome Android etc.). Safari iOS = unsupported.
          try {
            const [track] = stream.getVideoTracks();
            const caps: any = track?.getCapabilities?.() || {};
            setFocusCaps({
              focusMode: caps.focusMode,
              focusDistance: caps.focusDistance,
            });
            setTorchSupported(!!caps.torch);
            await applyFocusConstraints(track, autoFocus, focusDistance);
            // Re-apply saved torch state on session start (if supported)
            if (caps.torch && torchOn) { await applyTorch(track, true); }
            // Poll focus status so we can show a "locked" indicator
            const supportsFocus = Array.isArray(caps.focusMode) && caps.focusMode.length > 0;
            if (supportsFocus) {
              setFocusStatus("searching");
              let lastDist = -1;
              let stableTicks = 0;
              focusPoll = window.setInterval(() => {
                const s: any = track.getSettings?.() || {};
                const mode = s.focusMode as string | undefined;
                const dist = typeof s.focusDistance === "number" ? s.focusDistance : NaN;
                if (mode === "manual") { setFocusStatus("locked"); return; }
                if (!isNaN(dist)) {
                  if (Math.abs(dist - lastDist) < 0.005) stableTicks++; else stableTicks = 0;
                  lastDist = dist;
                  setFocusStatus(stableTicks >= 3 ? "locked" : "searching");
                } else {
                  // No reading — assume continuous AF keeps things sharp after ~1s
                  stableTicks++;
                  setFocusStatus(stableTicks >= 4 ? "locked" : "searching");
                }
              }, 250) as unknown as number;
            } else {
              setFocusStatus("unsupported");
            }
          } catch { /* no focus controls on this device */ }
          try {
            stopScanRef.current = await startBarcodeScan(
              videoRef.current,
              (text) => handleBarcodeHit(text),
            );
          } catch {
            // barcode scan optional
          }
        }
      } catch (e: any) {
        toast.error(e?.message || "เปิดกล้องไม่ได้ — โปรดอนุญาตสิทธิ์");
      }
    })();
    return () => {
      cancelled = true;
      if (focusPoll) clearInterval(focusPoll);
      stopScanRef.current?.();
      stopScanRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setShotUrl((u) => { if (u) URL.revokeObjectURL(u); return null; });
      setShotBlob(null);
      setScannedBarcode("");
      setOcrName("");
      setOcrConfidence(null);
      setOcrRaw("");
      setOcrError(null);
      setOcrAttempted(false);
      setDuplicate(null);
      setSuggestion(null);
      setQueue((q) => { logScan("scan_session_finish", { queue_size: q.length }); return []; });
      setEditingUid(null);
      setCropMode(false);
      seenBarcodesRef.current = new Set();
      endScanSession();
    };
  }, [open]);

  // Re-apply focus constraints whenever settings change while stream is live
  useEffect(() => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return;
    applyFocusConstraints(track, autoFocus, focusDistance).catch(() => {});
  }, [autoFocus, focusDistance]);

  // Re-lookup whenever scanned barcode value changes
  useEffect(() => {
    let cancel = false;
    if (!scannedBarcode) { setDuplicate(null); setSuggestion(null); return; }
    (async () => {
      try {
        setBusy("lookup");
        const r = await lookupBarcode(scannedBarcode);
        if (cancel) return;
        setDuplicate(r.duplicate);
        setSuggestion(r.suggestion || null);
        if (r.duplicate) {
          logScan("scan_barcode_duplicate", {
            barcode: scannedBarcode,
            duplicate_id: r.duplicate.id,
            duplicate_name: r.duplicate.name,
            table: r.duplicate.table,
          });
        }
      } finally { if (!cancel) setBusy(null); }
    })();
    return () => { cancel = true; };
  }, [scannedBarcode]);

  function handleBarcodeHit(text: string) {
    const t = (text || "").trim();
    if (!t) return;
    if (continuous) {
      // queue mode: collect unique codes; ignore duplicates within the same session
      if (seenBarcodesRef.current.has(t)) return;
      if (queueLimit > 0 && queue.length >= queueLimit) {
        toast.info(`คิวเต็มแล้ว (${queueLimit} รายการ) — บันทึกหรือเพิ่มลิมิตก่อนสแกนต่อ`);
        return;
      }
      seenBarcodesRef.current.add(t);
      (async () => {
        const r = await lookupBarcode(t);
        if (r.duplicate && dupHandling === "skip") {
          logScan("scan_barcode_skipped", { barcode: t, duplicate_id: r.duplicate.id, duplicate_name: r.duplicate.name });
          toast.info(`ข้าม ${t} (ซ้ำกับ "${r.duplicate.name}")`);
          return;
        }
        setQueue((prev) => [
          ...prev,
          {
            uid: crypto.randomUUID(),
            barcode: t,
            duplicate: r.duplicate,
            category_id: r.suggestion?.category_id,
            unit: r.suggestion?.unit,
            name: r.suggestion?.name,
          },
        ]);
        if (r.duplicate) {
          logScan("scan_barcode_duplicate", { barcode: t, duplicate_id: r.duplicate.id, duplicate_name: r.duplicate.name });
        }
      })();
      toast.success(`เพิ่ม ${t} ลงคิวแล้ว`);
    } else {
      setScannedBarcode((prev) => prev || t);
    }
  }

  function applySuggestion() {
    if (!suggestion) return;
    if (suggestion.name && !ocrName) setOcrName(suggestion.name);
    toast.success("เติมข้อมูลจากบาร์โค้ดแล้ว");
  }

  async function takeShot() {
    const v = videoRef.current; const c = canvasRef.current;
    if (!v || !c) return;
    const w = v.videoWidth, h = v.videoHeight;
    if (!w || !h) { toast.error("กล้องยังไม่พร้อม"); return; }
    c.width = w; c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(v, 0, 0, w, h);
    let blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.92));
    // Crop to the on-screen guide frame so OCR/preview focuses on the target area only.
    if (focus === "barcode" || focus === "name") {
      try { blob = await cropBlobToRect(blob, guideRect(focus)); } catch { /* keep full frame */ }
    }
    if (removeBg) {
      try {
        setBusy("bg");
        const { removeBackground } = await import("@imgly/background-removal");
        blob = await removeBackground(blob);
      } catch (e: any) {
        toast.error("ลบพื้นหลังไม่สำเร็จ ใช้รูปต้นฉบับแทน");
      } finally { setBusy(null); }
    }
    const url = URL.createObjectURL(blob);
    setShotBlob(blob);
    setShotUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });

    if (autoOcr) await runOcr(blob);
  }

  /** Continuous mode in "name" focus: capture+OCR a single shot and push it into the queue. */
  async function captureNameToQueue() {
    if (queueLimit > 0 && queue.length >= queueLimit) {
      toast.info(`คิวเต็มแล้ว (${queueLimit} รายการ)`);
      return;
    }
    const v = videoRef.current; const c = canvasRef.current;
    if (!v || !c) return;
    const w = v.videoWidth, h = v.videoHeight;
    if (!w || !h) { toast.error("กล้องยังไม่พร้อม"); return; }
    c.width = w; c.height = h;
    c.getContext("2d")!.drawImage(v, 0, 0, w, h);
    let blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.92));
    try { blob = await cropBlobToRect(blob, guideRect("name")); } catch { /* keep full */ }
    try {
      setBusy("ocr");
      const small = await downscaleForOcr(blob);
      const b64 = await blobToBase64(small);
      const { data } = await supabase.functions.invoke("ocr-product-name", {
        body: { image_base64: b64, mime: "image/jpeg" },
      });
      const name = (data?.name ?? "").toString().trim();
      const ext = (blob.type.split("/")[1] || "jpg").split(";")[0];
      const file = new File([blob], `name-${Date.now()}.${ext}`, { type: blob.type });
      const previewUrl = URL.createObjectURL(blob);
      setQueue((prev) => [
        ...prev,
        { uid: crypto.randomUUID(), name: name || "", file, previewUrl, raw_text: data?.raw_text || "" },
      ]);
      logScan("scan_ocr_success", { has_name: !!name, has_barcode: false, confidence: data?.confidence ?? null });
      toast.success(name ? `เพิ่ม "${name}" ลงคิวแล้ว` : "เพิ่มภาพชื่อสินค้าลงคิว (แก้ชื่อภายหลังได้)");
    } catch (e: any) {
      toast.error(e?.message || "อ่านชื่อไม่สำเร็จ");
      logScan("scan_ocr_error", { reason: "exception", message: String(e?.message || "").slice(0, 200) });
    } finally { setBusy(null); }
  }

  async function runOcr(blob: Blob) {
    try {
      setBusy("ocr");
      setOcrAttempted(true);
      setOcrError(null);
      const small = await downscaleForOcr(blob);
      const b64 = await blobToBase64(small);
      const { data, error } = await supabase.functions.invoke("ocr-product-name", {
        body: { image_base64: b64, mime: "image/jpeg" },
      });
      if (error) throw error;
      const name = (data?.name ?? "").toString().trim();
      const bc = (data?.barcode ?? "").toString().trim();
      if (name) setOcrName(name);
      if (bc && !scannedBarcode) setScannedBarcode(bc);
      const conf = data?.confidence;
      setOcrConfidence(typeof conf === "number" ? conf : null);
      setOcrRaw((data?.raw_text ?? "").toString());
      if (!name && !bc) {
        setOcrError("ไม่พบข้อความที่อ่านได้ — กรอกชื่อเองหรือลองอ่านใหม่");
        logScan("scan_ocr_error", { reason: "no_text" });
      } else {
        logScan("scan_ocr_success", { has_name: !!name, has_barcode: !!bc, confidence: conf ?? null });
      }
    } catch (e: any) {
      const msg = e?.message || "อ่านชื่อสินค้าไม่สำเร็จ";
      setOcrError(msg);
      toast.error(msg);
      logScan("scan_ocr_error", { reason: "exception", message: String(msg).slice(0, 200) });
    } finally { setBusy(null); }
  }

  function retake() {
    setShotUrl((u) => { if (u) URL.revokeObjectURL(u); return null; });
    setShotBlob(null);
    setOcrName("");
    setOcrConfidence(null);
    setOcrRaw("");
    setOcrError(null);
    setOcrAttempted(false);
    setCropMode(false);
  }

  function confirm() {
    if (duplicate && dupHandling === "confirm") {
      const ok = window.confirm(
        `บาร์โค้ดนี้ซ้ำกับสินค้า "${duplicate.name}" ที่มีอยู่แล้ว ต้องการบันทึกต่อหรือไม่?`,
      );
      if (!ok) return;
    } else if (duplicate && dupHandling === "skip") {
      logScan("scan_barcode_skipped", { barcode: scannedBarcode, duplicate_id: duplicate.id, duplicate_name: duplicate.name });
      toast.info(`ข้าม (ซ้ำกับ "${duplicate.name}")`);
      onOpenChange(false);
      return;
    }
    if (!shotBlob || !shotUrl) { toast.error("ยังไม่มีรูป"); return; }
    const ext = (shotBlob.type.split("/")[1] || "png").split(";")[0];
    const file = new File([shotBlob], `capture-${Date.now()}.${ext}`, { type: shotBlob.type });
    onCapture({
      file,
      previewUrl: shotUrl,
      barcode: scannedBarcode || undefined,
      name: ocrName || undefined,
      raw_text: ocrRaw || undefined,
      category_id: suggestion?.category_id,
      unit: suggestion?.unit,
      duplicate,
    });
    onOpenChange(false);
  }

  function finishQueue() {
    if (!queue.length) { toast.error("ยังไม่มีรายการในคิว"); return; }
    onQueueComplete?.(queue.map(({ uid, ...rest }) => rest));
    onOpenChange(false);
  }

  async function bulkSave() {
    if (!queue.length) { toast.error("ยังไม่มีรายการในคิว"); return; }
    if (!onBulkSave) return;
    logScan("scan_bulk_save", { count: queue.length });
    await onBulkSave(queue.map(({ uid, ...rest }) => rest));
    onOpenChange(false);
  }

  function removeFromQueue(uid: string) {
    setQueue((q) => {
      const next = q.filter((x) => x.uid !== uid);
      const removed = q.find((x) => x.uid === uid);
      if (removed?.barcode) seenBarcodesRef.current.delete(removed.barcode);
      return next;
    });
    if (editingUid === uid) setEditingUid(null);
  }

  function startEditQueue(item: QueueItem) {
    setEditingUid(item.uid);
    setEditDraft({ barcode: item.barcode || "", name: item.name || "" });
  }

  async function saveEditQueue() {
    if (!editingUid) return;
    const newBarcode = editDraft.barcode.trim();
    // re-lookup if barcode changed
    const cur = queue.find((q) => q.uid === editingUid);
    let dup = cur?.duplicate ?? null;
    let sug: { name?: string; unit?: string; category_id?: string } | undefined;
    if (cur && newBarcode && newBarcode !== cur.barcode) {
      const r = await lookupBarcode(newBarcode);
      dup = r.duplicate;
      sug = r.suggestion;
    }
    setQueue((q) =>
      q.map((x) =>
        x.uid === editingUid
          ? {
              ...x,
              barcode: newBarcode,
              name: editDraft.name.trim() || sug?.name || x.name,
              unit: sug?.unit ?? x.unit,
              category_id: sug?.category_id ?? x.category_id,
              duplicate: dup,
            }
          : x,
      ),
    );
    if (cur?.barcode) seenBarcodesRef.current.delete(cur.barcode);
    if (newBarcode) seenBarcodesRef.current.add(newBarcode);
    setEditingUid(null);
  }

  const confidencePct = ocrConfidence == null ? null : Math.round(ocrConfidence * 100);
  const confidenceTone =
    confidencePct == null ? "" :
    confidencePct >= 80 ? "bg-emerald-500 hover:bg-emerald-500" :
    confidencePct >= 50 ? "bg-amber-500 hover:bg-amber-500" :
    "bg-destructive hover:bg-destructive";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {focus === "barcode"
              ? "ถ่ายรหัส/บาร์โค้ดสินค้า"
              : focus === "name"
              ? "ถ่ายชื่อสินค้า (AI อ่านชื่อ)"
              : "ถ่ายรูปสินค้า + สแกนบาร์โค้ด"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {cropMode && shotBlob ? (
            <ImageCropPanel
              blob={shotBlob}
              onCancel={() => setCropMode(false)}
              onCropped={(b) => {
                const url = URL.createObjectURL(b);
                setShotBlob(b);
                setShotUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
                setCropMode(false);
                logScan("scan_image_cropped", {});
                toast.success("ครอปภาพแล้ว");
              }}
            />
          ) : (
          <>
          <div className="relative aspect-square w-full bg-black rounded-xl overflow-hidden">
            {!shotUrl ? (
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
            ) : (
              <img src={shotUrl} alt="ตัวอย่างรูปสินค้า" className="w-full h-full object-contain bg-[conic-gradient(at_0_0,#f3f4f6_25%,#fff_0_50%,#f3f4f6_0_75%,#fff_0)] bg-[length:16px_16px]" />
            )}
            {/* Top-right overlay: focus indicator + torch toggle (live video only) */}
            {!shotUrl && (
              <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium backdrop-blur ${
                    focusStatus === "locked"
                      ? "bg-emerald-500/85 text-white"
                      : focusStatus === "searching"
                      ? "bg-amber-500/85 text-white animate-pulse"
                      : "bg-black/55 text-white/80"
                  }`}
                  title={
                    focusStatus === "locked" ? "โฟกัสติดแล้ว" :
                    focusStatus === "searching" ? "กำลังหาโฟกัส…" :
                    "อุปกรณ์นี้ไม่รายงานสถานะโฟกัส"
                  }
                >
                  <Focus className="w-3 h-3" />
                  {focusStatus === "locked" ? "โฟกัสติด" : focusStatus === "searching" ? "หาโฟกัส" : "AF n/a"}
                </span>
                {torchSupported && (
                  <button
                    type="button"
                    onClick={() => setTorch(!torchOn)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium backdrop-blur ${
                      torchOn ? "bg-yellow-400 text-black" : "bg-black/55 text-white/90"
                    }`}
                    title={torchOn ? "ปิดไฟฉาย" : "เปิดไฟฉาย"}
                  >
                    {torchOn ? <Zap className="w-3 h-3" /> : <ZapOff className="w-3 h-3" />}
                    {torchOn ? "ไฟ ON" : "ไฟ OFF"}
                  </button>
                )}
              </div>
            )}
            {/* Guide frame overlay (only over live video, not still preview) */}
            {!shotUrl && showGuide && (
              <div className="absolute inset-0 pointer-events-none">
                <div
                  className="absolute border-2 border-emerald-400/90 rounded-md shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
                  style={{
                    left:   `${guideRect(focus || "full").x * 100}%`,
                    top:    `${guideRect(focus || "full").y * 100}%`,
                    width:  `${guideRect(focus || "full").w * 100}%`,
                    height: `${guideRect(focus || "full").h * 100}%`,
                  }}
                >
                  {/* corner ticks */}
                  <span className="absolute -top-px -left-px w-4 h-4 border-t-2 border-l-2 border-emerald-300" />
                  <span className="absolute -top-px -right-px w-4 h-4 border-t-2 border-r-2 border-emerald-300" />
                  <span className="absolute -bottom-px -left-px w-4 h-4 border-b-2 border-l-2 border-emerald-300" />
                  <span className="absolute -bottom-px -right-px w-4 h-4 border-b-2 border-r-2 border-emerald-300" />
                </div>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 text-[11px] rounded-full bg-black/60 text-white">
                  {focus === "barcode" ? "วางบาร์โค้ดในกรอบ" : focus === "name" ? "วางชื่อสินค้าในกรอบ" : "วางสินค้าในกรอบ"}
                </div>
              </div>
            )}
            {busy && (
              <div className="absolute inset-0 grid place-items-center bg-black/50 text-white text-sm gap-2">
                <Loader2 className="w-6 h-6 animate-spin" />
                {busy === "bg" ? "กำลังลบพื้นหลัง…" : busy === "ocr" ? "กำลังอ่านชื่อสินค้า…" : "กำลังบันทึก…"}
              </div>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Switch id="rmbg" checked={removeBg} onCheckedChange={setRemoveBg} />
              <Label htmlFor="rmbg">ลบพื้นหลังอัตโนมัติ</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="ocr" checked={autoOcr} onCheckedChange={setAutoOcr} />
              <Label htmlFor="ocr">อ่านชื่อสินค้า (AI)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="cont" checked={continuous} onCheckedChange={(v) => { setContinuous(v); if (!v) seenBarcodesRef.current = new Set(); }} />
              <Label htmlFor="cont">สแกนต่อเนื่อง (หลายรายการ)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="dup" className="text-xs">เมื่อบาร์โค้ดซ้ำ:</Label>
              <select
                id="dup"
                value={dupHandling}
                onChange={(e) => setDupHandling(e.target.value as "confirm" | "skip")}
                className="h-7 text-xs rounded border bg-background px-1"
              >
                <option value="confirm">ยืนยันทีละรายการ</option>
                <option value="skip">ข้ามอัตโนมัติ</option>
              </select>
            </div>
          </div>

          {/* Auto-focus / manual focus controls + guide toggle */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs rounded-lg border bg-muted/40 px-2 py-1.5">
            <div className="flex items-center gap-2">
              <Switch id="af" checked={autoFocus} onCheckedChange={setAutoFocus} />
              <Label htmlFor="af">ออโต้โฟกัส</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="grd" checked={showGuide} onCheckedChange={setShowGuide} />
              <Label htmlFor="grd">แสดงกรอบนำทาง</Label>
            </div>
            {!autoFocus && focusCaps?.focusDistance && (
              <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                <Label className="shrink-0">ระยะโฟกัส</Label>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={focusDistance}
                  onChange={(e) => setFocusDistance(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="w-8 text-right tabular-nums">{Math.round(focusDistance * 100)}%</span>
              </div>
            )}
            {!autoFocus && !focusCaps?.focusDistance && (
              <span className="text-muted-foreground">อุปกรณ์นี้ไม่รองรับโฟกัสด้วยตนเอง</span>
            )}
          </div>

          {continuous && (
            <div className="rounded-lg border bg-muted/40 p-2 text-sm">
              <div className="flex items-center justify-between mb-1">
                <div className="font-medium flex items-center gap-2 flex-wrap">
                  <span>คิวที่สแกนแล้ว ({queue.length}{queueLimit > 0 ? `/${queueLimit}` : ""})</span>
                  <label className="flex items-center gap-1 text-[11px] font-normal text-muted-foreground">
                    จำกัด:
                    <Input
                      type="number" min={0} max={999}
                      value={queueLimit}
                      onChange={(e) => setQueueLimit(Number(e.target.value))}
                      className="h-6 w-14 text-xs px-1"
                    />
                    <span>(0 = ไม่จำกัด)</span>
                  </label>
                </div>
                <div className="flex gap-1">
                  {focus === "name" && (
                    <Button size="sm" variant="secondary" onClick={captureNameToQueue} disabled={!!busy}>
                      <Camera className="w-3 h-3 mr-1" /> ถ่าย+เพิ่มชื่อเข้าคิว
                    </Button>
                  )}
                  {onBulkSave && (
                    <Button size="sm" variant="default" onClick={bulkSave} disabled={!queue.length}>
                      <Save className="w-3 h-3 mr-1" /> บันทึกคิวทั้งหมด
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={finishQueue} disabled={!queue.length}>
                    ยืนยันทีละรายการ
                  </Button>
                </div>
              </div>
              {queue.length === 0 ? (
                <div className="text-xs text-muted-foreground">
                  {focus === "name"
                    ? "วางชื่อสินค้าในกรอบแล้วกด \"ถ่าย+เพิ่มชื่อเข้าคิว\""
                    : "เล็งกล้องไปที่บาร์โค้ดเพื่อเพิ่มลงคิว…"}
                </div>
              ) : (
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {queue.map((q) => (
                    <li key={q.uid} className="text-xs bg-background rounded px-2 py-1">
                      {editingUid === q.uid ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={editDraft.barcode}
                            onChange={(e) => setEditDraft({ ...editDraft, barcode: e.target.value.replace(/[^0-9]/g, "") })}
                            className="h-7 font-mono text-xs w-32"
                            placeholder="บาร์โค้ด"
                          />
                          <Input
                            value={editDraft.name}
                            onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                            className="h-7 text-xs flex-1"
                            placeholder="ชื่อสินค้า"
                          />
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={saveEditQueue}>
                            <Check className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingUid(null)}>
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono">{q.barcode}</span>
                          <span className={`flex-1 truncate ${q.duplicate ? "text-destructive" : "text-muted-foreground"}`}>
                            {q.duplicate ? `ซ้ำ: ${q.duplicate.name}` : q.name || "ไม่พบในระบบ"}
                          </span>
                          <button onClick={() => startEditQueue(q)} className="p-1 hover:bg-muted rounded" title="แก้ไข">
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button onClick={() => removeFromQueue(q.uid)} className="p-1 hover:bg-muted rounded" title="ลบ">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!continuous && (scannedBarcode || ocrName || ocrRaw) && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-2">
              {scannedBarcode && (
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1"><Barcode className="w-3 h-3" /> บาร์โค้ด</Label>
                  <Input
                    value={scannedBarcode}
                    onChange={(e) => setScannedBarcode(e.target.value.replace(/[^0-9]/g, ""))}
                    className="h-8 font-mono"
                  />
                  {duplicate ? (
                    <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded px-2 py-1">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <div className="font-medium">ซ้ำกับสินค้าที่มีอยู่: {duplicate.name}</div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                          {suggestion && (
                            <button onClick={applySuggestion} className="underline hover:no-underline inline-flex items-center gap-1">
                              <Wand2 className="w-3 h-3" /> เติมชื่อ/หน่วย/หมวด
                            </button>
                          )}
                          <a
                            href={duplicate.table === "products" ? `/admin/products?id=${duplicate.id}` : `/receipts/products?id=${duplicate.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="underline hover:no-underline inline-flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" /> ดูสินค้าในระบบ
                          </a>
                        </div>
                      </div>
                    </div>
                  ) : busy === "lookup" ? (
                    <div className="text-xs text-muted-foreground">กำลังตรวจสอบ…</div>
                  ) : (
                    <div className="flex items-center gap-1 text-xs text-emerald-600">
                      <CheckCircle2 className="w-3.5 h-3.5" /> บาร์โค้ดใหม่ ไม่ซ้ำกับสินค้าในระบบ
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-1"><ScanText className="w-3 h-3" /> ชื่อสินค้า (แก้ไขได้)</Label>
                  <div className="flex items-center gap-1">
                    {confidencePct != null && (
                      <Badge className={`text-[10px] ${confidenceTone}`}>ความมั่นใจ {confidencePct}%</Badge>
                    )}
                    {shotBlob && (
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" disabled={!!busy} onClick={() => runOcr(shotBlob)}>
                        <RefreshCw className="w-3 h-3 mr-1" /> ลอง OCR ใหม่
                      </Button>
                    )}
                  </div>
                </div>
                <Input
                  value={ocrName}
                  onChange={(e) => setOcrName(e.target.value)}
                  placeholder="ชื่อสินค้า (จะใช้ค่านี้บันทึก)"
                  className="h-8"
                />
                {ocrError && (
                  <div className="flex items-start gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                    <span>{ocrError} — พิมพ์ชื่อในช่องด้านบนได้ทันที</span>
                  </div>
                )}
                {!ocrError && ocrAttempted && !ocrName && (
                  <div className="text-[11px] text-muted-foreground">AI ไม่พบชื่อสินค้า — กรอกเองหรือกด "ลอง OCR ใหม่"</div>
                )}
              </div>

              {ocrRaw && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">ดูข้อความทั้งหมดที่อ่านได้</summary>
                  <Textarea
                    rows={3}
                    value={ocrRaw}
                    onChange={(e) => setOcrRaw(e.target.value)}
                    className="mt-1 text-xs"
                  />
                </details>
              )}
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {!shotUrl ? (
              <>
                {!continuous && (
                  <Button onClick={takeShot} disabled={!!busy} className="rounded-xl flex-1">
                    <Camera className="w-4 h-4 mr-1" /> ถ่ายภาพ
                  </Button>
                )}
                {continuous && (
                  <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl flex-1">
                    ปิด
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button variant="outline" onClick={retake} disabled={!!busy} className="rounded-xl flex-1">
                  <RefreshCw className="w-4 h-4 mr-1" /> ถ่ายใหม่
                </Button>
                <Button variant="outline" onClick={() => setCropMode(true)} disabled={!!busy} className="rounded-xl">
                  <Crop className="w-4 h-4 mr-1" /> ครอป/ซูม
                </Button>
                {!ocrName && (
                  <Button variant="outline" onClick={() => shotBlob && runOcr(shotBlob)} disabled={!!busy} className="rounded-xl">
                    <ScanText className="w-4 h-4 mr-1" /> อ่านชื่อ
                  </Button>
                )}
                <Button onClick={confirm} disabled={!!busy} className="rounded-xl flex-1">ใช้รูปนี้</Button>
              </>
            )}
          </div>
          </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}