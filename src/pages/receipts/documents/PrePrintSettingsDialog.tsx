import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Printer, RotateCcw, CheckCircle2, AlertTriangle, Download } from "lucide-react";
import { buildPrintHtml, combinePrintBlocks } from "../lib/printWindow";
import { parsePageRange } from "./printRange";
import {
  resolveInitialPrefs, savePrintPrefs, DEFAULT_MARGINS,
  DEFAULT_PRINT_PREFS,
  saveDocPrintPrefs,
  getPaperSizeMm,
  getPaperCssSize,
  type PrintPrefs, type PaperSize, type PrintMargins,
} from "../lib/printPrefs";

const PX_PER_MM = 96 / 25.4;

export interface PrePrintSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Source document already rendered to React (DocumentPreview etc). */
  documentNode: ReactNode;
  /** Per-document overrides (e.g. doc's saved font_scale / paper_size). */
  initial?: Partial<PrintPrefs>;
  /** Document id — when provided, prefs are saved per-document so reopening
   * the same doc restores the user's last scale/margins/copies/pageRange. */
  docId?: string | null;
  /** Document type — enables receipt-only paper presets (e.g. auto 19×27 ซม.). */
  documentType?: string;
  /** Called when user clicks "พิมพ์เลย". Dialog closes after this returns. */
  onConfirm: (cfg: PrintPrefs, reservedPrintWindow?: Window | null) => void | Promise<void>;
  /** Optional secondary action — render a "ดาวน์โหลด PDF" button if provided. */
  onDownloadPdf?: (cfg: PrintPrefs) => void | Promise<void>;
}

/**
 * Universal pre-print settings dialog. Lets the user adjust font size, paper,
 * orientation, copies, page range, and font scope before sending to print,
 * with a true-to-print iframe preview and page-break overlays.
 */
