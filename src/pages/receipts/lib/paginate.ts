/**
 * Deterministic main-document pagination.
 *
 * Splits the item list (and trailer block: totals + signature + notes +
 * footer) across one or more `.doc-page` sections so that the on-screen
 * preview shows the exact same number of pages that Print / PDF / PNG /
 * JPG will produce. The algorithm is intentionally pure and deterministic
 * (no DOM measurement) so it runs identically in jsdom tests, SSR and
 * exporters, and never oscillates.
 *
 * Contract:
 *  - Rows are never split mid-item. Multi-line descriptions stay together.
 *  - The first page carries the full header. Subsequent pages carry a
 *    compact header (doc-type + doc-no + customer name).
 *  - The trailer (totals + signature + notes + footer) only renders on
 *    the last page. If it doesn't fit alongside the remaining items, a
 *    dedicated trailer-only page is appended.
 *  - The items table header repeats on every page that has items.
 */

import type { PaperSize } from "../documents/useDocumentForm";
import { asCustomPaper, PAPER_SIZE_MM_BASE } from "./printPrefs";

export interface PaginateItem {
  /** Description line count (0 or number of newlines + 1 when present). */
  descLines: number;
  /** Approximate character width of the item name — long names wrap. */
  nameLen: number;
}

export interface PaginateInput {
  paperSize: PaperSize;
  orient: "portrait" | "landscape";
  customPaper?: { widthMm?: number; heightMm?: number } | null;
  marginsMm: { top: number; right: number; bottom: number; left: number };
  fontScale: number;
  items: PaginateItem[];
  /** Estimated trailer height in mm at fontScale = 1. */
  trailerMm: number;
  /**
   * Real measured height (mm) of the rendered first-page header block
   * (`.doc-header-group`). When provided it replaces the tuned constant, so
   * page capacity reflects the actual header instead of an assumed size.
   */
  headerFullMm?: number | null;
  /** Real measured height (mm) of the compact header on pages 2+. */
  headerCompactMm?: number | null;
  /** Blocks that are part of the final trailer and should be reported if the
   *  trailer has to move to its own page. */
  trailerBlocks?: ("notes" | "amountWords" | "signature")[];

}

export interface PaginationMoveWarning {
  block: "notes" | "amountWords" | "signature";
  label: string;
  fromPage: number;
  toPage: number;
}

export interface PaginatePage {
  /** Zero-based index of the first item on this page. */
  startIndex: number;
  /** Number of items on this page (may be 0 on a pure-trailer page). */
  count: number;
  isFirst: boolean;
  isLast: boolean;
  /** Only true when the trailer (totals+signature+notes) is rendered here. */
  hasTrailer: boolean;
  warnings?: PaginationMoveWarning[];
  /** Paper dimensions applied to this page (mm), respecting orientation. */
  widthMm: number;
  heightMm: number;
}

export const PAPER_MM_BASE = PAPER_SIZE_MM_BASE;

/** Fallback layout heights (mm) at fontScale = 1, used only when the real
 *  rendered header has not been measured yet. */
export const HEADER_FULL_MM = 62;
export const HEADER_COMPACT_MM = 18;
const ITEMS_HEADER_MM = 9;
const ROW_BASE_MM = 8;
const DESC_LINE_MM = 4;
const SAFETY_MM = 4;

/**
 * Last real measurement of the rendered header block, in mm. The preview
 * measures `.doc-header-group` in the DOM and publishes it here so the
 * paginator reserves the header's true height instead of a tuned guess.
 */
let measuredHeaderMm: { full: number | null; compact: number | null } = { full: null, compact: null };

export function setMeasuredHeaderMm(next: { full?: number | null; compact?: number | null }): void {
  measuredHeaderMm = {
    full: next.full === null
      ? null
      : next.full != null && next.full > 5
        ? Math.round(next.full * 10) / 10
        : measuredHeaderMm.full,
    compact: next.compact === null
      ? null
      : next.compact != null && next.compact > 3
        ? Math.round(next.compact * 10) / 10
        : measuredHeaderMm.compact,
  };
}

export function getMeasuredHeaderMm(): { full: number | null; compact: number | null } {
  return measuredHeaderMm;
}

