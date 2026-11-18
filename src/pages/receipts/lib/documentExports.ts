/**
 * Extra document export formats: PNG, JPG, Excel.
 *
 * These are additive to the existing PDF + print flows. They operate on the
 * currently-mounted `#doc-print` element in the DOM so that whatever the user
 * sees in the on-screen preview is what gets exported — no separate rendering
 * pipeline that could drift out of sync.
 */
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import type { DocFormState, DocItem, Totals } from "../documents/useDocumentForm";
import { calcLineTotal } from "../documents/useDocumentForm";
import type { RdsStore } from "../types";
import type { AttachmentRef, RenderedAttachment } from "./attachmentRender";
import { flattenSelectedPages } from "./attachmentRender";

export interface AttachmentExportInput {
  rendered: RenderedAttachment[];
  selection: { order: string[]; selected: Record<string, boolean> };
  /** Original attachment refs — used by the XLSX sheet so we can list URL /
   * type / size / order even for entries that failed to render. */
  refs: AttachmentRef[];
}

function getPrintNode(): HTMLElement | null {
  // Prefer the always-mounted preview node used by the print flow.
  return document.getElementById("doc-print") as HTMLElement | null;
}

async function snapshotToCanvas(): Promise<HTMLCanvasElement> {
  const el = getPrintNode();
  if (!el) throw new Error("ไม่พบเอกสารพรีวิว (#doc-print)");
  // scale 3 gives crisp Thai glyphs that render well when shared via LINE.
  return await html2canvas(el, {
    scale: 3,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
  });
}

async function snapshotToCanvases(): Promise<HTMLCanvasElement[]> {
  const el = getPrintNode();
  if (!el) throw new Error("ไม่พบเอกสารพรีวิว (#doc-print)");
  const pages = Array.from(el.querySelectorAll<HTMLElement>(".doc-page"));
  const targets = pages.length > 1 ? pages : [el];
  const out: HTMLCanvasElement[] = [];
  for (const target of targets) {
    out.push(await html2canvas(target, {
      scale: 3,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      ignoreElements: (node) => node instanceof HTMLElement && (node.classList.contains("no-print") || node.hasAttribute("data-no-print")),
    }));
  }
  return out;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function baseFilename(state: DocFormState, docNo: string | null | undefined): string {
  const type = state.document_type || "document";
  const no = (docNo || "DRAFT").replace(/[^\w\-]+/g, "_");
  return `${type}-${no}`;
}

export async function exportDocumentAsPng(
  state: DocFormState,
  docNo: string | null | undefined,
  attachments?: AttachmentExportInput,
): Promise<void> {
  await exportMultiPageImage(state, docNo, "image/png", "png", attachments);
}

export async function exportDocumentAsJpg(
  state: DocFormState,
  docNo: string | null | undefined,
  attachments?: AttachmentExportInput,
): Promise<void> {
  await exportMultiPageImage(state, docNo, "image/jpeg", "jpg", attachments, 0.95);
}

/**
 * Export the main document as a rasterized image, and — if the user has
 * selected attachments — append every attachment page as its own image and
 * package the result as a ZIP so nothing is lost.
 *
 *   0 attachment pages  →  single .png / .jpg
 *   ≥1 attachment page  →  .zip containing page-01, page-02, …
 *
 * File names inside the zip make the ordering unambiguous.
 */
async function exportMultiPageImage(
  state: DocFormState,
  docNo: string | null | undefined,
  mime: "image/png" | "image/jpeg",
  ext: "png" | "jpg",
  attachments: AttachmentExportInput | undefined,
  quality?: number,
): Promise<void> {
  const canvases = await snapshotToCanvases();
  const mainBlobs = await Promise.all(canvases.map((canvas) => canvasToBlob(canvas, mime, quality)));
  const attPages = attachments
    ? flattenSelectedPages(attachments.rendered, attachments.selection)
    : [];

  const base = baseFilename(state, docNo);

  if (attPages.length === 0 && mainBlobs.length === 1) {
    triggerDownload(mainBlobs[0], `${base}.${ext}`);
    return;
  }

  // Convert each attachment page's dataUrl into a blob in the target mime.
  const attachmentBlobs: { name: string; blob: Blob }[] = [];
  for (let i = 0; i < attPages.length; i++) {
    const p = attPages[i];
    const blob = await dataUrlToBlob(p.page.dataUrl, mime, quality);
    attachmentBlobs.push({
      name: `page-${String(mainBlobs.length + i + 1).padStart(2, "0")}-${sanitize(p.name)}.${ext}`,
      blob,
    });
  }

  const zip = new JSZip();
  mainBlobs.forEach((blob, i) => zip.file(`page-${String(i + 1).padStart(2, "0")}-${sanitize(base)}.${ext}`, blob));
  for (const a of attachmentBlobs) zip.file(a.name, a.blob);
  const zipBlob = await zip.generateAsync({ type: "blob" });
  triggerDownload(zipBlob, `${base}-pages.zip`);
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error(`แปลงรูป ${mime} ไม่สำเร็จ`))),
      mime,
      quality,
    );
  });
}

