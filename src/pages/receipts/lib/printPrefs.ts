/**
 * Per-user print preferences stored in localStorage. The PrePrintSettingsDialog
 * reads these as defaults and (when "remember" is checked) writes them back.
 *
 * Stored as JSON under `rds_print_prefs_v2`. Anything malformed is ignored
 * and defaults are returned, so a bad value in storage never blocks printing.
 */

export type PaperSize = "A4" | "A5" | "Letter" | "Legal" | "80mm" | "auto-receipt" | "custom";
export type FontScope = "content" | "all";
export type PrintMode = "auto" | "native" | "popup" | "iframe";

export interface PrintMargins {
  top: number;    // mm
  right: number;
  bottom: number;
  left: number;
}

export interface PrintPrefs {
  fontScale: number;        // 0.7 – 1.3
  fontScope: FontScope;
  paper: PaperSize;
  /** Custom physical paper size in millimetres. Kept as portrait/base dims;
   *  renderers swap width/height when `orient` is landscape. */
  customPaper: { widthMm: number; heightMm: number };
  orient: "portrait" | "landscape";
  copies: number;           // 1 – 10
  pageRange: string;        // "" = all
  rememberSettings: boolean;
  margins: PrintMargins;    // mm, 0–30 each
  headerOnce: boolean;      // show bill header on page 1 only
  /**
   * Which browser mechanism to use when sending the job to the printer.
   *  - auto: pick automatically (window.print if not iframed, else popup, else hidden iframe)
   *  - native: force window.print()
   *  - popup: force openPrintWindow (new top-level window)
   *  - iframe: force hidden same-origin iframe
   * User-tunable to work around device-specific quirks (iOS popup block,
   * in-app browsers, corporate MDM print policies).
   */
  printMode: PrintMode;
  /**
   * On-screen preview zoom, independent of `fontScale` (which affects the
   * printed output). `null` means "fit to preview area".
   */
  previewZoom: number | null;
  /**
   * Column visibility for the items table. Keys are canonical column ids
   * (`index`, `name`, `qty`, `unit`, `price`, `total`, `discount`, `notes`).
   * Missing keys default to `true` (visible) to preserve legacy behaviour.
   */
  columnVisibility: Record<string, boolean>;
  /**
   * Shared attachment selection state. `order` is the render order (top to
   * bottom, appended AFTER the main document in every export). `selected`
   * flags per-attachment inclusion. Callers key each attachment by a stable
   * id (typically `path` in storage).
   *
   * NOTE: This is scoped per-document via `saveDocPrintPrefs`. It is NOT
   * persisted in the global prefs to avoid leaking attachment choices
   * across documents.
   */
  attachments?: PrintAttachmentSelection;
  /**
   * Unified companion-doc + attachment selector. When present, this
   * supersedes any legacy `companion_set` derivation and drives the order
   * of pages in Preview / Print / PDF / PNG / JPG exports.
   *
   * Persisted per-document via `saveDocPrintPrefs` — not on the global prefs.
   */
  bundle?: PrintBundleSelection;
}

export interface PrintAttachmentSelection {
  /** Ordered list of attachment ids (stable across renders — typically the
   * storage path). Determines the order attachments appear after the main
   * document in preview / print / PDF / PNG / JPG / XLSX exports. */
  order: string[];
  /** Per-attachment on/off. Missing keys default to `true`. */
  selected: Record<string, boolean>;
}

export const EMPTY_ATTACHMENT_SELECTION: PrintAttachmentSelection = {
  order: [],
  selected: {},
};

/* ---------------------------------------------------------------------------
 * PrintBundleSelection — unified selector for companion docs + attachments.
 *
 * A single ordered list controls what appears in Preview / Print / PDF / PNG /
 * JPG. Each item has a stable id like:
 *   - "doc:main"                — the main document being viewed
 *   - "doc:receipt" | "doc:delivery" | "doc:quotation" — companion documents
 *   - "att:preset:id_copy" | "att:preset:bankbook" | "att:preset:biz_reg"
 *   - "att:upload:<storagePath>" — user-uploaded attachment files
 *
 * `order` fixes the final render order; `selected` toggles items on/off
 * (missing keys default to true so newly discovered items appear enabled).
 * ------------------------------------------------------------------------ */

