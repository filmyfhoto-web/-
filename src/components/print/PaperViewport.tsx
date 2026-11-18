import { CSSProperties, ReactNode } from "react";
import { usePaperScale } from "@/hooks/usePaperScale";
import { PAPER_SIZES, PaperKey, MIN_VIEWPORT_SCALE } from "@/lib/printScale";

interface PaperViewportProps {
  paper: PaperKey;
  orient?: "portrait" | "landscape";
  /**
   * Never shrink below this scale. Default is the shared screen-fit floor
   * (`MIN_VIEWPORT_SCALE`, ~0.15), NOT 1 — so an A4 sheet always fits a 390px
   * phone. Pass a higher floor (e.g. 0.75) only for readability-locked
   * presets; passing 1 disables fitting and causes horizontal overflow.
   */
  minScale?: number;
  /** Manual zoom (null = fit mode via shared helper). Backward-compatible. */
  scaleOverride?: number | null;
  /** Freeze the current scale (multi-copy print runs). */
  freezeScale?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Shared on-screen "paper sheet" wrapper: renders `children` at true mm size,
 * then scales the whole sheet down (via CSS transform) so it never overflows
 * its container horizontally, on any device width. Printing is unaffected —
 * `@media print { transform: none }` is applied by SHARED_PRINT_CSS.
 */
export function PaperViewport({
  paper,
  orient = "portrait",
  minScale = MIN_VIEWPORT_SCALE,
  scaleOverride = null,
  freezeScale = false,
  className,
  children,
}: PaperViewportProps) {
  const base = PAPER_SIZES[paper] ?? PAPER_SIZES.A4;
  const widthMm = orient === "landscape" ? base.heightMm : base.widthMm;
  const heightMm = orient === "landscape" ? base.widthMm : base.heightMm;
  const { containerRef, sheetRef, scale, widthPx, heightPx, wrapperHeightPx } = usePaperScale({
    widthMm,
    heightMm,
    minScale,
    scaleOverride,
    freezeScale,
  });

  const wrapperStyle: CSSProperties = {
    height: wrapperHeightPx || undefined,
    width: "100%",
    display: "flex",
    justifyContent: "center",
    overflow: "hidden",
  };

  const sheetStyle: CSSProperties = {
    width: widthPx,
    minHeight: heightPx,
    transform: `scale(${scale})`,
    transformOrigin: "top center",
    flex: "0 0 auto",
  };

  return (
    <div ref={containerRef} className={`paper-viewport ${className ?? ""}`.trim()} style={wrapperStyle}>
      <div ref={sheetRef} className="paper-viewport__sheet" style={sheetStyle}>
        {children}
      </div>
    </div>
  );
}
