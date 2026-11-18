import * as React from "react";
import type { RdsStore } from "../types";
import type { DocFormState, Totals, DocItem, DocTemplate } from "./useDocumentForm";
import { calcLineTotal } from "./useDocumentForm";
import { bahttext } from "./bahttext";
import { resolveDocTheme, hexToHslTriplet, DOC_TYPE_LABEL } from "../lib/docTheme";
import type { LayoutMargins, ResolvedTemplateConfig } from "../lib/layouts";
import { paginateMainDocumentCached, itemToPaginateHints, getMeasuredHeaderMm } from "../lib/paginate";
import type { PaperSize } from "./useDocumentForm";
import { A4_PAGE, CONTENT_FRAME, LOCKED_PADDING } from "../lib/paperConstants";

const DOTTED_DATE = "........./........./..........";
export type DocumentPageLayoutInput = {
  widthMm?: number;
  heightMm?: number;
  paddingMm?: Partial<LayoutMargins>;
};

export type ResolvedDocumentPageLayout = {
  widthMm: number;
  heightMm: number;
  paddingMm: LayoutMargins;
  contentWidthMm: number;
  contentHeightMm: number;
  paddingCss: string;
};

export const DEFAULT_DOCUMENT_PAGE_LAYOUT: ResolvedDocumentPageLayout = {
  widthMm: A4_PAGE.widthMm,
  heightMm: A4_PAGE.heightMm,
  paddingMm: { ...LOCKED_PADDING },
  contentWidthMm: CONTENT_FRAME.widthMm,
  contentHeightMm: CONTENT_FRAME.heightMm,
  paddingCss: `${LOCKED_PADDING.top}mm ${LOCKED_PADDING.right}mm ${LOCKED_PADDING.bottom}mm ${LOCKED_PADDING.left}mm`,
};

function clampMm(value: unknown, fallback: number, min = 0, max = 500): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 10) / 10));
}

function paddingCss(p: LayoutMargins): string {
  return `${p.top}mm ${p.right}mm ${p.bottom}mm ${p.left}mm`;
}

export function resolveDocumentPageLayout(
  cfg?: ResolvedTemplateConfig | null,
  override?: DocumentPageLayoutInput | null,
): ResolvedDocumentPageLayout {
  const cfgLayout = cfg?.page_layout;
  const widthMm = clampMm(
    override?.widthMm ?? cfgLayout?.widthMm ?? cfg?.page_width_mm ?? cfg?.frame_width_mm,
    DEFAULT_DOCUMENT_PAGE_LAYOUT.widthMm,
    50,
    500,
  );
  const heightMm = clampMm(
    override?.heightMm ?? cfgLayout?.heightMm ?? cfg?.page_height_mm ?? cfg?.frame_height_mm,
    DEFAULT_DOCUMENT_PAGE_LAYOUT.heightMm,
    50,
    500,
  );
  const rawPadding = override?.paddingMm ?? cfgLayout?.paddingMm ?? cfg?.page_padding ?? undefined;
  const paddingMm: LayoutMargins = {
    top: clampMm(rawPadding?.top, DEFAULT_DOCUMENT_PAGE_LAYOUT.paddingMm.top, 0, Math.max(0, heightMm - 10)),
    right: clampMm(rawPadding?.right, DEFAULT_DOCUMENT_PAGE_LAYOUT.paddingMm.right, 0, Math.max(0, widthMm - 10)),
    bottom: clampMm(rawPadding?.bottom, DEFAULT_DOCUMENT_PAGE_LAYOUT.paddingMm.bottom, 0, Math.max(0, heightMm - 10)),
    left: clampMm(rawPadding?.left, DEFAULT_DOCUMENT_PAGE_LAYOUT.paddingMm.left, 0, Math.max(0, widthMm - 10)),
  };
  return {
    widthMm,
    heightMm,
    paddingMm,
    contentWidthMm: Math.max(0, Math.round((widthMm - paddingMm.left - paddingMm.right) * 10) / 10),
    contentHeightMm: Math.max(0, Math.round((heightMm - paddingMm.top - paddingMm.bottom) * 10) / 10),
    paddingCss: paddingCss(paddingMm),
  };
}

function renderDate(state: DocFormState, opts: { long?: boolean } = {}) {
  if (!state.show_document_date) return DOTTED_DATE;
  const d = new Date(state.document_date);
  return opts.long
    ? d.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })
    : d.toLocaleDateString("th-TH");
}

const DOC_TITLE: Record<string, string> = {
  receipt: "ใบเสร็จรับเงิน",
  delivery: "ใบส่งของ/ใบกำกับภาษี",
  invoice: "ใบแจ้งหนี้",
  quotation: "ใบเสนอราคา",
  tax_invoice: "ใบกำกับภาษี/ใบเสร็จรับเงิน",
};

// Store-scoped title override. Colorlab issues a single combined document
// labelled "ใบเสร็จรับเงิน/ใบกำกับภาษี" (receipt-first ordering).
function resolveDocTitle(docType: string, store: RdsStore | null | undefined): string {
  if (store?.slug === "colorlab" && (docType === "tax_invoice" || docType === "receipt")) {
    return "ใบเสร็จรับเงิน/ใบกำกับภาษี";
  }
  return DOC_TITLE[docType] ?? "เอกสาร";
}

