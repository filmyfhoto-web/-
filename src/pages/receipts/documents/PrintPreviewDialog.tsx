import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Bug, CheckCircle2, AlertTriangle, Lock } from "lucide-react";
import { buildPrintHtml } from "../lib/printWindow";
import { isPrintDebugEnabled, setPrintDebug } from "../lib/printDebug";
import type { ReactNode } from "react";

type PaperSize = "A4" | "A5" | "80mm";

/** Paper dimensions in CSS px at 96dpi (browser print spec). */
const PAPER_PX: Record<PaperSize, { w: number; h: number }> = {
  A4: { w: 794, h: 1123 },
  A5: { w: 559, h: 794 },
  "80mm": { w: 302, h: 755 },
};

export interface PrintPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The fully-rendered DocumentPreview node. PrintPreviewDialog renders
   * it offscreen (laid out, not display:none) so computed styles can be
   * snapshotted into the preview iframe.
   */
  documentNode: ReactNode;
  paper: PaperSize;
  fontScale?: number; // 0.6 – 1.2
  onConfirmPrint: () => void;
  /**
   * When true, the preview surface is replaced with a locked-state
   * placeholder (used when the current user isn't allowed to view
   * embedded store attachments). Keeps parity with the Settings tab
   * gate so the message the user sees is consistent everywhere.
   */
  locked?: boolean;
  lockedMessage?: string;
}