export type BundleItemKind = "doc" | "att:preset" | "att:upload";

export interface PrintBundleSelection {
  order: string[];
  selected: Record<string, boolean>;
}

export const EMPTY_BUNDLE_SELECTION: PrintBundleSelection = {
  order: [],
  selected: {},
};

export function bundleItemKind(id: string): BundleItemKind | "unknown" {
  if (id.startsWith("doc:")) return "doc";
  if (id.startsWith("att:preset:")) return "att:preset";
  if (id.startsWith("att:upload:")) return "att:upload";
  return "unknown";
}

export function isBundleItemSelected(sel: PrintBundleSelection, id: string): boolean {
  if (id === "doc:main") return true;
  return sel.selected[id] === true;
}


/**
 * Merge a discovered list of item ids into the bundle:
 *  - preserves existing order for ids already present
 *  - appends new ids in the order provided
 *  - drops ids from `order` that no longer exist in `availableIds`
 * `selected` is untouched (so a user's off-toggle sticks even if the item
 * temporarily disappears and returns).
 */
export function reconcileBundle(
  sel: PrintBundleSelection | undefined,
  availableIds: string[],
): PrintBundleSelection {
  const base = sel ?? EMPTY_BUNDLE_SELECTION;
  const set = new Set(availableIds);
  const kept = base.order.filter((id) => set.has(id));
  const appended = availableIds.filter((id) => !kept.includes(id));
  return { order: [...kept, ...appended], selected: { ...base.selected } };
}

export function toggleBundleItem(
  sel: PrintBundleSelection,
  id: string,
  next?: boolean,
): PrintBundleSelection {
  const current = id === "doc:main" ? sel.selected[id] !== false : sel.selected[id] === true;
  const value = next == null ? !current : next;

  return { ...sel, selected: { ...sel.selected, [id]: value } };
}

/** Move item `id` up (-1) or down (+1) in the order. No-op at bounds. */
export function moveBundleItem(
  sel: PrintBundleSelection,
  id: string,
  delta: -1 | 1,
): PrintBundleSelection {
  const idx = sel.order.indexOf(id);
  if (idx < 0) return sel;
  const target = idx + delta;
  if (target < 0 || target >= sel.order.length) return sel;
  const next = sel.order.slice();
  const [it] = next.splice(idx, 1);
  next.splice(target, 0, it);
  return { ...sel, order: next };
}

/** Flatten to the final ordered id list, dropping unselected items. */
/**
 * รายการที่จะพิมพ์จริง = เอกสารหลัก + เฉพาะรายการที่ผู้ใช้ "ติ๊กเลือกเอง"
 * (ต้องเป็น true ชัดเจน) เพื่อกันการพิมพ์ใบอื่นเด้งตามมาเมื่อไม่มีค่าที่บันทึกไว้
 */
export function flattenBundleOrder(sel: PrintBundleSelection): string[] {
  const picked = sel.order.filter((id) => id === "doc:main" || sel.selected[id] === true);
  return picked.includes("doc:main") ? picked : ["doc:main", ...picked];
}


function asBundle(v: unknown): PrintBundleSelection | undefined {
  if (!v || typeof v !== "object") return undefined;
  const obj = v as Partial<PrintBundleSelection>;
  const order = Array.isArray(obj.order) ? obj.order.filter((s): s is string => typeof s === "string") : [];
  const selected: Record<string, boolean> = {};
  if (obj.selected && typeof obj.selected === "object") {
    for (const [k, val] of Object.entries(obj.selected)) {
      if (typeof val === "boolean") selected[k] = val;
    }
  }
  return { order, selected };
}

function asAttachments(v: unknown): PrintAttachmentSelection | undefined {
  if (!v || typeof v !== "object") return undefined;
  const obj = v as Partial<PrintAttachmentSelection>;
  const order = Array.isArray(obj.order) ? obj.order.filter((s): s is string => typeof s === "string") : [];
  const selected: Record<string, boolean> = {};
  if (obj.selected && typeof obj.selected === "object") {
    for (const [k, val] of Object.entries(obj.selected)) {
      if (typeof val === "boolean") selected[k] = val;
    }
  }
  return { order, selected };
}