export function PrePrintSettingsDialog({
  open, onOpenChange, documentNode, initial, docId, documentType, onConfirm, onDownloadPdf,
}: PrePrintSettingsDialogProps) {
  const [cfg, setCfg] = useState<PrintPrefs>(() => resolveInitialPrefs(initial, docId));
  const [html, setHtml] = useState("");
  const [pageCount, setPageCount] = useState(1);
  const [contentH, setContentH] = useState(0);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const paperMm = getPaperSizeMm(cfg.paper, cfg.orient, cfg.customPaper);
  const dims = { w: Math.round(paperMm.w * PX_PER_MM), h: Math.round(paperMm.h * PX_PER_MM), cssPaper: getPaperCssSize(cfg.paper, cfg.orient, cfg.customPaper) };

  // Reset to per-document defaults each time the dialog opens.
  useEffect(() => {
    if (open) setCfg(resolveInitialPrefs(initial, docId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, docId]);

  // Debounce the iframe-rebuild inputs so typing in margins / changing
  // paper a few times in quick succession doesn't thrash the snapshot.
  // Slider scale + copies + pageRange are intentionally NOT debounced —
  // they're patched/overlayed live without rebuilding the iframe.
  const [debouncedRebuildKey, setDebouncedRebuildKey] = useState({
    paper: cfg.paper, orient: cfg.orient, customPaper: cfg.customPaper, margins: cfg.margins, headerOnce: cfg.headerOnce,
  });
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      setDebouncedRebuildKey({
        paper: cfg.paper, orient: cfg.orient, customPaper: cfg.customPaper, margins: cfg.margins, headerOnce: cfg.headerOnce,
      });
    }, 180);
    return () => window.clearTimeout(t);
  }, [open, cfg.paper, cfg.orient, cfg.customPaper, cfg.margins, cfg.headerOnce]);

  // Apply CSS variables on the offscreen stage so the preview reflects
  // font-scale + scope. These mirror the @media print rules used by the
  // real document templates (--doc-font-scale, --doc-font-scope-*).
  useEffect(() => {
    if (!open) { setHtml(""); return; }
    const raf = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const stage = stageRef.current;
        if (!stage) return;
        const blocks = Array.from(
          stage.querySelectorAll<HTMLElement>('[id="doc-print"]'),
        );
        const primary = blocks[0] ?? (stage as HTMLElement);
        // Inject scope CSS variables on every printable block.
        blocks.forEach((b) => {
          b.style.setProperty("--doc-font-scale", String(cfg.fontScale));
          b.style.setProperty("--doc-font-scope", cfg.fontScope);
        });
        const bodyHtml = blocks.length > 1 ? combinePrintBlocks(blocks) : primary.outerHTML;
        setHtml(buildPrintHtml({
          bodyHtml,
          sourceEl: stage as HTMLElement,
          paperSize: dims.cssPaper,
          orient: cfg.orient,
          bodyClass: `is-printing print-preview-surface scope-${cfg.fontScope}`,
          margins: cfg.margins,
          headerOnce: cfg.headerOnce,
          fontScale: cfg.fontScale,
          fontScope: cfg.fontScope,
        }));
      });
    });
    return () => window.cancelAnimationFrame(raf);
    // Note: fontScale / fontScope intentionally excluded from deps — those
    // are patched live into the iframe below to avoid a full re-snapshot on
    // every slider tick (which feels laggy and resets scroll position).
  }, [
    open,
    debouncedRebuildKey.paper,
    debouncedRebuildKey.orient,
    debouncedRebuildKey.customPaper,
    debouncedRebuildKey.margins,
    debouncedRebuildKey.headerOnce,
    documentNode,
    dims.cssPaper,
  ]);

  // Live-update font scale & scope on every render of the iframe and the
  // offscreen stage, so dragging the slider updates the preview instantly.
  useEffect(() => {
    if (!open) return;
    // Update offscreen stage (used the next time we re-snapshot).
    const stage = stageRef.current;
    stage?.querySelectorAll<HTMLElement>('[id="doc-print"]').forEach((b) => {
      b.style.setProperty("--doc-font-scale", String(cfg.fontScale));
      b.style.setProperty("--doc-font-scope", cfg.fontScope);
    });
    // Patch the running iframe document directly.
    const doc = iframeRef.current?.contentDocument;
    const root = doc?.documentElement;
    if (root) {
      root.style.setProperty("--doc-font-scale", String(cfg.fontScale));
      root.style.setProperty("--doc-font-scope", cfg.fontScope);
      doc?.querySelectorAll<HTMLElement>('#doc-print, .doc-print-document').forEach((b) => {
        b.style.setProperty("--doc-font-scale", String(cfg.fontScale));
        b.style.setProperty("--doc-font-scope", cfg.fontScope);
      });
    }
  }, [open, html, cfg.fontScale, cfg.fontScope]);

  // Measure rendered height inside iframe to compute page count.
  useEffect(() => {
    if (!open) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    let cancelled = false;
    const measure = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc?.body) return;
        const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
        if (cancelled) return;
        setContentH(h);
        setPageCount(Math.max(1, Math.ceil(h / dims.h)));
      } catch { /* noop */ }
    };
    const t1 = window.setTimeout(measure, 250);
    const onLoad = () => window.setTimeout(measure, 80);
    iframe.addEventListener("load", onLoad);
    return () => { cancelled = true; iframe.removeEventListener("load", onLoad); window.clearTimeout(t1); };
  }, [open, html, dims.h]);

  const fits = pageCount === 1;
  const displayScale = useMemo(() => Math.min(1, 640 / dims.w), [dims.w]);

  // Resolve the page-range string. The shared `parsePageRange` already
  // supports multi-range syntax like `1-3,5,7-9` (see printRange tests),
  // and we use the SAME parser at actual print-time so what you see in the
  // overlays matches what comes out of the printer exactly.
  const trimmedRange = cfg.pageRange.trim();
  const parsedRange = useMemo(
    () => parsePageRange(cfg.pageRange, pageCount),
    [cfg.pageRange, pageCount],
  );
  // Treat any non-empty input that fails to parse as INVALID (parsedRange===null
  // && trimmedRange!==""). Empty input means "all pages".
  const rangeInvalid = trimmedRange.length > 0 && parsedRange === null;
  const selectedPages = useMemo(() => {
    if (trimmedRange.length === 0) {
      return new Set<number>(Array.from({ length: pageCount }, (_, i) => i + 1));
    }
    return parsedRange ?? new Set<number>();
  }, [trimmedRange, parsedRange, pageCount]);
  const printedPages = selectedPages.size;
  const totalSheets = printedPages * Math.max(1, cfg.copies);

  // Auto-persist per-document prefs (debounced) so reopening the same
  // document restores the user's last scale/margins/copies/pageRange even
  // if they close the dialog without clicking "พิมพ์เลย".
  useEffect(() => {
    if (!open || !docId) return;
    if (rangeInvalid) return; // never persist invalid input
    const t = window.setTimeout(() => saveDocPrintPrefs(docId, cfg), 400);
    return () => window.clearTimeout(t);
  }, [open, docId, cfg, rangeInvalid]);

  const patch = (p: Partial<PrintPrefs>) => setCfg((c) => ({ ...c, ...p }));
  const patchMargin = (k: keyof PrintMargins, v: number) =>
    setCfg((c) => ({ ...c, margins: { ...c.margins, [k]: Math.min(30, Math.max(0, Number.isFinite(v) ? v : 10)) } }));

  const isAtDefaults =
    cfg.fontScale === DEFAULT_PRINT_PREFS.fontScale &&
    cfg.fontScope === DEFAULT_PRINT_PREFS.fontScope &&
    cfg.paper === DEFAULT_PRINT_PREFS.paper &&
    cfg.orient === DEFAULT_PRINT_PREFS.orient &&
    cfg.copies === DEFAULT_PRINT_PREFS.copies &&
    cfg.pageRange === DEFAULT_PRINT_PREFS.pageRange &&
    cfg.headerOnce === DEFAULT_PRINT_PREFS.headerOnce &&
    cfg.margins.top === DEFAULT_MARGINS.top &&
    cfg.margins.right === DEFAULT_MARGINS.right &&
    cfg.margins.bottom === DEFAULT_MARGINS.bottom &&
    cfg.margins.left === DEFAULT_MARGINS.left;

  const resetAll = () =>
    setCfg((c) => ({
      ...DEFAULT_PRINT_PREFS,
      margins: { ...DEFAULT_MARGINS },
      rememberSettings: c.rememberSettings, // preserve the toggle itself
    }));

  async function handleConfirm() {
    if (cfg.rememberSettings) savePrintPrefs(cfg);
    if (docId) saveDocPrintPrefs(docId, cfg);
    let reservedPrintWindow: Window | null = null;
    // Reserve a popup synchronously only when we actually need one — i.e.
    // an explicit "popup" mode, or "auto" while running inside an iframe
    // (Lovable preview) where native window.print() can't reach our doc.
    // On PC / top-level tabs, Auto uses window.print() directly, so we
    // must NOT open a blank popup window.
    let inIframe = false;
    try { inIframe = window.top !== window.self; } catch { inIframe = true; }
    const needsReservedPopup =
      cfg.printMode === "popup" || (cfg.printMode === "auto" && inIframe);
    if (needsReservedPopup) {
      try {
        reservedPrintWindow = window.open("", "_blank", "width=900,height=1100");
        if (reservedPrintWindow) {
          reservedPrintWindow.document.open();
          reservedPrintWindow.document.write(
            '<!doctype html><html lang="th"><head><meta charset="utf-8"><title>กำลังเตรียมพิมพ์</title></head><body style="font-family:sans-serif;padding:24px">กำลังเตรียมเอกสารสำหรับพิมพ์…</body></html>',
          );
          reservedPrintWindow.document.close();
        }
      } catch {
        reservedPrintWindow = null;
      }
    }
    onOpenChange(false);
    await onConfirm(cfg, reservedPrintWindow);
  }

  async function handleDownload() {
    if (!onDownloadPdf) return;
    if (cfg.rememberSettings) savePrintPrefs(cfg);
    if (docId) saveDocPrintPrefs(docId, cfg);
    await onDownloadPdf(cfg);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[1080px] max-h-[94vh] overflow-hidden flex flex-col p-0"
        data-testid="pre-print-settings"
      >
        {/* Offscreen stage for snapshotting computed styles. */}
        <div
          ref={stageRef}
          aria-hidden
          style={{
            position: "fixed", left: -99999, top: 0,
            width: dims.w, pointerEvents: "none", visibility: "hidden",
          }}
        >
          {open ? documentNode : null}
        </div>

        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            ตั้งค่าก่อนพิมพ์
            {fits ? (
              <span className="inline-flex items-center gap-1 text-green-600 text-sm font-normal">
                <CheckCircle2 className="h-4 w-4" /> พอดี 1 หน้า
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 text-amber-600 text-sm font-normal"
                data-testid="overflow-warning"
              >
                <AlertTriangle className="h-4 w-4" /> เนื้อหา {pageCount} หน้า
              </span>
            )}
            <span
              className="inline-flex items-center gap-2 text-xs font-normal text-muted-foreground"
              data-testid="pre-print-output-summary"
            >
              <span className="rounded-full bg-muted px-2 py-0.5">
                พิมพ์ {printedPages}/{pageCount} หน้า
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5">
                × {cfg.copies} ชุด
              </span>
              <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 font-medium">
                รวม {totalSheets} แผ่น
              </span>
              {rangeInvalid && (
                <span className="rounded-full bg-destructive/10 text-destructive px-2 py-0.5">
                  ช่วงหน้าไม่ถูกต้อง
                </span>
              )}
            </span>
            <Button
              type="button" size="sm" variant="ghost"
              className="ml-auto"
              onClick={resetAll}
              disabled={isAtDefaults}
              data-testid="pre-print-reset-all"
              title="รีเซ็ตการตั้งค่าการพิมพ์ทั้งหมดเป็นค่าเริ่มต้น"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> รีเซ็ตทั้งหมด
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-[320px_1fr] gap-0 flex-1 overflow-hidden">
          {/* Left: settings controls */}
          <div className="overflow-y-auto px-5 py-3 space-y-4 border-r border-border">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">
                  ขนาดตัวอักษร: <span className="font-mono">{Math.round(cfg.fontScale * 100)}%</span>
                </Label>
                <Button
                  type="button" size="sm" variant="ghost"
                  onClick={() => patch({ fontScale: 1 })}
                  disabled={cfg.fontScale === 1}
                  data-testid="pre-print-reset"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> รีเซ็ต
                </Button>
              </div>
              <Slider
                min={70} max={130} step={5}
                value={[Math.round(cfg.fontScale * 100)]}
                onValueChange={(v) => patch({ fontScale: (v?.[0] ?? 100) / 100 })}
                data-testid="pre-print-font-slider"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">ขอบเขตการย่อ</Label>
              <div className="grid grid-cols-1 gap-2">
                <label className="flex items-start gap-2 text-sm cursor-pointer rounded-md border p-2 hover:bg-muted/40">
                  <input
                    type="radio" name="font-scope" className="mt-0.5"
                    checked={cfg.fontScope === "content"}
                    onChange={() => patch({ fontScope: "content" })}
                  />
                  <span>
                    <b>เฉพาะเนื้อหา</b>
                    <span className="block text-xs text-muted-foreground">ตาราง · ยอดรวม · ลายเซ็น · หมายเหตุ</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm cursor-pointer rounded-md border p-2 hover:bg-muted/40">
                  <input
                    type="radio" name="font-scope" className="mt-0.5"
                    checked={cfg.fontScope === "all"}
                    onChange={() => patch({ fontScope: "all" })}
                  />
                  <span>
                    <b>ทั้งหมด</b>
                    <span className="block text-xs text-muted-foreground">หัวบิล + เนื้อหา + ท้ายบิล</span>
                  </span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">กระดาษ</Label>
                <Select value={cfg.paper} onValueChange={(v) => patch({ paper: v as PaperSize })}>
                  <SelectTrigger className="h-9" data-testid="pre-print-paper"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {documentType === "receipt" && (
                      <SelectItem value="auto-receipt">อัตโนมัติ (19×27 ซม.)</SelectItem>
                    )}
                    <SelectItem value="A4">A4</SelectItem>
                    <SelectItem value="A5">A5</SelectItem>
                    <SelectItem value="Letter">Letter</SelectItem>
                    <SelectItem value="Legal">Legal</SelectItem>
                    <SelectItem value="80mm">80mm (สลิป)</SelectItem>
                    <SelectItem value="custom">กำหนดเอง</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">แนวกระดาษ</Label>
                <Select value={cfg.orient} onValueChange={(v) => patch({ orient: v as "portrait" | "landscape" })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">แนวตั้ง</SelectItem>
                    <SelectItem value="landscape">แนวนอน</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {cfg.paper === "custom" && (
              <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/20 p-2">
                <div className="space-y-1">
                  <Label htmlFor="ppd-custom-w" className="text-xs">กว้าง (มม.)</Label>
                  <Input
                    id="ppd-custom-w"
                    type="number"
                    min={50}
                    max={500}
                    step={1}
                    value={cfg.customPaper.widthMm}
                    onChange={(e) => patch({ customPaper: { ...cfg.customPaper, widthMm: Math.min(500, Math.max(50, Number(e.target.value) || 210)) } })}
                    className="h-9"
                    data-testid="pre-print-custom-width"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ppd-custom-h" className="text-xs">สูง (มม.)</Label>
                  <Input
                    id="ppd-custom-h"
                    type="number"
                    min={50}
                    max={500}
                    step={1}
                    value={cfg.customPaper.heightMm}
                    onChange={(e) => patch({ customPaper: { ...cfg.customPaper, heightMm: Math.min(500, Math.max(50, Number(e.target.value) || 297)) } })}
                    className="h-9"
                    data-testid="pre-print-custom-height"
                  />
                </div>
                <p className="col-span-2 text-[10px] text-muted-foreground">ใช้จริง: {paperMm.w}×{paperMm.h} มม.</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="ppd-copies" className="text-xs">จำนวนสำเนา</Label>
                <Input
                  id="ppd-copies" type="number" min={1} max={10}
                  value={cfg.copies}
                  onChange={(e) => patch({ copies: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })}
                  className="h-9" data-testid="pre-print-copies"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ppd-range" className="text-xs">ช่วงหน้า</Label>
                <Input
                  id="ppd-range" placeholder="ทั้งหมด เช่น 1,3,5-7"
                  value={cfg.pageRange}
                  onChange={(e) => patch({ pageRange: e.target.value })}
                  className="h-9" data-testid="pre-print-range"
                  aria-invalid={rangeInvalid || undefined}
                />
                <p className="text-[10px] text-muted-foreground">
                  รองรับหลายช่วง เช่น <code>1-3,5,7-9</code>
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={cfg.rememberSettings}
                onCheckedChange={(v) => patch({ rememberSettings: !!v })}
                data-testid="pre-print-remember"
              />
              จดจำการตั้งค่านี้ไว้ใช้ครั้งหน้า
            </label>

            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <Label className="text-sm">ระยะขอบกระดาษ (มม.)</Label>
                <Button
                  type="button" size="sm" variant="ghost"
                  onClick={() => patch({ margins: { ...DEFAULT_MARGINS } })}
                  data-testid="pre-print-margins-reset"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> รีเซ็ตขอบ
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(["top","right","bottom","left"] as const).map((k) => (
                  <div key={k} className="space-y-1">
                    <Label htmlFor={`ppd-m-${k}`} className="text-xs">
                      {k === "top" ? "บน" : k === "right" ? "ขวา" : k === "bottom" ? "ล่าง" : "ซ้าย"}
                    </Label>
                    <Input
                      id={`ppd-m-${k}`}
                      type="number" min={0} max={30} step={0.5}
                      value={cfg.margins[k]}
                      onChange={(e) => patchMargin(k, Number(e.target.value))}
                      className="h-9"
                      data-testid={`pre-print-margin-${k}`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm cursor-pointer pt-2 border-t">
              <Checkbox
                checked={cfg.headerOnce}
                onCheckedChange={(v) => patch({ headerOnce: !!v })}
                data-testid="pre-print-header-once"
                className="mt-0.5"
              />
              <span>
                <b>แสดงหัวบิลเฉพาะหน้าแรก</b>
                <span className="block text-xs text-muted-foreground">เอกสาร 2 หน้าขึ้นไป — หน้าถัดไปจะแสดงเฉพาะตารางรายการต่อเนื่อง</span>
              </span>
            </label>

            <p className="text-[11px] text-muted-foreground">
              เครื่องพิมพ์: เลือกในกล่องโต้ตอบของเบราว์เซอร์หลังกด "พิมพ์เลย"
            </p>

            <div className="space-y-1 pt-2 border-t">
              <Label htmlFor="ppd-print-mode" className="text-sm">โหมดการส่งพิมพ์</Label>
              <Select
                value={cfg.printMode}
                onValueChange={(v) => patch({ printMode: v as PrintPrefs["printMode"] })}
              >
                <SelectTrigger id="ppd-print-mode" className="h-9" data-testid="pre-print-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">อัตโนมัติ (แนะนำ)</SelectItem>
                  <SelectItem value="native">Native — window.print()</SelectItem>
                  <SelectItem value="popup">Popup — เปิดหน้าต่างใหม่</SelectItem>
                  <SelectItem value="iframe">Hidden iframe (สำหรับ iOS/in-app)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                ถ้าอุปกรณ์เฉพาะพิมพ์ไม่ออก ลองเปลี่ยนโหมดนี้ — ระบบจะจดจำไว้เมื่อติ๊ก "จดจำการตั้งค่านี้"
              </p>
            </div>
          </div>

          {/* Right: real-size preview */}
          <div className="overflow-auto bg-muted/40 p-4" data-testid="pre-print-preview-scroll">
            <div
              className="relative mx-auto bg-white shadow-md"
              style={{
                width: dims.w * displayScale,
                height: Math.max(dims.h, contentH) * displayScale,
              }}
            >
              <iframe
                ref={iframeRef}
                title="พรีวิวก่อนพิมพ์"
                srcDoc={html}
                data-testid="pre-print-iframe"
                style={{
                  width: dims.w, height: Math.max(dims.h, contentH),
                  transform: `scale(${displayScale})`,
                  transformOrigin: "top left",
                  border: "none", background: "#fff",
                }}
              />
              {Array.from({ length: pageCount - 1 }, (_, i) => i + 1).map((i) => (
                <div
                  key={i} aria-hidden
                  style={{
                    position: "absolute", left: 0, right: 0,
                    top: i * dims.h * displayScale,
                    borderTop: "2px dashed #ef4444", pointerEvents: "none",
                  }}
                >
                  <span style={{
                    position: "absolute", top: -10, right: 4,
                    background: "#ef4444", color: "#fff", fontSize: 10,
                    padding: "1px 6px", borderRadius: 3,
                  }}>ขึ้นหน้า {i + 1}</span>
                </div>
              ))}
              {/* Real-time per-page overlay reflecting pageRange selection. */}
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNo) => {
                const included = selectedPages.has(pageNo);
                return (
                  <div
                    key={`pg-${pageNo}`} aria-hidden
                    data-testid={`pre-print-page-overlay-${pageNo}`}
                    data-included={included ? "1" : "0"}
                    style={{
                      position: "absolute", left: 0, right: 0,
                      top: (pageNo - 1) * dims.h * displayScale,
                      height: dims.h * displayScale,
                      pointerEvents: "none",
                      background: included
                        ? "transparent"
                        : "repeating-linear-gradient(45deg, rgba(148,163,184,0.18) 0 10px, rgba(148,163,184,0.32) 10px 20px)",
                      transition: "background 120ms linear",
                    }}
                  >
                    <span style={{
                      position: "absolute", top: 6, left: 6,
                      background: included ? "rgba(16,185,129,0.92)" : "rgba(100,116,139,0.92)",
                      color: "#fff", fontSize: 10, padding: "2px 6px", borderRadius: 4,
                    }}>
                      {included ? `พิมพ์หน้า ${pageNo}` : `ข้ามหน้า ${pageNo}`}
                    </span>
                    {cfg.copies > 1 && included && (
                      <span style={{
                        position: "absolute", top: 6, right: 6,
                        background: "rgba(37,99,235,0.92)", color: "#fff",
                        fontSize: 10, padding: "2px 6px", borderRadius: 4,
                      }}>× {cfg.copies}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2 px-5 py-3 border-t border-border">
          {onDownloadPdf && (
            <>
              <div className="mr-auto text-[11px] text-muted-foreground hidden sm:block">
                เลือกได้ระหว่าง <b>บันทึกเป็น PDF</b> หรือ <b>พิมพ์กระดาษ</b>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleDownload()}
                data-testid="pre-print-save-pdf"
                disabled={rangeInvalid || printedPages === 0}
                title="บันทึกเอกสารเป็นไฟล์ PDF โดยไม่ต้องใช้เครื่องพิมพ์"
              >
                <Download className="h-4 w-4 mr-1.5" /> บันทึกเป็น PDF
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button
            onClick={() => void handleConfirm()}
            data-testid="pre-print-confirm"
            disabled={rangeInvalid || printedPages === 0}
          >
            <Printer className="h-4 w-4 mr-1.5" />
            พิมพ์เลย ({printedPages} หน้า × {cfg.copies} ชุด = {totalSheets} แผ่น)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}