// Per-document accent colors. Reads store overrides from `store.doc_theme`,
// falling back to the defaults defined in lib/docTheme.ts.
function docAccentVars(docType: string, store: RdsStore | null): {
  titleHsl: string | null;
  headerHsl: string | null;
  titleHex: string;
  headerHex: string;
} {
  const theme = resolveDocTheme(docType, store);
  return {
    titleHsl: hexToHslTriplet(theme.title),
    headerHsl: hexToHslTriplet(theme.header),
    titleHex: theme.title,
    headerHex: theme.header,
  };
}

function CornerRibbon({ docType, color }: { docType: string; color: string }) {
  const label = DOC_TYPE_LABEL[docType] ?? "เอกสาร";
  return (
    <div
      aria-hidden
      className="doc-corner-ribbon"
      style={{
        position: "absolute",
        top: 10,
        right: -34,
        transform: "rotate(35deg)",
        backgroundColor: color,
        color: "#fff",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 1,
        padding: "3px 40px",
        boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      } as React.CSSProperties}
    >
      {label}
    </div>
  );
}

function AccentTopBar({ color }: { color: string }) {
  return (
    <div
      aria-hidden
      className="doc-accent-bar"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 6,
        backgroundColor: color,
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      } as React.CSSProperties}
    />
  );
}

function signersFor(docType: string): string[] {
  // Receiver-signature standard: receipt / tax_invoice / combined
  // receipt+tax_invoice always show a single centered "(ผู้รับเงิน)".
  if (docType === "receipt" || docType === "tax_invoice" || docType === "invoice") {
    return ["(ผู้รับเงิน)"];
  }
  if (docType === "delivery") return ["ผู้ส่งของ", "ผู้รับของ"];
  if (docType === "quotation") return ["ผู้รับผิดชอบ", "ผู้จัดการร้าน"];
  return ["(ผู้รับเงิน)"];
}

/**
 * Discount rows (ส่วนลด / หลังหักส่วนลด) read their typography from CSS vars
 * declared on the document root, so PrintPreview can tune font size /
 * alignment / row padding per paper size. Inline styles (not a stylesheet)
 * so the values survive `outerHTML` copies used by print + PDF export.
 */
export interface DiscountTableStyle {
  /** Font size in px (10–18). */
  fontPx: number;
  /** Horizontal alignment of the amount cell. */
  align: "left" | "center" | "right";
  /** Vertical row padding in px (0–8). */
  padPx: number;
}

export const DEFAULT_DISCOUNT_TABLE_STYLE: DiscountTableStyle = { fontPx: 13, align: "right", padPx: 2 };

const DISCOUNT_ROW_STYLE: React.CSSProperties = {
  fontSize: "var(--doc-discount-font-size, inherit)",
};
const DISCOUNT_LABEL_CELL_STYLE: React.CSSProperties = {
  paddingTop: "var(--doc-discount-pad, 2px)",
  paddingBottom: "var(--doc-discount-pad, 2px)",
};
const DISCOUNT_VALUE_CELL_STYLE: React.CSSProperties = {
  paddingTop: "var(--doc-discount-pad, 2px)",
  paddingBottom: "var(--doc-discount-pad, 2px)",
  textAlign: "var(--doc-discount-align, right)" as React.CSSProperties["textAlign"],
};

export function discountStyleVars(s?: DiscountTableStyle | null): React.CSSProperties {
  if (!s) return {};
  return {
    ["--doc-discount-font-size" as any]: `${s.fontPx}px`,
    ["--doc-discount-align" as any]: s.align,
    ["--doc-discount-pad" as any]: `${s.padPx}px`,
  } as React.CSSProperties;
}

function brandStyle(store: RdsStore | null): React.CSSProperties {
  const hsl = store?.brand_color || "160 72% 38%";
  return {
    // expose as CSS var so descendants can use hsl(var(--brand))
    ["--brand" as any]: hsl,
    ["--brand-soft" as any]: hsl,
  } as React.CSSProperties;
}


/**
 * Estimated height (mm at fontScale = 1) of the trailer block: totals +
 * amount-in-words + signature + notes + footer text. Exported so the print
 * preview can solve for a font scale that keeps the whole document on a
 * single sheet using the exact same capacity math as the renderer.
 */
export function estimateTrailerMm(
  state: Pick<DocFormState, "notes" | "payment_method" | "show_payment_method">,
  footerText?: string,
): number {
  return (
    38 /* totals table + amount-in-words */ +
    34 /* dotted signature + label + top margin */ +
    (state.notes ? Math.min(30, 6 + Math.min(4, state.notes.split(/\r?\n/).length) * 4) : 0) +
    (footerText ? Math.min(30, 6 + Math.min(4, footerText.split(/\r?\n/).length) * 4) : 0) +
    ((state.show_payment_method !== false && state.payment_method) ? 6 : 0)
  );
}