const KEY = "rds_print_prefs_v2";
const DOC_KEY_PREFIX = "rds_print_prefs_v2:doc:";
const TYPE_KEY_PREFIX = "rds_print_prefs_v2:type:";

export const DEFAULT_MARGINS: PrintMargins = { top: 10, right: 10, bottom: 10, left: 10 };

export const PAPER_SIZE_MM_BASE: Record<Exclude<PaperSize, "custom">, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  Letter: { w: 216, h: 279 },
  Legal: { w: 216, h: 356 },
  "80mm": { w: 80, h: 200 },
  "auto-receipt": { w: 190, h: 270 },
};

export function getPaperSizeMm(
  paper: PaperSize | string | null | undefined,
  orient: "portrait" | "landscape" = "portrait",
  customPaper?: { widthMm?: number; heightMm?: number } | null,
): { w: number; h: number } {
  const dims = paper === "custom"
    ? (() => {
        const c = asCustomPaper(customPaper);
        return { w: c.widthMm, h: c.heightMm };
      })()
    : (PAPER_SIZE_MM_BASE[(paper as Exclude<PaperSize, "custom">) || "A4"] ?? PAPER_SIZE_MM_BASE.A4);
  return orient === "landscape" ? { w: dims.h, h: dims.w } : dims;
}

export function getPaperCssSize(
  paper: PaperSize | string | null | undefined,
  orient: "portrait" | "landscape" = "portrait",
  customPaper?: { widthMm?: number; heightMm?: number } | null,
): string {
  const d = getPaperSizeMm(paper, orient, customPaper);
  // Use explicit millimetres for every size so custom and A4 share the exact
  // same CSS path: @page size: 210mm 297mm (or swapped for landscape).
  return `${d.w}mm ${d.h}mm`;
}

export const DEFAULT_PRINT_PREFS: PrintPrefs = {
  fontScale: 1,
  fontScope: "content",
  paper: "A4",
  customPaper: { widthMm: 210, heightMm: 297 },
  orient: "portrait",
  copies: 1,
  pageRange: "",
  rememberSettings: false,
  margins: { ...DEFAULT_MARGINS },
  headerOnce: true,
  printMode: "auto",
  previewZoom: null,
  columnVisibility: {},
  attachments: undefined,
  bundle: undefined,
};

function clampScale(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 1;
  return Math.min(1.3, Math.max(0.7, Math.round(x * 100) / 100));
}

function clampCopies(n: unknown): number {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return 1;
  return Math.min(10, Math.max(1, x));
}

function asPaper(v: unknown): PaperSize {
  return v === "A5" || v === "Letter" || v === "Legal" || v === "80mm" || v === "custom" || v === "auto-receipt" ? v : "A4";
}

function asOrient(v: unknown): "portrait" | "landscape" {
  return v === "landscape" ? "landscape" : "portrait";
}

function asScope(v: unknown): FontScope {
  return v === "all" ? "all" : "content";
}

function asPrintMode(v: unknown): PrintMode {
  return v === "native" || v === "popup" || v === "iframe" ? v : "auto";
}

function clampMm(n: unknown, fallback = 10): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(30, Math.max(0, Math.round(x * 10) / 10));
}

function clampCustomMm(n: unknown, fallback: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(500, Math.max(50, Math.round(x * 10) / 10));
}

export function asCustomPaper(v: unknown): { widthMm: number; heightMm: number } {
  const p = (v ?? {}) as { widthMm?: unknown; heightMm?: unknown; width?: unknown; height?: unknown };
  return {
    widthMm: clampCustomMm(p.widthMm ?? p.width, 210),
    heightMm: clampCustomMm(p.heightMm ?? p.height, 297),
  };
}

export function asMargins(v: unknown): PrintMargins {
  const m = (v ?? {}) as Partial<PrintMargins>;
  return {
    top: clampMm(m.top, DEFAULT_MARGINS.top),
    right: clampMm(m.right, DEFAULT_MARGINS.right),
    bottom: clampMm(m.bottom, DEFAULT_MARGINS.bottom),
    left: clampMm(m.left, DEFAULT_MARGINS.left),
  };
}