export function clearMeasuredHeaderMm(): void {
  measuredHeaderMm = { full: null, compact: null };
}


function paperDims(paper: PaperSize, orient: "portrait" | "landscape", customPaper?: PaginateInput["customPaper"]) {
  const base = paper === "custom"
    ? (() => {
        const c = asCustomPaper(customPaper);
        return { w: c.widthMm, h: c.heightMm };
      })()
    : (PAPER_MM_BASE[paper as Exclude<PaperSize, "custom">] ?? PAPER_MM_BASE.A4);
  return orient === "landscape" ? { w: base.h, h: base.w } : base;
}

const BLOCK_LABEL: Record<PaginationMoveWarning["block"], string> = {
  notes: "หมายเหตุ",
  amountWords: "จำนวนเงินตัวอักษร",
  signature: "ลายเซ็น/ผู้รับเงิน",
};

export function rowHeightMm(item: PaginateItem, fontScale: number): number {
  const desc = Math.max(0, item.descLines);
  return (ROW_BASE_MM + desc * DESC_LINE_MM) * fontScale;
}

export function paginateMainDocument(input: PaginateInput): PaginatePage[] {
  const { paperSize, orient, customPaper, marginsMm, fontScale, items, trailerMm } = input;
  const dims = paperDims(paperSize, orient, customPaper);
  const contentH = Math.max(40, dims.h - marginsMm.top - marginsMm.bottom);
  const scale = Math.max(0.5, Number(fontScale) || 1);

  const headerFull = Number(input.headerFullMm) > 5 ? Number(input.headerFullMm) : HEADER_FULL_MM;
  const headerCompact = Number(input.headerCompactMm) > 3 ? Number(input.headerCompactMm) : HEADER_COMPACT_MM;

  const heightFor = (isFirst: boolean, withTrailer: boolean) => {
    // The rendered header block (.doc-header-group) is pinned to
    // `--doc-font-scale: 1` in print CSS, so it does NOT shrink with the
    // document font scale. Reserve its real measured height (or the tuned
    // fallback) regardless of `scale`, otherwise "fit on one page"
    // under-reserves and the sheet silently spills onto a second page.
    const header = isFirst ? headerFull : headerCompact;
    const itemsHeader = ITEMS_HEADER_MM * scale;
    const trailer = withTrailer ? trailerMm * scale : 0;
    return Math.max(20, contentH - header - itemsHeader - trailer - SAFETY_MM);
  };


  const pages: PaginatePage[] = [];
  let i = 0;
  let isFirst = true;

  // Empty item list still yields one page for the trailer + header.
  if (items.length === 0) {
    pages.push({
      startIndex: 0,
      count: 0,
      isFirst: true,
      isLast: true,
      hasTrailer: true,
      widthMm: dims.w,
      heightMm: dims.h,
    });
    return pages;
  }

  while (i < items.length) {
    // Speculatively try to fit remaining items PLUS the trailer on this page.
    const availWithTrailer = heightFor(isFirst, true);
    let usedWith = 0;
    let fitWithTrailer = i;
    for (let j = i; j < items.length; j++) {
      const rh = rowHeightMm(items[j], scale);
      if (usedWith + rh > availWithTrailer) break;
      usedWith += rh;
      fitWithTrailer = j + 1;
    }
    if (fitWithTrailer === items.length) {
      pages.push({
        startIndex: i,
        count: items.length - i,
        isFirst,
        isLast: true,
        hasTrailer: true,
        widthMm: dims.w,
        heightMm: dims.h,
      });
      i = items.length;
      break;
    }

    // Trailer doesn't fit here — pack as many items as possible without trailer,
    // then continue to the next page.
    const availNoTrailer = heightFor(isFirst, false);
    let usedNo = 0;
    let fitNoTrailer = i;
    for (let j = i; j < items.length; j++) {
      const rh = rowHeightMm(items[j], scale);
      if (usedNo + rh > availNoTrailer) break;
      usedNo += rh;
      fitNoTrailer = j + 1;
    }
    // Guarantee forward progress: even if a single row is taller than the
    // available area, place it on its own page rather than looping forever.
    if (fitNoTrailer === i) fitNoTrailer = i + 1;
    pages.push({
      startIndex: i,
      count: fitNoTrailer - i,
      isFirst,
      isLast: false,
      hasTrailer: false,
      widthMm: dims.w,
      heightMm: dims.h,
    });
    i = fitNoTrailer;
    isFirst = false;
  }

  // If the last emitted page couldn't host the trailer, append a trailer-only
  // page so totals/signature never overlap items or get clipped.
  const last = pages[pages.length - 1];
  if (!last.hasTrailer) {
    const toPage = pages.length + 1;
    const moved = input.trailerBlocks?.length
      ? input.trailerBlocks
      : (["amountWords", "signature"] as const);
    last.warnings = moved.map((block) => ({
      block,
      label: BLOCK_LABEL[block],
      fromPage: pages.length,
      toPage,
    }));
    pages.push({
      startIndex: items.length,
      count: 0,
      isFirst: false,
      isLast: true,
      hasTrailer: true,
      widthMm: last.widthMm,
      heightMm: last.heightMm,
    });
  }
  return pages;
}

