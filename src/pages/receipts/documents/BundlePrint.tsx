import React, { useLayoutEffect, useRef } from "react";
import DocumentPreview, { resolveDocumentPageLayout, discountStyleVars, type DocumentPageLayoutInput, type DiscountTableStyle } from "./DocumentPreview";
import type { DocFormState, DocumentType, Totals } from "./useDocumentForm";
import type { RdsStore } from "../types";
import type { ResolvedTemplateConfig } from "../lib/layouts";
import { flattenBundleOrder, PAPER_SIZE_MM_BASE, type PrintBundleSelection } from "../lib/printPrefs";

export type BundleDocRef = {
  id: string;
  type: DocumentType;
  docNo?: string | null;
};

export type BundleAttachmentRef = {
  id: string;
  label: string;
  url?: string | null;
  file?: File;
  /**
   * Pre-rasterized pages of this attachment. When provided, the print pipeline
   * renders one `.doc-page` per entry (using `<img>` so html2canvas/jsPDF can
   * capture it) — this keeps Print / PDF / PNG / JPG output pixel-identical to
   * the on-screen preview and preserves the bundle order for multi-page PDFs.
   */
  pages?: { dataUrl: string; width: number; height: number }[];
  /** Non-blocking status hint shown on the attachment page header. */
  status?: "ok" | "loading" | "error" | "unsupported";
  statusMessage?: string;
};

/** Physical paper dimensions (mm). Exported so PrintPreview and tests can
 *  share the exact same mapping and stay in sync with attachment page shape. */
export const PAPER_DIMENSIONS_MM = PAPER_SIZE_MM_BASE;

function attachmentUrl(att: BundleAttachmentRef): string | null {
  if (att.url) return att.url;
  if (att.file && typeof URL !== "undefined") return URL.createObjectURL(att.file);
  return null;
}

function AttachmentPageFallback({ att, paperW, paperH }: { att: BundleAttachmentRef; paperW: number; paperH: number }) {
  const url = attachmentUrl(att);
  const isPdf = !!url && /\.pdf(\?|$)/i.test(url);
  return (
    <section className="doc-page attachment-page mx-auto bg-white print:shadow-none" data-page-idx={1} style={{ width: `${paperW}mm`, minHeight: `${paperH}mm`, padding: "12mm", boxSizing: "border-box", color: "#111827", background: "#fff" }}>
      <div className="attachment-page__header" style={{ fontSize: 12, borderBottom: "1px solid #e5e7eb", paddingBottom: 6, marginBottom: 8 }}>
        เอกสารแนบ — {att.label}
        {att.status === "loading" ? " · กำลังเตรียมไฟล์…" : ""}
        {att.status === "error" && att.statusMessage ? ` · ${att.statusMessage}` : ""}
      </div>
      {!url ? (
        <div style={{ fontSize: 13, color: "#b91c1c" }}>ไม่พบไฟล์แนบ</div>
      ) : isPdf ? (
        <iframe src={url} title={att.label} style={{ width: "100%", height: `${Math.max(80, paperH - 30)}mm`, border: 0 }} />
      ) : (
        <img src={url} alt={att.label} crossOrigin="anonymous" style={{ display: "block", maxWidth: "100%", maxHeight: `${Math.max(80, paperH - 30)}mm`, margin: "0 auto", objectFit: "contain" }} />
      )}
    </section>
  );
}