function asPreviewZoom(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(3, Math.max(0.25, Math.round(n * 100) / 100));
}
function asColumnVisibility(v: unknown): Record<string, boolean> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, boolean> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "boolean") out[k] = val;
  }
  return out;
}

export function loadPrintPrefs(): PrintPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_PRINT_PREFS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PRINT_PREFS };
    const j = JSON.parse(raw) as Partial<PrintPrefs>;
    return {
      fontScale: clampScale(j.fontScale ?? 1),
      fontScope: asScope(j.fontScope),
      paper: asPaper(j.paper),
      customPaper: asCustomPaper(j.customPaper),
      orient: asOrient(j.orient),
      copies: clampCopies(j.copies ?? 1),
      pageRange: typeof j.pageRange === "string" ? j.pageRange : "",
      rememberSettings: !!j.rememberSettings,
      margins: asMargins(j.margins),
      headerOnce: j.headerOnce !== false, // default true
      printMode: asPrintMode(j.printMode),
      previewZoom: asPreviewZoom(j.previewZoom),
      columnVisibility: asColumnVisibility(j.columnVisibility),
      attachments: asAttachments(j.attachments),
      bundle: asBundle(j.bundle),
    };
  } catch {
    return { ...DEFAULT_PRINT_PREFS };
  }
}

export function savePrintPrefs(p: PrintPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch { /* quota exceeded — ignore */ }
}

export function clearPrintPrefs(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(KEY); } catch { /* noop */ }
}

/** Per-document storage key. Stable across sessions so reopening the same
 * document restores the last print settings the user picked for it. */
function docKey(docId: string): string {
  return `${DOC_KEY_PREFIX}${docId}`;
}

export function loadDocPrintPrefs(docId: string | null | undefined): Partial<PrintPrefs> | null {
  if (!docId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(docKey(docId));
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<PrintPrefs>;
    return {
      fontScale: j.fontScale != null ? clampScale(j.fontScale) : undefined,
      fontScope: j.fontScope != null ? asScope(j.fontScope) : undefined,
      paper: j.paper != null ? asPaper(j.paper) : undefined,
      customPaper: j.customPaper != null ? asCustomPaper(j.customPaper) : undefined,
      orient: j.orient != null ? asOrient(j.orient) : undefined,
      copies: j.copies != null ? clampCopies(j.copies) : undefined,
      pageRange: typeof j.pageRange === "string" ? j.pageRange : undefined,
      margins: j.margins ? asMargins(j.margins) : undefined,
      headerOnce: j.headerOnce != null ? !!j.headerOnce : undefined,
      printMode: j.printMode != null ? asPrintMode(j.printMode) : undefined,
      previewZoom: j.previewZoom != null ? asPreviewZoom(j.previewZoom) : undefined,
      columnVisibility: j.columnVisibility != null ? asColumnVisibility(j.columnVisibility) : undefined,
      attachments: asAttachments(j.attachments),
      bundle: asBundle(j.bundle),
    };
  } catch {
    return null;
  }
}

export function saveDocPrintPrefs(docId: string | null | undefined, p: PrintPrefs): void {
  if (!docId || typeof window === "undefined") return;
  try {
    const slim: Partial<PrintPrefs> = {
      fontScale: p.fontScale,
      fontScope: p.fontScope,
      paper: p.paper,
      customPaper: p.customPaper,
      orient: p.orient,
      copies: p.copies,
      pageRange: p.pageRange,
      margins: p.margins,
      headerOnce: p.headerOnce,
      printMode: p.printMode,
      previewZoom: p.previewZoom,
      columnVisibility: p.columnVisibility,
      attachments: p.attachments,
      bundle: p.bundle,
    };
    window.localStorage.setItem(docKey(docId), JSON.stringify(slim));
  } catch { /* quota — ignore */ }
}

export function clearDocPrintPrefs(docId: string | null | undefined): void {
  if (!docId || typeof window === "undefined") return;
  try { window.localStorage.removeItem(docKey(docId)); } catch { /* noop */ }
}

