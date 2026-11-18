import { useLayoutEffect, useRef, useState, useCallback } from "react";
import { mmToPx, MIN_VIEWPORT_SCALE, computeViewportFitScale, computeWrapperHeightPx } from "@/lib/printScale";

export interface UsePaperScaleOptions {
  /** Paper width in millimetres (portrait/base orientation already resolved). */
  widthMm: number;
  /** Paper height in millimetres. */
  heightMm: number;
  /**
   * Floor for the on-screen fit scale (default `MIN_VIEWPORT_SCALE`).
   * NOTE: this is the *screen viewport* floor and is deliberately far below
   * `MIN_AUTO_FIT_SCALE` (0.75) — A4 on a 390px phone must be able to shrink
   * to ~0.4–0.5, otherwise the sheet overflows the screen horizontally.
   */
  minScale?: number;
  /** Disable scaling entirely (e.g. print mode). */
  disabled?: boolean;
  /**
   * Manual zoom override. `null`/`undefined` = fit mode (shared helper math).
   * A number is used verbatim (still never negative), so a preview can offer
   * 100% / +- zoom buttons without a second fit formula.
   */
  scaleOverride?: number | null;
  /**
   * Freeze the current scale (e.g. while a multi-copy print run dispatches),
   * so reflow during beforeprint/afterprint can't nudge copies to a
   * different scale.
   */
  freezeScale?: boolean;
}

export interface UsePaperScaleResult {
  containerRef: React.RefObject<HTMLDivElement>;
  sheetRef: React.RefObject<HTMLDivElement>;
  scale: number;
  widthPx: number;
  heightPx: number;
  /** Rendered (unscaled) content height in px — 0 until first measure. */
  contentHeightPx: number;
  /** Height (px) the wrapper should reserve so scaled content doesn't clip/overlap siblings. */
  wrapperHeightPx: number;
}

/**
 * Keeps a paper "sheet" at true mm size in the DOM, then measures the
 * surrounding container with ResizeObserver and applies a CSS
 * `transform: scale()` (only) so the sheet fits without horizontal overflow
 * or clipped bottoms. Never scales while printing — callers must render the
 * sheet with `transform: none` under `@media print` (see SHARED_PRINT_CSS).
 */
export function usePaperScale({
  widthMm,
  heightMm,
  minScale = MIN_VIEWPORT_SCALE,
  disabled = false,
  scaleOverride = null,
  freezeScale = false,
}: UsePaperScaleOptions): UsePaperScaleResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  /** Rendered (unscaled) height of the sheet — may exceed one physical page. */
  const [sheetHeightPx, setSheetHeightPx] = useState(0);
  const scaleRef = useRef(1);

  const widthPx = mmToPx(widthMm);
  const heightPx = mmToPx(heightMm);

  const recompute = useCallback(() => {
    // วัดความสูงจริงของเนื้อหาเสมอ (เอกสารหลายหน้าสูงกว่ากระดาษ 1 แผ่น)
    const sheetEl = sheetRef.current;
    if (sheetEl) {
      setSheetHeightPx(
        Math.max(sheetEl.scrollHeight, sheetEl.getBoundingClientRect().height / (scaleRef.current || 1)),
      );
    }
    // แช่สเกลไว้ระหว่างพิมพ์หลายชุด — ห้ามคำนวณใหม่
    if (freezeScale) return;
    // ผู้ใช้เลือกซูมเอง (เช่น 100%) → ใช้ค่านั้นตรง ๆ ไม่ต้อง fit
    if (scaleOverride != null && Number.isFinite(scaleOverride)) {
      const manual = Math.max(0.05, scaleOverride);
      scaleRef.current = manual;
      setScale(manual);
      return;
    }
    if (disabled) {
      scaleRef.current = 1;
      setScale(1);
      return;
    }
    const containerWidth = containerRef.current?.clientWidth ?? 0;
    if (!containerWidth || !widthPx) {
      scaleRef.current = 1;
      setScale(1);
      return;
    }
    // ย่อได้ตามพื้นที่จริง แต่ห้ามขยายเกิน 1 (ตัวอักษรไทยจะเบลอ)
    const next = computeViewportFitScale(widthPx, containerWidth, minScale);
    scaleRef.current = next;
    setScale(next);
  }, [disabled, minScale, widthPx, scaleOverride, freezeScale]);

  useLayoutEffect(() => {
    recompute();
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => recompute());
    ro.observe(el);
    if (sheetRef.current) ro.observe(sheetRef.current);
    return () => ro.disconnect();
  }, [recompute]);

  return {
    containerRef,
    sheetRef,
    scale,
    widthPx,
    heightPx,
    contentHeightPx: sheetHeightPx,
    // จองพื้นที่ตามเนื้อหาจริง ไม่ให้ overflow:hidden ตัดท้ายเอกสารหลายหน้า
    wrapperHeightPx: computeWrapperHeightPx(heightPx, sheetHeightPx, scale),
  };
}
