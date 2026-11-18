/**
 * Shared paper-size + auto-fit-scale math for the whole print pipeline.
 *
 * Every print surface (receipt/document/invoice preview) should read paper
 * dimensions from `PAPER_SIZES` here instead of hard-coding mm literals, and
 * use `computeFitScale` for the "fit to screen" / "พอดีกระดาษอัตโนมัติ" math
 * so behaviour stays identical across components.
 */
import { A4_PAGE } from "@/pages/receipts/lib/paperConstants";

export type PaperKey = "A4" | "A5" | "80mm" | "100x70" | "100x75";

export interface PaperSizeMm {
  widthMm: number;
  heightMm: number;
}

/** Physical paper size in millimetres (portrait / base orientation). */
export const PAPER_SIZES: Record<PaperKey, PaperSizeMm> = Object.freeze({
  A4: { widthMm: A4_PAGE.widthMm, heightMm: A4_PAGE.heightMm },
  A5: { widthMm: 148, heightMm: 210 },
  "80mm": { widthMm: 80, heightMm: 200 },
  "100x70": { widthMm: 100, heightMm: 70 },
  "100x75": { widthMm: 100, heightMm: 75 },
});

export function getPaperSizeMm(
  paper: PaperKey,
  orient: "portrait" | "landscape" = "portrait",
): PaperSizeMm {
  const base = PAPER_SIZES[paper] ?? PAPER_SIZES.A4;
  return orient === "landscape"
    ? { widthMm: base.heightMm, heightMm: base.widthMm }
    : base;
}

const MM_TO_PX = 96 / 25.4;

/** Convert a millimetre length to CSS pixels at the standard 96dpi CSS reference. */
export function mmToPx(mm: number): number {
  return mm * MM_TO_PX;
}

export const MIN_AUTO_FIT_SCALE = 0.75;
export const MAX_SCALE = 1;

/**
 * Floor for the *on-screen viewport* fit scale. Unrelated to
 * `MIN_AUTO_FIT_SCALE` (which shrinks content inside the paper when printing):
 * a phone at 390px must be able to render A4 at ~0.4–0.5 so the sheet fits.
 */
export const MIN_VIEWPORT_SCALE = 0.15;

/**
 * Fit a paper sheet of `contentWidthPx` into `containerWidthPx` on screen.
 * Shrinks as far as needed (down to `MIN_VIEWPORT_SCALE`) and never upscales.
 */
export function computeViewportFitScale(
  contentWidthPx: number,
  containerWidthPx: number,
  minScale: number = MIN_VIEWPORT_SCALE,
): number {
  if (!contentWidthPx || !containerWidthPx) return MAX_SCALE;
  return Math.max(minScale, Math.min(MAX_SCALE, containerWidthPx / contentWidthPx));
}

/**
 * ความสูงที่ wrapper ต้องจองไว้ เพื่อไม่ให้เอกสารหลายหน้าที่ถูกย่อ
 * ถูกตัดท้าย (overflow:hidden) หรือทับ UI ที่อยู่ถัดไป
 */
export function computeWrapperHeightPx(
  paperHeightPx: number,
  contentHeightPx: number,
  scale: number,
): number {
  return Math.max(paperHeightPx || 0, contentHeightPx || 0) * (scale || 1);
}

/**
 * Compute the scale factor needed to fit a `contentPx` sized box inside a
 * `containerPx` sized box, never upscaling past 1 and never downscaling past
 * `minScale` (so text never becomes unreadable via the auto-fit preset).
 *
 * Returns 1 when the container has no measurable size yet (avoids
 * divide-by-zero / NaN flashes before ResizeObserver has fired).
 */
export function computeFitScale(
  contentPx: { width: number; height: number },
  containerPx: { width: number; height: number },
  opts: { minScale?: number; maxScale?: number } = {},
): number {
  const minScale = opts.minScale ?? MIN_AUTO_FIT_SCALE;
  const maxScale = opts.maxScale ?? MAX_SCALE;
  if (!contentPx.width || !contentPx.height || !containerPx.width || !containerPx.height) {
    return maxScale;
  }
  const scaleW = containerPx.width / contentPx.width;
  const scaleH = containerPx.height / contentPx.height;
  const raw = Math.min(scaleW, scaleH, maxScale);
  return Math.max(minScale, raw);
}

/**
 * "พอดีกระดาษอัตโนมัติ" preset: only shrinks (never grows) content that
 * overflows the printable area, clamped to `MIN_AUTO_FIT_SCALE` so small
 * documents are left at 1:1 and long ones stay legible.
 */
export function computeAutoFitScale(
  contentPx: { width: number; height: number },
  printableAreaPx: { width: number; height: number },
): number {
  if (!contentPx.height || !printableAreaPx.height) return 1;
  if (contentPx.height <= printableAreaPx.height && contentPx.width <= printableAreaPx.width) {
    return 1;
  }
  return computeFitScale(contentPx, printableAreaPx, { minScale: MIN_AUTO_FIT_SCALE, maxScale: 1 });
}

/**
 * Shared `@media print { transform: none }` guard + base print rules used by
 * every print surface. Import this string into component-level `<style>`
 * tags or inject once globally — never duplicate these rules per file.
 */
export const SHARED_PRINT_CSS = `
  .paper-viewport { overflow: hidden; }
  .paper-viewport__sheet {
    transform-origin: top center;
    background: #ffffff;
  }
  @media print {
    .paper-viewport { overflow: visible !important; }
    .paper-viewport__sheet { transform: none !important; }
    .no-print, [data-no-print] { display: none !important; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    table { width: 100%; table-layout: fixed; }
    table, td, th { word-break: break-word; overflow-wrap: anywhere; }
    thead { display: table-header-group; }
    tr, .summary-block, .signature-block { break-inside: avoid; page-break-inside: avoid; }
  }
`;
