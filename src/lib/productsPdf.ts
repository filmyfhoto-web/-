import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type ProductPdfRow = {
  code?: string;
  barcode?: string;
  name?: string;
  category?: string;
  unit?: string;
  stock?: number | string;
  price?: number | string;
};

const BRAND_EN = "Nattapron Color Lab & Printing";
const BRAND_TH = "นัฐภรณ์คัลเลอร์แล็ป & การพิมพ์";

/**
 * Build a products catalog PDF (jsPDF). Every page gets:
 *  - a diagonal English watermark "Nattapron Color Lab & Printing" (light grey)
 *  - a header with the brand name
 *  - a footer that includes the exact download timestamp + page number
 *
 * Returns the Blob; the caller is responsible for triggering the download
 * (we keep the I/O at the call-site so tests can introspect the buffer).
 */
export function makeProductsPdf(rows: ProductPdfRow[], opts?: {
  subtitle?: string;
  filterLabel?: string;
  generatedAt?: Date;
}): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const generatedAt = opts?.generatedAt ?? new Date();
  const stamp = `${generatedAt.toISOString()} (${generatedAt.toLocaleString("th-TH")})`;

  // Title block (page 1 — autoTable handles repeats per page via didDrawPage)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(BRAND_EN, 14, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(BRAND_TH, 14, 22);
  if (opts?.subtitle) doc.text(opts.subtitle, 14, 27);
  if (opts?.filterLabel) doc.text(opts.filterLabel, 14, 32);

  autoTable(doc, {
    startY: 38,
    margin: { top: 38, bottom: 18, left: 12, right: 12 },
    head: [["#", "Code", "Barcode", "Item / รายการ", "Unit", "Stock", "Price"]],
    body: rows.map((r, i) => [
      i + 1,
      r.code ?? "",
      r.barcode ?? "",
      r.name ?? "",
      r.unit ?? "",
      r.stock == null ? "" : String(r.stock),
      r.price == null ? "" : String(r.price),
    ]),
    styles: { fontSize: 9, cellPadding: 1.6, overflow: "linebreak" },
    headStyles: { fillColor: [230, 30, 90], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 8, halign: "right" },
      1: { cellWidth: 22 },
      2: { cellWidth: 28 },
      4: { cellWidth: 14 },
      5: { cellWidth: 16, halign: "right" },
      6: { cellWidth: 22, halign: "right" },
    },
    didDrawPage: () => {
      // Diagonal watermark — drawn on every page so reprints/refreshes can't strip it.
      doc.saveGraphicsState?.();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(42);
      doc.setTextColor(220, 220, 220);
      // jsPDF accepts angle via text options
      doc.text(BRAND_EN, pageW / 2, pageH / 2, { align: "center", angle: 30 } as any);
      doc.setTextColor(0, 0, 0);
      doc.restoreGraphicsState?.();

      // Footer: store name + download timestamp + page number
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const pageNo = (doc as any).internal.getNumberOfPages?.() ?? 1;
      const footerLeft = `${BRAND_EN} — ${BRAND_TH}`;
      const footerCenter = `Downloaded: ${stamp}`;
      doc.text(footerLeft, 12, pageH - 8);
      doc.text(footerCenter, pageW / 2, pageH - 8, { align: "center" });
      doc.text(`Page ${pageNo}`, pageW - 12, pageH - 8, { align: "right" });
    },
  });

  // Add PDF metadata so the brand survives even when the body is searched.
  doc.setProperties({
    title: `${BRAND_EN} — Products`,
    subject: opts?.subtitle ?? "Products catalog",
    author: BRAND_EN,
    creator: BRAND_EN,
  });

  return doc.output("blob");
}

export function downloadProductsPdf(filename: string, rows: ProductPdfRow[], opts?: Parameters<typeof makeProductsPdf>[1]) {
  const blob = makeProductsPdf(rows, opts);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}