export function PrintPreviewDialog({
  open,
  onOpenChange,
  documentNode,
  paper,
  fontScale,
  onConfirmPrint,
  locked = false,
  lockedMessage,
}: PrintPreviewDialogProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [pageCount, setPageCount] = useState(1);
  const [contentHeight, setContentHeight] = useState(0);
  const [debug, setDebug] = useState(isPrintDebugEnabled());
  const [html, setHtml] = useState("");
  const [viewport, setViewport] = useState<{ w: number; h: number }>(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 1024,
    h: typeof window !== "undefined" ? window.innerHeight : 768,
  }));
  const dims = PAPER_PX[paper];

  // Track viewport size so the preview surface reflows on mobile/tablet
  // rotate and resize without clipping the paper.
  useEffect(() => {
    const onResize = () =>
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  // Snapshot the offscreen stage AFTER it lays out. Re-runs whenever
  // the dialog opens or paper size changes.
  useEffect(() => {
    if (!open) {
      setHtml("");
      return;
    }
    let raf = 0;
    let cancelled = false;
    const snap = () => {
      if (cancelled) return;
      const stage = stageRef.current;
      const src =
        (stage?.querySelector("#doc-print") as HTMLElement | null) ?? stage;
      if (!src) return;
      const paperSize =
        paper === "80mm" ? "80mm 200mm" : paper === "A5" ? "A5" : "A4";
      setHtml(
        buildPrintHtml({
          bodyHtml: src.outerHTML,
          sourceEl: src,
          paperSize,
          orient: "portrait",
          bodyClass: "is-printing print-preview-surface",
        })
      );
    };
    // Wait for fonts + two frames for layout. Safari/iOS often paint
    // the offscreen stage before Thai webfonts finish loading, which
    // produced a blank preview iframe on first open.
    const kick = () => {
      raf = window.requestAnimationFrame(() =>
        window.requestAnimationFrame(snap)
      );
    };
    try {
      // @ts-ignore
      const p = document?.fonts?.ready;
      if (p && typeof p.then === "function") p.then(kick, kick);
      else kick();
    } catch { kick(); }
    // Safety net: guarantee a snapshot even if fonts.ready never resolves.
    const safety = window.setTimeout(snap, 600);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      window.clearTimeout(safety);
    };
  }, [open, paper, documentNode]);

  // Measure content height inside the iframe → derive page count.
  useEffect(() => {
    if (!open) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    let raf = 0;
    let cancelled = false;
    const measure = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc || !doc.body) return;
        const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
        if (cancelled) return;
        setContentHeight(h);
        setPageCount(Math.max(1, Math.ceil(h / dims.h)));
      } catch { /* noop */ }
    };
    const onLoad = () => {
      // Allow layout to settle.
      raf = window.setTimeout(measure, 80) as unknown as number;
    };
    iframe.addEventListener("load", onLoad);
    // Re-measure after a beat in case load fired before listener attached.
    raf = window.setTimeout(measure, 250) as unknown as number;
    return () => {
      cancelled = true;
      iframe.removeEventListener("load", onLoad);
      window.clearTimeout(raf);
    };
  }, [open, html, dims.h]);

  const fits = pageCount === 1;
  // Reserve chrome for header/footer/padding, then fit the paper into
  // whichever axis is tightest — width on phones, height on desktops.
  const chromeH = 200;
  const chromeW = 48;
  const availW = Math.max(240, viewport.w - chromeW);
  const availH = Math.max(320, viewport.h - chromeH);
  const displayScale = Math.min(1, availW / dims.w, availH / dims.h);

  const lastDiag =
    typeof window !== "undefined" ? window.__lovablePrintDiagnostics : undefined;

  // Build absolute page-break dashed lines overlaying the scaled iframe.
  const breakLines = Array.from({ length: pageCount - 1 }, (_, i) => i + 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 w-screen h-[100dvh] max-w-none max-h-none sm:h-auto sm:max-h-[92vh] sm:w-[92vw] sm:max-w-[960px] sm:rounded-lg rounded-none overflow-hidden flex flex-col"
      >
        {/* Offscreen stage: laid out (NOT display:none) so getComputedStyle
            returns real values for the snapshot. Visually clipped from view. */}
        <div
          ref={stageRef}
          aria-hidden
          style={{
            position: "fixed",
            left: -99999,
            top: 0,
            width: dims.w,
            pointerEvents: "none",
            visibility: "hidden",
          }}
        >
          {open ? documentNode : null}
        </div>

        <DialogHeader className="px-4 pt-4 pb-2 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            พรีวิวก่อนพิมพ์ ({paper})
            {fits ? (
              <span className="inline-flex items-center gap-1 text-green-600 text-sm font-normal">
                <CheckCircle2 className="h-4 w-4" /> พอดี 1 หน้า
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-600 text-sm font-normal">
                <AlertTriangle className="h-4 w-4" /> เกิน {pageCount} หน้า
              </span>
            )}
            {typeof fontScale === "number" ? (
              <span className="text-xs text-muted-foreground font-normal">
                · ตัวอักษร {Math.round(fontScale * 100)}%
              </span>
            ) : null}
          </DialogTitle>
        </DialogHeader>

        <div
          className="flex-1 overflow-auto bg-muted/40 p-2 sm:p-4"
          data-testid="print-preview-scroll"
        >
          {locked ? (
            <div className="h-full min-h-[240px] flex flex-col items-center justify-center gap-2 text-center px-6 py-10 rounded-md border border-dashed border-border bg-background/60">
              <Lock className="h-8 w-8 text-muted-foreground" />
              <div className="font-medium">พรีวิวถูกจำกัดสิทธิ์</div>
              <p className="text-sm text-muted-foreground max-w-md">
                {lockedMessage ??
                  "เฉพาะแอดมิน/เจ้าของร้านที่ได้รับอนุญาตเท่านั้นที่สามารถดูไฟล์เอกสารแนบของร้านในหน้าพรีวิวก่อนพิมพ์ได้"}
              </p>
            </div>
          ) : (
          <div
            className="relative mx-auto bg-white shadow-md"
            style={{
              width: dims.w * displayScale,
              height: Math.max(dims.h, contentHeight) * displayScale,
            }}
          >
            <iframe
              ref={iframeRef}
              title="พรีวิวก่อนพิมพ์"
              srcDoc={html}
              data-testid="print-preview-iframe"
              style={{
                width: dims.w,
                height: Math.max(dims.h, contentHeight),
                transform: `scale(${displayScale})`,
                transformOrigin: "top left",
                border: "none",
                background: "#ffffff",
              }}
            />
            {/* Page break overlays */}
            {breakLines.map((i) => (
              <div
                key={i}
                aria-hidden
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: i * dims.h * displayScale,
                  borderTop: "2px dashed #ef4444",
                  pointerEvents: "none",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: -10,
                    right: 4,
                    background: "#ef4444",
                    color: "white",
                    fontSize: 10,
                    padding: "1px 6px",
                    borderRadius: 3,
                  }}
                >
                  ขึ้นหน้า {i + 1}
                </span>
              </div>
            ))}
          </div>
          )}
        </div>

        {debug && lastDiag ? (
          <details className="text-xs bg-muted/50 rounded p-2 max-h-32 overflow-auto mx-2 sm:mx-4">
            <summary className="cursor-pointer">Debug: print diagnostics</summary>
            <pre className="whitespace-pre-wrap break-all">
              {JSON.stringify(lastDiag, null, 2)}
            </pre>
          </details>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2 px-4 py-3 border-t border-border bg-background flex-row flex-wrap">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              const next = !debug;
              setPrintDebug(next);
              setDebug(next);
            }}
            title="Toggle print debug mode"
          >
            <Bug className="h-3.5 w-3.5 mr-1" />
            {debug ? "Debug ON" : "Debug"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button
            data-testid="print-preview-confirm"
            disabled={locked}
            onClick={() => {
              onOpenChange(false);
              onConfirmPrint();
            }}
          >
            <Printer className="h-4 w-4 mr-1.5" /> พิมพ์เลย
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}