function AttachmentPagesRasterized({ att, paperW, paperH }: { att: BundleAttachmentRef; paperW: number; paperH: number }) {
  const pages = att.pages ?? [];
  return (
    <>
      {pages.map((page, i) => (
        <section
          key={`${att.id}-p${i}`}
          className="doc-page attachment-page mx-auto bg-white print:shadow-none"
          data-att-id={att.id}
          data-att-page-idx={i + 1}
          data-att-page-total={pages.length}
          style={{
            width: `${paperW}mm`,
            minHeight: `${paperH}mm`,
            padding: "12mm",
            boxSizing: "border-box",
            color: "#111827",
            background: "#fff",
            breakBefore: i === 0 ? undefined : "page",
            pageBreakBefore: i === 0 ? undefined : "always",
          }}
        >
          <div
            className="attachment-page__header"
            style={{
              fontSize: 12,
              borderBottom: "1px solid #e5e7eb",
              paddingBottom: 6,
              marginBottom: 8,
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span>เอกสารแนบ — {att.label}</span>
            {pages.length > 1 ? <span>หน้า {i + 1}/{pages.length}</span> : null}
          </div>
          <img
            src={page.dataUrl}
            alt={`${att.label} (${i + 1}/${pages.length})`}
            style={{
              display: "block",
              maxWidth: "100%",
              maxHeight: `${Math.max(80, paperH - 30)}mm`,
              margin: "0 auto",
              objectFit: "contain",
            }}
          />
        </section>
      ))}
    </>
  );
}

function AttachmentPage({ att, paperW, paperH }: { att: BundleAttachmentRef; paperW: number; paperH: number }) {
  if (att.pages && att.pages.length > 0) return <AttachmentPagesRasterized att={att} paperW={paperW} paperH={paperH} />;
  return <AttachmentPageFallback att={att} paperW={paperW} paperH={paperH} />;
}

export function BundlePrint({
  store,
  state,
  totals,
  mainDocNo,
  docs,
  attachments,
  bundle,
  templateConfig,
  hiddenColumns,
  orient = "portrait",
  customPaper,
  pageLayout,
  discountStyle,
}: {
  store: RdsStore | null;
  state: DocFormState;
  totals: Totals;
  mainDocNo?: string | null;
  docs: BundleDocRef[];
  attachments: BundleAttachmentRef[];
  bundle: PrintBundleSelection;
  templateConfig?: ResolvedTemplateConfig | null;
  hiddenColumns?: string[];
  orient?: "portrait" | "landscape";
  customPaper?: { widthMm?: number; heightMm?: number } | null;
  pageLayout?: DocumentPageLayoutInput | null;
  /** Typography overrides for the discount rows (print-only presentation). */
  discountStyle?: DiscountTableStyle | null;
}) {

  const docsById = new Map(docs.map((doc) => [doc.id, doc]));
  const attsById = new Map(attachments.map((att) => [att.id, att]));
  const ordered = flattenBundleOrder(bundle).filter((id) => id === "doc:main" || docsById.has(id) || attsById.has(id));
  const finalOrder = ordered.length ? ordered : ["doc:main"];
  const rootRef = useRef<HTMLDivElement | null>(null);
  const docPageLayout = resolveDocumentPageLayout(templateConfig, pageLayout);
  const paperDims = { w: docPageLayout.widthMm, h: docPageLayout.heightMm };

  // Page numbers intentionally removed per product requirement. We still
  // tag each `.doc-page` with its bundle index so downstream tooling
  // (print range, screenshots) can reference them, but nothing is rendered.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const pages = Array.from(root.querySelectorAll<HTMLElement>(".doc-page"));
    const total = pages.length;
    pages.forEach((el, i) => {
      el.setAttribute("data-bundle-page", String(i + 1));
      el.setAttribute("data-bundle-total", String(total));
      // Defensive: remove any legacy badge that a previous build injected.
      el.querySelector(":scope > .bundle-page-num")?.remove();
    });
  });

  return (
    <div
      ref={rootRef}
      id="doc-print"
      data-doc-print
      data-paper={state.paper_size ?? "A4"}
      data-paper-width-mm={paperDims.w}
      data-paper-height-mm={paperDims.h}
      data-orient={orient}
      style={{
        ["--doc-font-scale" as any]: String(state.font_scale ?? 1),
        ["--doc-page-width" as any]: `${docPageLayout.widthMm}mm`,
        ["--doc-page-height" as any]: `${docPageLayout.heightMm}mm`,
        ["--doc-page-padding" as any]: docPageLayout.paddingCss,
        ...discountStyleVars(discountStyle),
      }}
    >
      {finalOrder.map((id, index) => {
        const doc = id === "doc:main" ? { id, type: state.document_type, docNo: mainDocNo } : docsById.get(id);
        const att = attsById.get(id);
        return (
          <div key={`${id}-${index}`} className="doc-print-document" data-bundle-id={id} style={index === 0 ? undefined : { breakBefore: "page", pageBreakBefore: "always" }}>
            {doc ? (
              <DocumentPreview
                store={store}
                state={{ ...state, document_type: doc.type }}
                totals={totals}
                docNo={doc.docNo ?? (doc.id === "doc:main" ? mainDocNo : "(ออกหลังบันทึก)")}
                templateConfig={templateConfig}
                hiddenColumns={hiddenColumns}
                rootId={null}
                orient={orient}
                customPaper={customPaper}
                pageLayout={docPageLayout}
                paginationKeyExtra={{
                  bundleOrder: finalOrder,
                  bundleId: id,
                  docNo: doc.docNo ?? mainDocNo,
                  attachmentCount: attachments.length,
                }}
              />
            ) : att ? (
              <AttachmentPage att={att} paperW={paperDims.w} paperH={paperDims.h} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function bundleCompanionSet(bundle: PrintBundleSelection, mainType: DocumentType): "none" | "delivery" | "receipt" | "both" {
  const ids = flattenBundleOrder(bundle);
  const hasDelivery = ids.includes("doc:delivery") && mainType !== "delivery";
  const hasReceipt = ids.includes("doc:receipt") && mainType !== "receipt";
  if (hasDelivery && hasReceipt) return "both";
  if (hasDelivery) return "delivery";
  if (hasReceipt) return "receipt";
  return "none";
}

export function defaultBundleDocIds(mainType: DocumentType, companionSet: string | undefined): string[] {
  const ids = ["doc:main"];
  if (companionSet === "delivery" || companionSet === "both") {
    if (mainType !== "delivery") ids.push("doc:delivery");
  }
  if (companionSet === "receipt" || companionSet === "both") {
    if (mainType !== "receipt") ids.push("doc:receipt");
  }
  return ids;
}