/* ---------------------------------------------------------------------------
 * Per-document-type prefs — sticky paper/orient/customPaper/margins keyed by
 * document_type (receipt/quotation/delivery/tax_invoice). Written implicitly
 * every time the user actually prints, so the next time they print the SAME
 * document type the sheet size + margins snap back without any dialog toggle.
 * Independent of the per-doc-id prefs (which override this) and the global
 * prefs (which are the fallback).
 * ------------------------------------------------------------------------ */

export interface TypePrintPrefs {
  paper?: PaperSize;
  orient?: "portrait" | "landscape";
  customPaper?: { widthMm: number; heightMm: number };
  margins?: PrintMargins;
}

function typeKey(type: string): string {
  return `${TYPE_KEY_PREFIX}${type}`;
}

export function loadTypePrintPrefs(type: string | null | undefined): TypePrintPrefs | null {
  if (!type || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(typeKey(type));
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<TypePrintPrefs>;
    const out: TypePrintPrefs = {};
    if (j.paper != null) out.paper = asPaper(j.paper);
    if (j.orient != null) out.orient = asOrient(j.orient);
    if (j.customPaper != null) out.customPaper = asCustomPaper(j.customPaper);
    if (j.margins != null) out.margins = asMargins(j.margins);
    return out;
  } catch {
    return null;
  }
}

export function saveTypePrintPrefs(
  type: string | null | undefined,
  p: TypePrintPrefs,
): void {
  if (!type || typeof window === "undefined") return;
  try {
    const slim: TypePrintPrefs = {
      paper: p.paper,
      orient: p.orient,
      customPaper: p.customPaper,
      margins: p.margins,
    };
    window.localStorage.setItem(typeKey(type), JSON.stringify(slim));
  } catch { /* quota — ignore */ }
}

export function clearTypePrintPrefs(type: string | null | undefined): void {
  if (!type || typeof window === "undefined") return;
  try { window.localStorage.removeItem(typeKey(type)); } catch { /* noop */ }
}

/**
 * Merge stored prefs with caller-supplied defaults (typically per-document
 * values like the doc's saved font_scale or paper_size). Caller values win.
 */
export function resolveInitialPrefs(
  override: Partial<PrintPrefs> = {},
  docId?: string | null,
): PrintPrefs {
  const stored = loadPrintPrefs();
  // Per-document overrides win over global stored prefs (so user-specific
  // tweaks like "this invoice prints at 90% on A5" come back automatically),
  // while caller-supplied `override` (doc's persisted font_scale/paper) wins
  // over both as the most authoritative source of truth.
  const perDoc = loadDocPrintPrefs(docId) ?? {};
  const pick = <K extends keyof PrintPrefs>(k: K): PrintPrefs[K] =>
    (override[k] ?? perDoc[k] ?? stored[k]) as PrintPrefs[K];
  return {
    fontScale: clampScale(pick("fontScale")),
    fontScope: asScope(pick("fontScope")),
    paper: asPaper(pick("paper")),
    customPaper: asCustomPaper(override.customPaper ?? perDoc.customPaper ?? stored.customPaper),
    orient: asOrient(pick("orient")),
    copies: clampCopies(pick("copies")),
    pageRange: typeof pick("pageRange") === "string" ? (pick("pageRange") as string) : "",
    rememberSettings: stored.rememberSettings,
    margins: asMargins(override.margins ?? perDoc.margins ?? stored.margins),
    headerOnce: override.headerOnce != null
      ? !!override.headerOnce
      : perDoc.headerOnce != null
        ? !!perDoc.headerOnce
        : stored.headerOnce,
    printMode: asPrintMode(pick("printMode")),
    previewZoom: asPreviewZoom(override.previewZoom ?? perDoc.previewZoom ?? stored.previewZoom),
    columnVisibility: {
      ...(stored.columnVisibility ?? {}),
      ...(perDoc.columnVisibility ?? {}),
      ...(override.columnVisibility ?? {}),
    },
    attachments: override.attachments ?? perDoc.attachments ?? stored.attachments,
    bundle: override.bundle ?? perDoc.bundle ?? stored.bundle,
  };
}