async function dataUrlToBlob(
  dataUrl: string,
  mime: string,
  quality?: number,
): Promise<Blob> {
  // If the dataUrl already matches the requested mime, decode directly.
  const [meta] = dataUrl.split(",", 1);
  if (meta?.includes(mime)) {
    const r = await fetch(dataUrl);
    return await r.blob();
  }
  // Otherwise re-encode via a canvas so PDF-rendered JPEG pages become PNGs
  // (and vice versa) when the user picks a specific export format.
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("อ่านภาพหน้าไฟล์แนบไม่ได้"));
    el.src = dataUrl;
  });
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas context ไม่พร้อม");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0);
  return await canvasToBlob(c, mime, quality);
}

function sanitize(s: string): string {
  return s.replace(/[^\w\-]+/g, "_").slice(0, 40);
}

/**
 * Excel export uses the real document data (not a screenshot) so values are
 * editable/filterable downstream. Layout: store header block → parties → items
 * table → totals block → footer note.
 */
export function exportDocumentAsXlsx(opts: {
  state: DocFormState;
  totals: Totals;
  items: DocItem[];
  store: RdsStore | null;
  docNo: string | null | undefined;
  headerText?: string;
  footerText?: string;
  attachments?: AttachmentExportInput;
  /** Column keys hidden by the user (e.g. ["qty","unit","price"]). Applies
   *  to both header + item rows so the Excel export mirrors what the user
   *  chose in the print settings panel. */
  hiddenColumns?: string[];
}): void {
  const { state, totals, items, store, docNo, headerText, footerText, attachments, hiddenColumns = [] } = opts;
  const hide = new Set(hiddenColumns);
  // Money cells are pushed as XLSX cell objects so Excel renders them with
  // exactly two decimals ("#,##0.00") — matching the on-screen preview and
  // avoiding the ฿ symbol. Non-money cells stay as plain string/number
  // primitives.
  const money = (v: number) => ({ v, t: "n" as const, z: "#,##0.00" });
  type Cell = string | number | { v: number; t: "n"; z: string };
  const rows: Cell[][] = [];

  const docTitle: Record<string, string> = {
    receipt: "ใบเสร็จรับเงิน",
    delivery: "ใบส่งของ",
    invoice: "ใบแจ้งหนี้",
    quotation: "ใบเสนอราคา",
    tax_invoice: "ใบกำกับภาษี/ใบเสร็จรับเงิน",
  };

  rows.push([store?.name || "-"]);
  if (store?.address) rows.push([store.address]);
  if (store?.phone) rows.push([`โทร ${store.phone}`]);
  if (store?.tax_id) rows.push([`เลขผู้เสียภาษี ${store.tax_id}`]);
  if (headerText) rows.push([headerText]);
  rows.push([]);

  const combinedForColorlab =
    store?.slug === "colorlab" && (state.document_type === "receipt" || state.document_type === "tax_invoice");
  rows.push([combinedForColorlab ? "ใบเสร็จรับเงิน/ใบกำกับภาษี" : (docTitle[state.document_type] || "เอกสาร")]);
  rows.push([`เลขที่`, docNo || "DRAFT", "", "วันที่", new Date(state.document_date).toLocaleDateString("th-TH")]);
  rows.push([]);

  rows.push(["ลูกค้า", state.customer_name || "-"]);
  if (state.customer_address) rows.push(["ที่อยู่", state.customer_address]);
  if (state.customer_phone) rows.push(["โทรศัพท์", state.customer_phone]);
  if (state.customer_tax_id) rows.push(["เลขผู้เสียภาษี", state.customer_tax_id + (state.customer_branch ? ` (${state.customer_branch})` : "")]);
  rows.push([]);

  // Column layout mirrors the on-screen items table. Hiding a column from
  // the print settings panel removes both the header cell and the value
  // cell so the resulting sheet stays aligned.
  const cols: { key: string; header: string; value: (it: DocItem, i: number) => Cell }[] = [
    { key: "index",   header: "ลำดับ",       value: (_it: DocItem, i: number) => i + 1 as number | string },
    { key: "name",    header: "รายการ",      value: (it: DocItem, i: number) => it.name || `รายการที่ ${i + 1}` },
    { key: "desc",    header: "รายละเอียด",  value: (it: DocItem) => it.description || "" },
    { key: "qty",     header: "จำนวน",       value: (it: DocItem) => Number(it.quantity) || 0 },
    { key: "unit",    header: "หน่วย",       value: (it: DocItem) => it.unit || "" },
    { key: "price",   header: "ราคา/หน่วย",  value: (it: DocItem) => money(Number(it.price) || 0) },
    { key: "total",   header: "จำนวนเงิน",   value: (it: DocItem) => money(calcLineTotal(it)) },
  ].filter((c) => !hide.has(c.key));
  rows.push(cols.map((c) => c.header));
  items.forEach((it, i) => {
    rows.push(cols.map((c) => c.value(it, i)));
  });
  rows.push([]);

  rows.push(["", "", "", "", "", "รวม", money(totals.subtotal)]);
  // ส่วนลดท้ายบิล — ต้องตรงกับที่แสดงในพรีวิว/พิมพ์ (สวิตช์ "ใช้ส่วนลด" จะ
  // ส่ง state.discount_amount = 0 เข้ามาเมื่อผู้ใช้เลือก "ไม่ใช้ส่วนลด")
  if (totals.discount_total > 0) {
    rows.push(["", "", "", "", "", "ส่วนลด", money(-totals.discount_total)]);
    rows.push(["", "", "", "", "", "หลังหักส่วนลด", money(Math.max(0, totals.subtotal - totals.discount_total))]);
  }
  if (state.vat_mode !== "none") {
    rows.push(["", "", "", "", "", "ก่อน VAT", money(totals.amount_before_vat)]);
    rows.push(["", "", "", "", "", `VAT ${state.vat_rate}%`, money(totals.vat_amount)]);
  }
  if (state.withholding_tax_enabled) {
    rows.push(["", "", "", "", "", `หัก ณ ที่จ่าย ${state.withholding_tax_rate}%`, money(-totals.withholding_tax_amount)]);
  }
  rows.push(["", "", "", "", "", "ยอดรวม", money(totals.net_total || totals.grand_total)]);

  rows.push([]);

  if (state.payment_method) rows.push(["วิธีจ่ายเงิน", state.payment_method]);
  if (state.notes) rows.push(["หมายเหตุ", state.notes]);
  if (footerText) rows.push([footerText]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 8 }, { wch: 32 }, { wch: 24 }, { wch: 10 },
    { wch: 10 }, { wch: 14 }, { wch: 14 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Document");

  // Attachments sheet — always structured data (never rasterized). Lists
  // selected attachments in the exact same order used everywhere else in the
  // pipeline, so the Excel file stays in sync with print/PDF/PNG/JPG output.
  if (attachments && (attachments.refs.length > 0 || attachments.selection.order.length > 0)) {
    const attRows: (string | number)[][] = [];
    attRows.push(["ลำดับ", "ชื่อไฟล์", "ประเภท", "ขนาด (bytes)", "URL", "สถานะ"]);
    const byId = new Map(attachments.refs.map((r) => [r.id, r]));
    const ordered = attachments.selection.order.length > 0
      ? attachments.selection.order
      : attachments.refs.map((r) => r.id);
    const renderedById = new Map(attachments.rendered.map((r) => [r.ref.id, r]));
    let seq = 0;
    for (const id of ordered) {
      if (attachments.selection.selected[id] === false) continue;
      const ref = byId.get(id);
      if (!ref) continue;
      const r = renderedById.get(id);
      const status =
        r?.status === "ok"
          ? r.kind === "pdf"
            ? `PDF ${r.pages.length} หน้า`
            : "รูปภาพ"
          : r?.status === "unsupported"
            ? `ไม่รองรับ: ${r.reason}`
            : r?.status === "error"
              ? `โหลดไม่สำเร็จ: ${r.error}`
              : "ยังไม่ประมวลผล";
      seq += 1;
      attRows.push([
        seq,
        ref.name,
        ref.type || (ref.name.match(/\.[^.]+$/)?.[0] ?? ""),
        typeof ref.size === "number" ? ref.size : "",
        ref.url || ref.path,
        status,
      ]);
    }
    const attWs = XLSX.utils.aoa_to_sheet(attRows);
    attWs["!cols"] = [{ wch: 8 }, { wch: 40 }, { wch: 16 }, { wch: 14 }, { wch: 60 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, attWs, "ไฟล์แนบ");
  }

  XLSX.writeFile(wb, `${baseFilename(state, docNo)}.xlsx`);
}
/**
 * CSV export (Excel-compatible, UTF-8 BOM) built from the same document data
 * the preview renders — including the discount rows, so the file matches the
 * "ใช้ส่วนลด / ไม่ใช้ส่วนลด" switch chosen on the print page.
 */
export function exportDocumentAsCsv(opts: {
  state: DocFormState;
  totals: Totals;
  items: DocItem[];
  store: RdsStore | null;
  docNo: string | null | undefined;
  hiddenColumns?: string[];
}): void {
  const { state, totals, items, store, docNo, hiddenColumns = [] } = opts;
  const hide = new Set(hiddenColumns);
  const n2 = (v: number) => (Math.round(v * 100) / 100).toFixed(2);
  const rows: (string | number)[][] = [];

  rows.push([store?.name || "-"]);
  rows.push(["เลขที่", docNo || "DRAFT", "วันที่", new Date(state.document_date).toLocaleDateString("th-TH")]);
  rows.push(["ลูกค้า", state.customer_name || "-"]);
  rows.push([]);

  const cols: { key: string; header: string; value: (it: DocItem, i: number) => string | number }[] = [
    { key: "index", header: "ลำดับ", value: (_it, i) => i + 1 },
    { key: "name", header: "รายการ", value: (it, i) => it.name || `รายการที่ ${i + 1}` },
    { key: "desc", header: "รายละเอียด", value: (it) => it.description || "" },
    { key: "qty", header: "จำนวน", value: (it) => Number(it.quantity) || 0 },
    { key: "unit", header: "หน่วย", value: (it) => it.unit || "" },
    { key: "price", header: "ราคา/หน่วย", value: (it) => n2(Number(it.price) || 0) },
    { key: "total", header: "จำนวนเงิน", value: (it) => n2(calcLineTotal(it)) },
  ].filter((c) => !hide.has(c.key));
  rows.push(cols.map((c) => c.header));
  items.forEach((it, i) => rows.push(cols.map((c) => c.value(it, i))));
  rows.push([]);

  rows.push(["รวม", n2(totals.subtotal)]);
  if (totals.discount_total > 0) {
    rows.push(["ส่วนลด", n2(-totals.discount_total)]);
    rows.push(["หลังหักส่วนลด", n2(Math.max(0, totals.subtotal - totals.discount_total))]);
  }
  if (state.vat_mode !== "none") {
    rows.push(["ก่อน VAT", n2(totals.amount_before_vat)]);
    rows.push([`VAT ${state.vat_rate}%`, n2(totals.vat_amount)]);
  }
  if (state.withholding_tax_enabled) {
    rows.push([`หัก ณ ที่จ่าย ${state.withholding_tax_rate}%`, n2(-totals.withholding_tax_amount)]);
  }
  rows.push(["ยอดรวม", n2(totals.net_total || totals.grand_total)]);

  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${baseFilename(state, docNo)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