const PAGINATION_CACHE_LIMIT = 80;
const paginationCache = new Map<string, PaginatePage[]>();
let cacheHits = 0;
let cacheMisses = 0;

function stable(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`).join(",")}}`;
}

/**
 * Solve for the largest font scale (<= max) that keeps the whole document on
 * a single page. Uses the same deterministic paginator as the renderer, so a
 * returned `fits: true` guarantees the preview, print, and PDF all show one
 * page. When even `min` overflows, returns `{ fontScale: min, fits: false }`.
 */
export function fitFontScaleToOnePage(
  input: Omit<PaginateInput, "fontScale">,
  opts: { max?: number; min?: number; step?: number } = {},
): { fontScale: number; fits: boolean } {
  const max = Math.min(2, Math.max(0.3, opts.max ?? 1));
  const min = Math.min(max, Math.max(0.3, opts.min ?? 0.6));
  const step = Math.max(0.01, opts.step ?? 0.02);
  for (let s = max; s >= min - 1e-9; s = Math.round((s - step) * 100) / 100) {
    const scale = Math.max(min, Math.round(s * 100) / 100);
    if (paginateMainDocument({ ...input, fontScale: scale }).length === 1) {
      return { fontScale: scale, fits: true };
    }
    if (scale <= min) break;
  }
  return { fontScale: min, fits: false };
}

function clonePages(pages: PaginatePage[]): PaginatePage[] {
  return pages.map((p) => ({ ...p, warnings: p.warnings?.map((w) => ({ ...w })) }));
}

export function makePaginationCacheKey(input: PaginateInput, layoutIdentity: Record<string, unknown> = {}): string {
  return stable({ layoutIdentity, input });
}

export function paginateMainDocumentCached(input: PaginateInput, layoutIdentity: Record<string, unknown> = {}): PaginatePage[] {
  const key = makePaginationCacheKey(input, layoutIdentity);
  const hit = paginationCache.get(key);
  if (hit) {
    cacheHits++;
    paginationCache.delete(key);
    paginationCache.set(key, hit);
    return clonePages(hit);
  }
  cacheMisses++;
  const pages = paginateMainDocument(input);
  paginationCache.set(key, clonePages(pages));
  while (paginationCache.size > PAGINATION_CACHE_LIMIT) {
    const oldest = paginationCache.keys().next().value;
    if (!oldest) break;
    paginationCache.delete(oldest);
  }
  return clonePages(pages);
}

export function clearPaginationCache(): void {
  paginationCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
}

export function getPaginationCacheStats() {
  return { size: paginationCache.size, hits: cacheHits, misses: cacheMisses, limit: PAGINATION_CACHE_LIMIT };
}

/** Describe an item's height hints from a raw DocItem-like row. */
export function itemToPaginateHints(row: {
  name?: string | null;
  description?: string | null;
}): PaginateItem {
  const desc = (row.description ?? "").toString();
  const descLines = desc ? desc.split(/\r?\n/).length : 0;
  const name = (row.name ?? "").toString();
  return { descLines, nameLen: name.length };
}