function ModernPage({
  store,
  state,
  totals,
  docNo,
  items,
  headerText,
  footerText,
  accentColor,
  cfg,
  hiddenColumns,
  orient = "portrait",
  customPaper,
  pageLayout,
  paginationKeyExtra,
}: {
  store: RdsStore | null;
  state: DocFormState;
  totals: Totals;
  docNo?: string | null;
  items: DocItem[];
  headerText?: string;
  footerText?: string;
  accentColor?: string;
  cfg?: ResolvedTemplateConfig | null;
  hiddenColumns?: Set<string>;
  orient?: "portrait" | "landscape";
  customPaper?: { widthMm?: number; heightMm?: number } | null;
  pageLayout?: DocumentPageLayoutInput | null;
  paginationKeyExtra?: Record<string, unknown>;
}) {
  const title = resolveDocTitle(state.document_type, store);
  const brand = `hsl(var(--brand))`;
  const isHidden = (col: string) => !!hiddenColumns && hiddenColumns.has(col);
  const hideStyle = (col: string): React.CSSProperties | undefined =>
    isHidden(col) ? { display: "none" } : undefined;
  // Defaults remain locked to A4 210×297mm with a 190×270mm content frame.
  // Callers may override through props/config; CSS only acts as a fallback.
  const pageCfg = resolveDocumentPageLayout(cfg, pageLayout);
  const m = pageCfg.paddingMm;
  const padding = pageCfg.paddingCss;
  const LOCKED_PAPER: PaperSize = pageCfg.widthMm === 210 && pageCfg.heightMm === 297 ? "A4" : "custom";
  const LOCKED_ORIENT: "portrait" = "portrait";
  const showLogo = cfg?.show_logo !== false;
  const showTaxId = cfg?.show_tax_id !== false;
  const showAddress = cfg?.show_store_address !== false;
  const showDocNo = cfg?.show_document_no !== false;
  const showDate = cfg?.show_document_date !== false;
  const logoScale = Math.min(1.6, Math.max(0.6, Number(cfg?.logo_scale ?? 1) || 1));
  const logoAlign: "left" | "center" | "right" =
    cfg?.logo_align === "left" || cfg?.logo_align === "center" ? cfg.logo_align : "right";
  const logoHeightMm = 24 * logoScale;
  const logoMaxMm = 28 * logoScale;
  // Reserve horizontal room for the title so it never overlaps the logo.
  const titleRightPadMm = Math.round(logoHeightMm + 12);
  const pageGapMm = Math.min(40, Math.max(8, Number(cfg?.page_gap_mm ?? 16) || 16));

  // Estimate trailer height (mm at fontScale=1) — shared with the print
  // preview's "fit on one page" solver so both agree on page capacity.
  const trailerMm = estimateTrailerMm(state, footerText);

  const measuredHeader = getMeasuredHeaderMm();
  const pages = paginateMainDocumentCached({
    paperSize: LOCKED_PAPER,
    orient: LOCKED_ORIENT,
    customPaper: LOCKED_PAPER === "custom" ? { widthMm: pageCfg.widthMm, heightMm: pageCfg.heightMm } : null,
    marginsMm: m,
    fontScale: Number(state.font_scale ?? 1) || 1,
    items: items.map((it) => itemToPaginateHints({ name: it.name, description: it.description })),
    trailerMm,
    headerFullMm: measuredHeader.full,
    headerCompactMm: measuredHeader.compact,
    trailerBlocks: [state.notes ? "notes" : null, "amountWords", "signature"].filter(Boolean) as any,

  }, {
    docNo,
    docType: state.document_type,
    template: state.template ?? "modern",
    hiddenColumns: Array.from(hiddenColumns ?? []),
    notes: state.notes,
    footerText,
    totals: { grand: totals.grand_total, net: totals.net_total },
    extra: paginationKeyExtra,
  });
  const totalPages = pages.length;

  return (
    <>
      {pages.map((page, pageIdx) => {
        const pageItems = items.slice(page.startIndex, page.startIndex + page.count);
        const warningText = page.warnings?.length
          ? `พื้นที่หน้าไม่พอ ระบบย้าย ${page.warnings.map((w) => w.label).join(", ")} ไปหน้า ${page.warnings[0].toPage}`
          : null;
        return (
        <React.Fragment key={`mp-wrap-${pageIdx}`}>
        {pageIdx > 0 && (
          <div
            className="doc-page-divider no-print"
            role="separator"
            aria-label={`ตัวคั่นก่อนหน้า ${pageIdx + 1}`}
            style={{ width: `${pageCfg.widthMm}mm` }}
          >
            <span>— หน้า {pageIdx + 1} / {totalPages} —</span>
          </div>
        )}
    <section
      key={`mp-${pageIdx}`}
      className="doc-page mx-auto bg-white print:shadow-none relative"
      data-page-idx={pageIdx + 1}
      data-page-total={totalPages}
      data-page-role={page.hasTrailer ? "last" : page.isFirst ? "first" : "middle"}
      data-overflow={page.warnings?.length ? "true" : "false"}
      style={{
        ...brandStyle(store),
        ["--doc-page-width" as any]: `${pageCfg.widthMm}mm`,
        ["--doc-page-height" as any]: `${pageCfg.heightMm}mm`,
        ["--doc-page-padding" as any]: padding,
        width: `${pageCfg.widthMm}mm`,
        minHeight: `${pageCfg.heightMm}mm`,
        padding,
        color: "#0f172a",
        boxSizing: "border-box",
        background: "#ffffff",
        marginTop: pageIdx === 0 ? undefined : `${pageGapMm}mm`,
        boxShadow: "none",
        overflow: "hidden",
        breakBefore: pageIdx === 0 ? undefined : "page",
        pageBreakBefore: pageIdx === 0 ? undefined : "always",
      }}
    >
      {warningText && (
        <div className="no-print doc-pagination-warning mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          {warningText}
        </div>
      )}
      {accentColor && <AccentTopBar color={accentColor} />}
      {accentColor && page.isFirst && <CornerRibbon docType={state.document_type} color={accentColor} />}
      {page.isFirst ? (
      <div className="doc-header-group">
      {logoAlign === "center" && showLogo && store?.logo_url && (
        <div className="flex justify-center mb-2" data-doc-logo-align="center">
          <img
            src={store.logo_url}
            alt={store?.name || ""}
            className="w-auto object-contain shrink-0 block mx-auto doc-header-logo"
            style={{ height: `${logoHeightMm}mm`, maxHeight: `${logoMaxMm}mm` }}
            crossOrigin="anonymous"
          />
        </div>
      )}
      <div
        className={`flex items-center justify-between gap-6 ${logoAlign === "left" ? "flex-row-reverse" : ""}`}
        data-doc-logo-align={logoAlign}
      >
        <div className="min-w-0 flex-1" style={{ paddingRight: logoAlign === "right" ? `${titleRightPadMm}mm` : "6mm", paddingLeft: logoAlign === "left" ? `${titleRightPadMm}mm` : undefined }}>
          <h1
            className="font-extrabold leading-tight whitespace-nowrap"
            style={{ color: brand, fontSize: "clamp(1.1rem, 2.6vw, 1.9rem)" }}
          >{title}</h1>
          <p className="mt-1 text-base font-semibold" style={{ color: brand }}>
            {store?.slug === "colorlab" && (state.document_type === "receipt" || state.document_type === "tax_invoice")
              ? "Receipt/Tax Invoice"
              : state.document_type === "receipt" ? "Receipt"
              : state.document_type === "delivery" ? "Delivery Note / Tax Invoice"
              : state.document_type === "quotation" ? "Quotation"
              : "Tax Invoice"}
          </p>
        </div>
        {logoAlign !== "center" && showLogo && store?.logo_url && (
          <img
            src={store.logo_url}
            alt={store?.name || ""}
            className={`w-auto object-contain shrink-0 block doc-header-logo ${logoAlign === "right" ? "ml-auto" : "mr-auto"}`}
            style={{ height: `${logoHeightMm}mm`, maxHeight: `${logoMaxMm}mm` }}
            crossOrigin="anonymous"
          />
        )}
      </div>
      <div className="mt-2 h-px" style={{ backgroundColor: "hsl(var(--brand) / 0.35)" }} />

      {/* Parties */}
      <div className="grid grid-cols-2 gap-6 mt-5 text-[12px]">
        <div>
          <p className="text-gray-500">ข้อมูลลูกค้า :</p>
          <p className="font-bold text-base mt-1">{state.customer_name || "—"}</p>
          {state.customer_address && <p className="whitespace-pre-line text-gray-700">{state.customer_address}</p>}
          {state.customer_phone && <p className="text-gray-700">{state.customer_phone}</p>}
          {state.customer_tax_id && (
            <p className="text-gray-700">เลขผู้เสียภาษี {state.customer_tax_id}{state.customer_branch ? ` (${state.customer_branch})` : ""}</p>
          )}
          {showDocNo && <p className="mt-2 text-gray-700">เลขที่บิล : {docNo || "—"}</p>}
          {/* Standardized project + blank date block (all templates, both stores) */}
          <div className="mt-3 text-gray-800 doc-project-block">
            <p>โครงการ : <span className="font-semibold">{state.project_name || ""}</span></p>
            <p className="doc-project-date" style={{ marginTop: "10px" }}>วันที่ ......../.........../...............</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-gray-500">ผู้ขาย :</p>
          <p className="font-bold text-base mt-1">{store?.name}</p>
          {showAddress && store?.address && <p className="whitespace-pre-line text-gray-700">{store.address}</p>}
          {store?.phone && <p className="text-gray-700">{store.phone}</p>}
          {showTaxId && store?.tax_id && <p className="text-gray-700">เลขผู้เสียภาษี {store.tax_id}</p>}
          {headerText && <p className="mt-1 italic text-gray-600 whitespace-pre-line">{headerText}</p>}
        </div>
      </div>
      </div>
      ) : (
        <div className="doc-header-compact flex items-center justify-between text-[11px] text-gray-600 border-b pb-1" style={{ borderColor: "hsl(var(--brand) / 0.3)" }}>
          <div className="font-semibold" style={{ color: brand }}>
            {title} · {docNo || "—"}
          </div>
          <div className="truncate max-w-[50%] text-right">
            {state.customer_name || "—"}
          </div>
        </div>
      )}

      {/* Items table — this page's slice; header always repeated. */}
      {pageItems.length > 0 && (
      <div className="doc-items-table mt-5 rounded-lg overflow-hidden border" style={{ borderColor: "hsl(var(--brand) / 0.2)" }}>
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead style={{ display: "table-header-group" }}>
            <tr style={{ backgroundColor: brand, color: "#fff" }}>
              <th data-col="index" style={hideStyle("index")} className="text-center px-2 py-2.5 font-bold text-[11px] tracking-wide w-10">ลำดับ</th>
              <th data-col="name" className="text-left px-3 py-2.5 font-bold text-[11px] tracking-wide">รายการ</th>
              <th data-col="qty" style={hideStyle("qty")} className="text-center px-3 py-2.5 font-bold text-[11px] tracking-wide w-14">จำนวน</th>
              <th data-col="unit" style={hideStyle("unit")} className="text-center px-3 py-2.5 font-bold text-[11px] tracking-wide w-16">หน่วย</th>
              <th data-col="price" style={hideStyle("price")} className="text-right px-3 py-2.5 font-bold text-[11px] tracking-wide w-24">ราคาต่อหน่วย</th>
              <th data-col="total" style={hideStyle("total")} className="text-right px-3 py-2.5 font-bold text-[11px] tracking-wide w-28">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {pageItems.map((it, i) => (
              <tr
                key={it.key}
                className={`align-top ${i % 2 === 1 ? "bg-gray-50/60" : "bg-white"} avoid-break`}
                style={{ borderTop: i === 0 ? "0" : "1px solid #f1f5f9" }}
              >
                <td data-col="index" style={hideStyle("index")} className="px-2 py-2.5 text-center tabular-nums text-gray-700">{page.startIndex + i + 1}</td>
                <td data-col="name" className="px-3 py-2.5 break-words">
                  <div className="font-semibold text-gray-900">{it.name || `รายการที่ ${page.startIndex + i + 1}`}</div>
                  {it.description && <div className="text-gray-500 text-[11px] mt-0.5 whitespace-pre-line">{it.description}</div>}
                </td>
                <td data-col="qty" style={hideStyle("qty")} className="px-3 py-2.5 text-center tabular-nums">{it.quantity}</td>
                <td data-col="unit" style={hideStyle("unit")} className="px-3 py-2.5 text-center text-gray-700">{it.unit}</td>
                <td data-col="price" style={hideStyle("price")} className="px-3 py-2.5 text-right tabular-nums text-gray-700">{Number(it.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td data-col="total" style={hideStyle("total")} className="px-3 py-2.5 text-right tabular-nums font-semibold text-gray-900">{calcLineTotal(it).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {page.hasTrailer && (
      <>
      <div className="mt-5 grid grid-cols-2 gap-6 text-[12px] doc-totals avoid-break">
          {/* Payment */}
          <div>
            {state.show_payment_method !== false && state.payment_method && (
              <p className="mt-1">วิธีจ่ายเงิน: <span className="font-semibold">{state.payment_method}</span></p>
            )}
            {state.notes && <p className="mt-3 whitespace-pre-line text-gray-700 doc-notes">{state.notes}</p>}
          </div>
          {/* Totals */}
          <div className="text-[13px]">
            <table className="w-full">
              <tbody>
                {store?.slug !== "colorlab" && (
                  <tr>
                    <td className="py-0.5 text-gray-600">รวม</td>
                    <td className="py-0.5 text-right tabular-nums">{totals.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                )}
                {totals.discount_total > 0 && (
                  <>
                    <tr data-testid="doc-discount-row" style={DISCOUNT_ROW_STYLE}>
                      <td className="text-gray-600" style={DISCOUNT_LABEL_CELL_STYLE}>ส่วนลด</td>
                      <td className="tabular-nums" style={DISCOUNT_VALUE_CELL_STYLE}>-{totals.discount_total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                    <tr data-testid="doc-after-discount-row" style={DISCOUNT_ROW_STYLE}>
                      <td className="text-gray-600" style={DISCOUNT_LABEL_CELL_STYLE}>หลังหักส่วนลด</td>
                      <td className="tabular-nums" style={DISCOUNT_VALUE_CELL_STYLE}>{Math.max(0, totals.subtotal - totals.discount_total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  </>
                )}


                {state.vat_mode !== "none" && (
                  <>
                  <tr>
                    <td className="py-0.5 text-gray-600">ก่อน VAT</td>
                    <td className="py-0.5 text-right tabular-nums">{totals.amount_before_vat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                  <tr>
                    <td className="py-0.5 text-gray-600">VAT {state.vat_rate}%</td>
                    <td className="py-0.5 text-right tabular-nums">{totals.vat_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                  </>
                )}
                {state.withholding_tax_enabled && (
                  <tr>
                    <td className="py-0.5 text-gray-600">หัก ณ ที่จ่าย {state.withholding_tax_rate}%</td>
                    <td className="py-0.5 text-right tabular-nums">-{totals.withholding_tax_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                )}
                <tr style={{ borderTop: "2px solid hsl(var(--brand) / 0.3)" }}>
                  <td className="pt-1 font-bold" style={{ color: brand }}>ยอดรวม</td>
                  <td className="pt-1 text-right tabular-nums font-bold" style={{ color: brand }}>
                    {(totals.net_total || totals.grand_total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="mt-1 text-right italic text-gray-600">({bahttext(totals.net_total || totals.grand_total)})</p>
          </div>
      </div>

      {(() => {
        const signers = signersFor(state.document_type);
        if (signers.length === 1) {
          return (
            <div className="mt-10 avoid-break doc-signature doc-signature-single text-center text-[12px] text-gray-700">
              <div
                className="doc-signature-longline mx-auto"
                aria-hidden="true"
                style={{ width: "42%", maxWidth: "72mm", minWidth: "180px", borderBottom: "1.2px dotted #4b5563", height: 0, marginTop: "18mm" }}
              />
              <div className="mt-1">{signers[0]}</div>
            </div>
          );
        }
        const cols = signers.length === 2 ? "grid-cols-2" : "grid-cols-3";
        return (
          <div className={`mt-10 grid ${cols} gap-6 text-[12px] avoid-break doc-signature`}>
            {signers.map((label) => (
              <div key={label} className="text-center">
                <div className="mt-10 border-t border-dotted border-gray-500 mx-4 pt-1 text-gray-700">{label}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {footerText && (
        <p className="mt-4 text-[11px] whitespace-pre-line border-t border-gray-200 pt-2 text-gray-600 doc-notes">{footerText}</p>
      )}
      </>
      )}
      {warningText && (
        <div className="no-print doc-pagination-badge absolute rounded-sm bg-amber-100 px-2 py-1 text-[10px] text-amber-900" style={{ right: "8mm", bottom: "11mm" }}>
          ย้ายไปหน้า {page.warnings?.[0]?.toPage}
        </div>
      )}
    </section>
        </React.Fragment>
        );
      })}
    </>
  );
}

function PageHeader({ store, state, docNo, template, headerText }: { store: RdsStore | null; state: DocFormState; docNo?: string | null; template: DocTemplate; headerText?: string }) {
  const border = template === "formal" ? "border-double border-b-4 border-gray-700" : "border-b border-gray-300";
  const compact = template === "compact";
  return (
    <div className="doc-header-group">
      <div className={`flex items-start justify-between gap-6 ${border} pb-3`} style={{ paddingRight: "36mm" }}>
        <div className="min-w-0 flex-1" style={{ paddingRight: "6mm" }}>
          {store?.logo_url && <img src={store.logo_url} alt="" className={compact ? "h-12 mb-1 object-contain" : "h-20 mb-2 object-contain"} />}
          <p className="font-bold">{store?.name}</p>
          {headerText && <p className="text-xs italic text-gray-600 whitespace-pre-line">{headerText}</p>}
          {!compact && store?.address && <p className="text-xs whitespace-pre-line">{store.address}</p>}
          {store?.phone && <p className="text-xs">โทร {store.phone}</p>}
          {!compact && store?.tax_id && <p className="text-xs">เลขผู้เสียภาษี {store.tax_id}</p>}
        </div>
        <div className="text-right shrink-0">
          <h1
            className={`${template === "formal" ? "text-xl font-bold tracking-wide" : "text-lg font-bold"} whitespace-nowrap`}
            style={{ color: "hsl(var(--brand))" }}
          >{resolveDocTitle(state.document_type, store)}</h1>
          {docNo && <p className="text-xs">เลขที่ {docNo}</p>}
        </div>
      </div>
      <div className="mt-3 text-xs">
        <p>
          <span className="text-gray-500">ลูกค้า: </span>
          <span className="font-medium">{state.customer_name || "—"}</span>
        </p>
        {!compact && state.customer_address && <p className="whitespace-pre-line">{state.customer_address}</p>}
        {state.customer_phone && <p>โทร {state.customer_phone}</p>}
        {state.customer_tax_id && (
          <p>
            เลขผู้เสียภาษี {state.customer_tax_id} {state.customer_branch && `(${state.customer_branch})`}
          </p>
        )}
        <div className="mt-3 doc-project-block">
          <p>โครงการ : <span className="font-medium">{state.project_name || ""}</span></p>
          <p className="doc-project-date" style={{ marginTop: "10px" }}>วันที่ ......../.........../...............</p>
        </div>
      </div>
    </div>
  );
}

function ItemsTableBlock({ items, startIndex }: { items: DocItem[]; startIndex: number }) {
  return (
    <table className="doc-items-table w-full text-xs mt-4 border-t border-b border-gray-300">
      <thead style={{ display: "table-header-group" }}>
        <tr style={{ backgroundColor: "hsl(var(--brand))", color: "#fff" }}>
          <th className="p-1 w-8 text-center">ลำดับ</th>
          <th className="p-1 text-left">รายการ</th>
          <th className="p-1 w-14 text-right">จำนวน</th>
          <th className="p-1 w-12">หน่วย</th>
          <th className="p-1 w-20 text-right">ราคาต่อหน่วย (บาท)</th>
          <th className="p-1 w-20 text-right">จำนวนเงิน (บาท)</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it, i) => (
          <tr key={it.key} className="border-t border-gray-200 align-top">
            <td className="p-1 text-center">{startIndex + i + 1}</td>
            <td className="p-1"><div>{it.name}</div></td>
            <td className="p-1 text-right tabular-nums">{it.quantity}</td>
            <td className="p-1">{it.unit}</td>
            <td className="p-1 text-right tabular-nums">{Number(it.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td className="p-1 text-right tabular-nums">{calcLineTotal(it).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TotalsBlock({ store, state, totals, footerText }: { store: RdsStore | null; state: DocFormState; totals: Totals; footerText?: string }) {
  return (
    <div className="doc-totals">
      <div className="mt-3 flex justify-end">
        <table className="text-xs">
          <tbody>
            {store?.slug !== "colorlab" && (
              <tr>
                <td className="pr-4 text-gray-600">รวม</td>
                <td className="text-right tabular-nums w-24">{totals.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            )}
            {totals.discount_total > 0 && (
              <>
                <tr data-testid="doc-discount-row" style={DISCOUNT_ROW_STYLE}>
                  <td className="pr-4 text-gray-600" style={DISCOUNT_LABEL_CELL_STYLE}>ส่วนลด</td>
                  <td className="tabular-nums" style={DISCOUNT_VALUE_CELL_STYLE}>-{totals.discount_total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
                <tr data-testid="doc-after-discount-row" style={DISCOUNT_ROW_STYLE}>
                  <td className="pr-4 text-gray-600" style={DISCOUNT_LABEL_CELL_STYLE}>หลังหักส่วนลด</td>
                  <td className="tabular-nums" style={DISCOUNT_VALUE_CELL_STYLE}>{Math.max(0, totals.subtotal - totals.discount_total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              </>
            )}

            {state.vat_mode !== "none" && (
              <>
                <tr>
                  <td className="pr-4 text-gray-600">ก่อน VAT</td>
                  <td className="text-right tabular-nums">{totals.amount_before_vat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
                <tr>
                  <td className="pr-4 text-gray-600">VAT {state.vat_rate}%</td>
                  <td className="text-right tabular-nums">{totals.vat_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              </>
            )}
            <tr className="font-bold border-t border-gray-300">
              <td className="pr-4 pt-1">ยอดรวม</td>
              <td className="text-right tabular-nums pt-1">{totals.grand_total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
            {state.withholding_tax_enabled && (
              <>
                <tr>
                  <td className="pr-4 text-gray-600">หัก ณ ที่จ่าย {state.withholding_tax_rate}%</td>
                  <td className="text-right tabular-nums">-{totals.withholding_tax_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
                <tr className="font-bold border-t border-gray-300">
                  <td className="pr-4 pt-1">ยอดสุทธิ</td>
                  <td className="text-right tabular-nums pt-1">{totals.net_total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-right italic">({bahttext(totals.net_total || totals.grand_total)})</p>
      {state.vat_mode === "inclusive_note" && (
        <p className="mt-1 text-[10px] text-gray-500 text-right">* ราคานี้รวม VAT แล้ว</p>
      )}
      {state.show_payment_method !== false && state.payment_method && (
        <p className="mt-2 text-xs">วิธีจ่ายเงิน: <span className="font-medium">{state.payment_method}</span></p>
      )}
      {state.notes && <p className="mt-4 text-xs whitespace-pre-line border-t border-gray-200 pt-2">{state.notes}</p>}
      {footerText && <p className="mt-3 text-xs whitespace-pre-line border-t border-gray-200 pt-2 text-gray-700">{footerText}</p>}
    </div>
  );
}

function SignatureBlock({ docType, showDate, docDate }: { docType: string; showDate: boolean; docDate: string }) {
  const signers = signersFor(docType);
  if (signers.length === 1) {
    return (
      <div className="mt-10 avoid-break doc-signature doc-signature-single text-center text-xs text-gray-700">
        <div
          className="doc-signature-longline mx-auto"
          aria-hidden="true"
          style={{ width: "42%", maxWidth: "72mm", minWidth: "180px", borderBottom: "1.2px dotted #4b5563", height: 0, marginTop: "18mm" }}
        />
        <div className="mt-1">{signers[0]}</div>
      </div>
    );
  }
  const cols = signers.length === 2 ? "grid-cols-2" : "grid-cols-3";
  return (
    <div className={`mt-10 grid ${cols} gap-4 text-xs text-center avoid-break doc-signature`}>
      {signers.map((label) => (
        <div key={label}>
          <div className="border-t border-dotted border-gray-600 mt-10 pt-1">{label}</div>
        </div>
      ))}
    </div>
  );
}

export default function DocumentPreview({
  store,
  state,
  totals,
  docNo,
  templateConfig,
  hiddenColumns,
  rootId = "doc-print",
  orient = "portrait",
  showPageNumbers = true,
  customPaper,
  pageLayout,
  paginationKeyExtra,
  discountStyle,
}: {
  store: RdsStore | null;
  state: DocFormState;
  totals: Totals;
  docNo?: string | null;
  templateConfig?: ResolvedTemplateConfig | null;
  hiddenColumns?: string[];
  rootId?: string | null;
  orient?: "portrait" | "landscape";
  showPageNumbers?: boolean;
  customPaper?: { widthMm?: number; heightMm?: number } | null;
  pageLayout?: DocumentPageLayoutInput | null;
  paginationKeyExtra?: Record<string, unknown>;
  /** Typography overrides for the discount rows (print-only presentation). */
  discountStyle?: DiscountTableStyle | null;
}) {
  const template: DocTemplate = state.template ?? "modern";
  const hiddenSet = new Set(hiddenColumns ?? []);
  const visibleItems = state.items.filter((it) => it.name || it.price);
  const padCls = template === "compact" ? "p-4 print:p-3" : "p-6 print:p-4";
  const frameCls = template === "formal" ? "border-2 border-double border-gray-700" : "";
  const baseAccent = docAccentVars(state.document_type, store);
  const overrideHex = templateConfig?.accent_color ?? undefined;
  const overrideHsl = overrideHex ? hexToHslTriplet(overrideHex) : null;
  const accent = overrideHex
    ? { titleHex: overrideHex, headerHex: overrideHex, titleHsl: overrideHsl, headerHsl: overrideHsl }
    : baseAccent;
  const accentStyle: React.CSSProperties = accent.titleHsl
    ? ({
        ["--brand" as any]: accent.titleHsl,
        ["--brand-soft" as any]: accent.headerHsl ?? accent.titleHsl,
      } as React.CSSProperties)
    : {};
  const rootPageLayout = resolveDocumentPageLayout(templateConfig, pageLayout);
  const rootStyle: React.CSSProperties = {
    ["--doc-font-scale" as any]: String(state.font_scale ?? 1),
    ["--doc-page-width" as any]: `${rootPageLayout.widthMm}mm`,
    ["--doc-page-height" as any]: `${rootPageLayout.heightMm}mm`,
    ["--doc-page-padding" as any]: rootPageLayout.paddingCss,
    ...discountStyleVars(discountStyle),
    ...accentStyle,

  };
  if (template === "modern") {
    return (
      <div
        className="text-black mx-auto"
        id={rootId ?? undefined}
        data-paper={state.paper_size}
        data-doc-type={state.document_type}
        style={rootStyle}
      >
        <ModernPage
          store={store}
          state={state}
          totals={totals}
          docNo={docNo}
          items={visibleItems}
          headerText={templateConfig?.header_text}
          footerText={templateConfig?.footer_text}
          accentColor={accent.titleHex}
          cfg={templateConfig ?? null}
          hiddenColumns={hiddenSet}
          orient={orient}
          customPaper={customPaper}
          pageLayout={pageLayout}
          paginationKeyExtra={paginationKeyExtra}
        />
      </div>
    );
  }
  // Non-modern templates (classic/compact/formal) — also paginate using the
  // same deterministic algorithm so preview, print and exporters agree on
  // page count.
  const pageCfg = rootPageLayout;
  const paperDim = { w: pageCfg.widthMm, h: pageCfg.heightMm };
  const marginsMm = pageCfg.paddingMm;
  const lockedPaper: PaperSize = pageCfg.widthMm === 210 && pageCfg.heightMm === 297 ? "A4" : "custom";
  const trailerMm =
    38 + 34 +
    (state.notes ? Math.min(30, 6 + Math.min(4, state.notes.split(/\r?\n/).length) * 4) : 0) +
    (templateConfig?.footer_text ? Math.min(30, 6 + Math.min(4, templateConfig.footer_text.split(/\r?\n/).length) * 4) : 0);
  const pages = paginateMainDocumentCached({
    paperSize: lockedPaper,
    orient: "portrait",
    customPaper: lockedPaper === "custom" ? { widthMm: pageCfg.widthMm, heightMm: pageCfg.heightMm } : null,
    marginsMm,
    fontScale: Number(state.font_scale ?? 1) || 1,
    items: visibleItems.map((it) => itemToPaginateHints({ name: it.name, description: it.description })),
    trailerMm,
    trailerBlocks: [state.notes ? "notes" : null, "amountWords", "signature"].filter(Boolean) as any,
  }, {
    docNo,
    docType: state.document_type,
    template,
    notes: state.notes,
    footerText: templateConfig?.footer_text,
    totals: { grand: totals.grand_total, net: totals.net_total },
    extra: paginationKeyExtra,
  });
  const totalPages = pages.length;
  const pageGapMm = Math.min(40, Math.max(8, Number(templateConfig?.page_gap_mm ?? 16) || 16));
  return (
    <div
      className="text-black mx-auto"
      id={rootId ?? undefined}
      data-paper={state.paper_size}
      data-doc-type={state.document_type}
      style={rootStyle}
    >
      {pages.map((page, pageIdx) => {
        const pageItems = visibleItems.slice(page.startIndex, page.startIndex + page.count);
        const warningText = page.warnings?.length
          ? `พื้นที่หน้าไม่พอ ระบบย้าย ${page.warnings.map((w) => w.label).join(", ")} ไปหน้า ${page.warnings[0].toPage}`
          : null;
        return (
          <React.Fragment key={`np-wrap-${pageIdx}`}>
          {pageIdx > 0 && (
            <div
              className="doc-page-divider no-print"
              role="separator"
              aria-label={`ตัวคั่นก่อนหน้า ${pageIdx + 1}`}
              style={{ width: `${paperDim.w}mm` }}
            >
              <span>— หน้า {pageIdx + 1} / {totalPages} —</span>
            </div>
          )}
          <section
            key={`np-${pageIdx}`}
            className={`doc-page ${padCls} ${frameCls} mx-auto print:shadow-none`}
            data-page-idx={pageIdx + 1}
            data-page-total={totalPages}
            data-page-role={page.hasTrailer ? "last" : page.isFirst ? "first" : "middle"}
            data-overflow={page.warnings?.length ? "true" : "false"}
            style={{
              width: `${paperDim.w}mm`,
              minHeight: `${paperDim.h}mm`,
              ["--doc-page-width" as any]: `${pageCfg.widthMm}mm`,
              ["--doc-page-height" as any]: `${pageCfg.heightMm}mm`,
              ["--doc-page-padding" as any]: pageCfg.paddingCss,
              padding: pageCfg.paddingCss,
              boxSizing: "border-box",
              background: "#ffffff",
              position: "relative",
              marginTop: pageIdx === 0 ? undefined : `${pageGapMm}mm`,
              boxShadow: "none",
              overflow: "hidden",
              breakBefore: pageIdx === 0 ? undefined : "page",
              pageBreakBefore: pageIdx === 0 ? undefined : "always",
            }}
          >
            {warningText && (
              <div className="no-print doc-pagination-warning mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                {warningText}
              </div>
            )}
            <AccentTopBar color={accent.titleHex} />
            {page.isFirst && <CornerRibbon docType={state.document_type} color={accent.titleHex} />}
            {page.isFirst ? (
              <PageHeader store={store} state={state} docNo={docNo} template={template} headerText={templateConfig?.header_text} />
            ) : (
              <div className="doc-header-compact flex items-center justify-between text-xs pb-1 border-b border-gray-300">
                <div className="font-semibold" style={{ color: "hsl(var(--brand))" }}>{resolveDocTitle(state.document_type, store)} · {docNo || "—"}</div>
                <div className="truncate max-w-[50%] text-right">{state.customer_name || "—"}</div>
              </div>
            )}
            {pageItems.length > 0 && <ItemsTableBlock items={pageItems} startIndex={page.startIndex} />}
            {page.hasTrailer && (
              <>
                <TotalsBlock store={store} state={state} totals={totals} footerText={templateConfig?.footer_text} />
                <SignatureBlock docType={state.document_type} showDate={false} docDate={state.document_date} />
              </>
            )}
            {warningText && (
              <div className="no-print doc-pagination-badge absolute rounded-sm bg-amber-100 px-2 py-1 text-[10px] text-amber-900" style={{ right: "8mm", bottom: "11mm" }}>
                ย้ายไปหน้า {page.warnings?.[0]?.toPage}
              </div>
            )}
          </section>
          </React.Fragment>
        );
      })}
    </div>
  );
}