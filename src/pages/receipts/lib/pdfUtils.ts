import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import JSZip from "jszip";
import { buildPrintHtml } from "./printWindow";
import type { PrintPrefs } from "./printPrefs";
import { DEFAULT_MARGINS, getPaperSizeMm } from "./printPrefs";

export type PaperKind = "A4" | "A5" | "Letter" | "Legal" | "80mm" | "custom";
export type Orient = "portrait" | "landscape";

/**
 * Wait for every <img> under `root` to finish loading (success OR error)
 * before we hand the element to html2canvas. Without this, remote logos
 * (Supabase Storage, CDN) can still be pending when rasterization starts,
 * so they render as blank in the exported PDF.
 */
async function waitForImages(root: HTMLElement, timeoutMs = 8000): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
        // Safety: don't hang the whole export on one broken image.
        window.setTimeout(done, timeoutMs);
      });
    }),
  );
}

export async function elementToPdfBlob(
  el: HTMLElement,
  paperSize: string,
  orientation: Orient = "portrait",
  fitSingle: boolean = true,
  customPaper?: { widthMm?: number; heightMm?: number } | null,
  renderOptions: { scale?: number; imageTimeoutMs?: number } = {},
): Promise<Blob> {
  let format: any;
  if (paperSize === "A5") format = "a5";
  else if (paperSize === "Letter") format = "letter";
  else if (paperSize === "Legal") format = "legal";
  else if (paperSize === "80mm") format = orientation === "landscape" ? [200, 80] : [80, 200];
  else if (paperSize === "custom") {
    const d = getPaperSizeMm("custom", orientation, customPaper);
    format = [d.w, d.h];
  } else format = "a4";

  const pdf = new jsPDF({ orientation, unit: "mm", format });

  const scale = renderOptions.scale ?? 2;
  const imageTimeoutMs = renderOptions.imageTimeoutMs ?? 15000;

  // Ensure remote logos/images finish loading before rasterization.
  await waitForImages(el, Math.min(imageTimeoutMs, 8000));

  // Fit-to-single-page mode: render the entire element as ONE page, scaled
  // down so everything fits inside A4/A5 (default for A4 / A5).
  if (fitSingle && paperSize !== "80mm") {
    const canvas = await html2canvas(el, {
      scale,
      backgroundColor: "#ffffff",
      logging: false,
      useCORS: true,
      allowTaint: false,
      imageTimeout: imageTimeoutMs,
      ignoreElements: (node) => node instanceof HTMLElement && (node.classList.contains("no-print") || node.hasAttribute("data-no-print")),
    });
    const imgData = canvas.toDataURL("image/png");
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ratio = canvas.width / canvas.height;
    // Try to fit by width first, then shrink by height if still too tall.
    let w = pageW;
    let h = w / ratio;
    if (h > pageH) { h = pageH; w = h * ratio; }
    // If shrinking would make the document smaller than 55% of A4 width
    // (i.e. text becomes unreadable), fall back to multi-page mode where
    // each `.doc-page` becomes its own PDF page.
    const widthRatio = w / pageW;
    if (widthRatio < 0.55) {
      // fall through to multi-page branch below
    } else {
      pdf.deletePage(1);
      pdf.addPage(format, orientation);
      pdf.addImage(imgData, "PNG", (pageW - w) / 2, 0, w, h);
      return pdf.output("blob");
    }
  }

  // Each `.doc-page` becomes a separate PDF page (legacy / 80mm flow).
  const pageEls = Array.from(el.querySelectorAll<HTMLElement>(".doc-page"));
  const targets = pageEls.length > 0 ? pageEls : [el];

  for (let i = 0; i < targets.length; i++) {
    const node = targets[i];
    const canvas = await html2canvas(node, {
      scale,
      backgroundColor: "#ffffff",
      logging: false,
      useCORS: true,
      allowTaint: false,
      imageTimeout: imageTimeoutMs,
      ignoreElements: (node) => node instanceof HTMLElement && (node.classList.contains("no-print") || node.hasAttribute("data-no-print")),
    });
    const imgData = canvas.toDataURL("image/png");
    if (i > 0) {
      if (paperSize === "80mm") {
        const ratio = canvas.width / canvas.height;
        const heightMm = Math.max(120, 80 / ratio);
        pdf.addPage([80, heightMm], orientation);
      } else {
        pdf.addPage(format, orientation);
      }
    } else if (paperSize === "80mm") {
      // first page: resize to fit content
      const ratio = canvas.width / canvas.height;
      const heightMm = Math.max(120, 80 / ratio);
      pdf.deletePage(1);
      pdf.addPage([80, heightMm], orientation);
    }
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ratio = canvas.width / canvas.height;
    let w = pageW;
    let h = w / ratio;
    if (h > pageH) { h = pageH; w = h * ratio; }
    pdf.addImage(imgData, "PNG", (pageW - w) / 2, 0, w, h);
  }
  return pdf.output("blob");
}

/** True when we're inside a frame whose top document we cannot touch
 *  (Lovable preview, LINE in-app webview, any sandboxed embed). In that
 *  case an `<a download>` click is frequently swallowed by the browser. */
function inCrossOriginFrame(): boolean {
  try {
    if (window.top === window.self) return false;
    // Throws when the top document is cross-origin / sandboxed.
    void window.top!.document;
    return false;
  } catch {
    return true;
  }
}

function pickAnchorDocument(): Document {
  try {
    if (window.top && window.top !== window.self && window.top.document) {
      return window.top.document;
    }
  } catch {
    /* cross-origin top — stay local */
  }
  return document;
}

export type SaveFileResult = "picker" | "anchor" | "tab" | "aborted" | "failed";

/**
 * Save a blob as a real file, as reliably as the browser allows.
 *
 * The Receipt & Delivery workspace renders each shop inside an iframe, and the
 * whole app may itself be embedded (preview / in-app browsers), where a plain
 * `<a download>` click is silently ignored. Strategy, in order:
 *  1. File System Access API (`showSaveFilePicker`) → real "Save as" dialog.
 *  2. `<a download>` attached to the top-most reachable document.
 *  3. Open the blob in a new tab (iOS Safari / sandboxed frames) so the user
 *     can use Share → Save to Files.
 */
export async function saveBlobAsFile(blob: Blob, filename: string): Promise<SaveFileResult> {
  const w = window as unknown as {
    showSaveFilePicker?: (opts: unknown) => Promise<{
      createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }>;
    }>;
  };

  // 1. Native save dialog (Chrome/Edge desktop, top-level or allowed frames).
  if (typeof w.showSaveFilePicker === "function") {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: filename,
        types: [
          filename.toLowerCase().endsWith(".zip")
            ? { description: "ZIP archive", accept: { "application/zip": [".zip"] } }
            : { description: "PDF document", accept: { "application/pdf": [".pdf"] } },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "picker";
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      if (name === "AbortError") return "aborted"; // user cancelled — do nothing else
      // SecurityError / NotAllowedError inside a frame → fall through.
    }
  }

  const url = URL.createObjectURL(blob);
  const cleanup = (node?: HTMLAnchorElement) => {
    setTimeout(() => {
      node?.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  };

  // 2. Anchor download (desktop/Android browsers, same-origin embedding).
  const doc = pickAnchorDocument();
  const a = doc.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.target = "_blank";
  a.style.display = "none";
  doc.body.appendChild(a);

  const supportsDownload = "download" in a && !inCrossOriginFrame();
  if (supportsDownload) {
    a.click();
    cleanup(a);
    return "anchor";
  }

  // 3. Sandboxed frame / iOS Safari: open the file so it can be saved manually.
  a.remove();
  const opened = window.open(url, "_blank");
  if (!opened) {
    // Popup blocked — do NOT navigate the app away to a raw blob URL.
    URL.revokeObjectURL(url);
    return "failed";
  }
  cleanup();
  return "tab";
}

/** Fire-and-forget wrapper kept for existing call sites. */
export function downloadBlob(blob: Blob, filename: string) {
  void saveBlobAsFile(blob, filename);
}

export async function zipAndDownload(files: { name: string; blob: Blob }[], zipName: string): Promise<SaveFileResult> {
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.blob);
  const blob = await zip.generateAsync({ type: "blob" });
  return await saveBlobAsFile(blob, zipName);
}

/**
 * Merge several PDF blobs into one file, preserving page order.
 * Used by the bulk "รวมเป็นไฟล์เดียว" export in the documents list.
 */
export async function mergePdfBlobs(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 1) return blobs[0];
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();
  for (const b of blobs) {
    const src = await PDFDocument.load(await b.arrayBuffer());
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
  }
  const bytes = await out.save();
  return new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
}

export async function mergeAndDownload(files: { name: string; blob: Blob }[], pdfName: string): Promise<SaveFileResult> {
  const merged = await mergePdfBlobs(files.map((f) => f.blob));
  return await saveBlobAsFile(merged, pdfName);
}

/**
 * Force every `.doc-page` inside `rootEl` to fit on a single A4 sheet by
 * applying a CSS transform scale when its rendered height exceeds the target.
 * Used right before window.print() to guarantee 1 doc = 1 A4 page.
 */
export function fitDocPrintToSinglePage(
  rootEl: HTMLElement,
  paper: string = "A4",
  mode: string = "fit_a4",
  manualScale?: number | null,
): { appliedScale: number; pages: number } {
  const pages = Array.from(rootEl.querySelectorAll<HTMLElement>(".doc-page"));
  // Always clear stale fit styles from previous prints
  for (const p of pages) {
    p.style.transform = "";
    p.style.transformOrigin = "";
    if (p.dataset.printFitWidth) { p.style.width = p.dataset.printFitWidth; delete p.dataset.printFitWidth; }
    if (p.dataset.printFitMinHeight) { p.style.minHeight = p.dataset.printFitMinHeight; delete p.dataset.printFitMinHeight; }
    if (p.dataset.printFitBreak) {
      p.style.pageBreakAfter = "";
      p.style.breakAfter = "";
      delete p.dataset.printFitBreak;
    }
    delete p.dataset.printFitApplied;
  }
  if (mode === "actual") return { appliedScale: 1, pages: pages.length };
  if (paper !== "A4" && paper !== "A5") return { appliedScale: 1, pages: pages.length };
  const heightMm = paper === "A4" ? 297 : 210;
  const widthMm = paper === "A4" ? 210 : 148;
  const pxPerMm = 96 / 25.4;
  const targetH = heightMm * pxPerMm;
  const targetW = widthMm * pxPerMm;
  const manual = (typeof manualScale === "number" && manualScale > 0.3 && manualScale < 3) ? manualScale : null;
  let minApplied = 1;
  for (const p of pages) {
    if (mode === "fit_a4") {
      // collapse all pages into a single sheet
      p.dataset.printFitBreak = "1";
      p.style.pageBreakAfter = "auto";
      p.style.breakAfter = "auto";
      p.dataset.printFitMinHeight = p.style.minHeight ?? "";
      p.style.minHeight = "auto";
    }
    const h = p.scrollHeight;
    const w = p.scrollWidth;
    if (h <= 0 || w <= 0) continue;
    let scale: number;
    if (manual !== null) {
      scale = manual;
    } else {
      const scaleH = h > targetH ? targetH / h : 1;
      const scaleW = w > targetW ? targetW / w : 1;
      scale = Math.min(scaleH, scaleW);
    }
    if (scale !== 1) {
      p.style.transformOrigin = "top left";
      p.style.transform = `scale(${scale})`;
      if (mode === "fit_a4") {
        p.dataset.printFitWidth = p.style.width ?? "";
        p.style.width = `${(widthMm / scale).toFixed(2)}mm`;
      }
      p.dataset.printFitApplied = "1";
    }
    if (scale < minApplied) minApplied = scale;
  }
  return { appliedScale: minApplied, pages: pages.length };
}

/** Remove all inline styles applied by fitDocPrintToSinglePage. */
export function resetDocPrintFit(rootEl: HTMLElement) {
  const pages = Array.from(rootEl.querySelectorAll<HTMLElement>(".doc-page"));
  for (const p of pages) {
    if (!p.dataset.printFitApplied && !p.dataset.printFitBreak) continue;
    p.style.transform = "";
    p.style.transformOrigin = "";
    if (p.dataset.printFitWidth !== undefined) { p.style.width = p.dataset.printFitWidth; delete p.dataset.printFitWidth; }
    if (p.dataset.printFitMinHeight !== undefined) { p.style.minHeight = p.dataset.printFitMinHeight; delete p.dataset.printFitMinHeight; }
    p.style.pageBreakAfter = "";
    p.style.breakAfter = "";
    delete p.dataset.printFitBreak;
    delete p.dataset.printFitApplied;
  }
}

/**
 * Measure whether the rendered document overflows the target paper height.
 * Used to warn the user before printing.
 */
export function measureDocOverflow(
  rootEl: HTMLElement,
  paper: string = "A4",
): { contentMm: number; pageMm: number; overflow: boolean; scaleNeeded: number } {
  const pages = Array.from(rootEl.querySelectorAll<HTMLElement>(".doc-page"));
  const pxPerMm = 96 / 25.4;
  const pageMm = paper === "A5" ? 210 : paper === "80mm" ? 0 : 297;
  let maxContentMm = 0;
  let scaleNeeded = 1;
  for (const p of pages) {
    const h = p.scrollHeight / pxPerMm;
    if (h > maxContentMm) maxContentMm = h;
    if (pageMm > 0 && h > pageMm) {
      const s = pageMm / h;
      if (s < scaleNeeded) scaleNeeded = s;
    }
  }
  return {
    contentMm: maxContentMm,
    pageMm,
    overflow: pageMm > 0 && maxContentMm > pageMm + 0.5,
    scaleNeeded,
  };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(bin);
}

/**
 * Render a printable element to PDF **using the exact same print-HTML pipeline
 * as the real print popup** (`buildPrintHtml`). This guarantees the exported
 * PDF matches paper print output 1:1 — same page CSS, same margins, same
 * font-scale + scope, same doc-print visibility overrides, same document
 * number / totals / signature block.
 *
 * Steps:
 *  1. Mount an offscreen iframe with `buildPrintHtml(sourceEl, cfg)`.
 *  2. Wait for stylesheets, fonts, and images to finish loading.
 *  3. Rasterize the iframe body per A4/A5 page using html2canvas.
 *  4. Emit a jsPDF blob with one canvas per PDF page.
 */
export async function renderPrintHtmlToPdfBlob(
  sourceEl: HTMLElement,
  cfg: Partial<PrintPrefs> & { paper?: PaperKind; orient?: Orient } = {},
): Promise<Blob> {
  const paper: PaperKind = (cfg.paper as PaperKind) ?? "A4";
  const orient: Orient = cfg.orient ?? "portrait";
  const margins = cfg.margins ?? { ...DEFAULT_MARGINS };
  const fontScale = typeof cfg.fontScale === "number" ? cfg.fontScale : 1;
  const fontScope = cfg.fontScope ?? "content";
  const headerOnce = cfg.headerOnce ?? true;

  const cssPaper = paper === "custom"
    ? `${getPaperSizeMm("custom", orient, cfg.customPaper).w}mm ${getPaperSizeMm("custom", orient, cfg.customPaper).h}mm`
    : paper === "80mm"
      ? (orient === "landscape" ? "200mm 80mm" : "80mm 200mm")
      : `${getPaperSizeMm(paper, orient).w}mm ${getPaperSizeMm(paper, orient).h}mm`;
  const html = buildPrintHtml({
    bodyHtml: "",
    sourceEl,
    paperSize: cssPaper,
    orient,
    bodyClass: `is-printing print-preview-surface scope-${fontScope}`,
    margins,
    headerOnce,
    fontScale,
    fontScope,
  });

  // Mount an offscreen iframe sized to the target paper (px).
  const pxPerMm = 96 / 25.4;
  const paperDims = getPaperSizeMm(paper, orient, cfg.customPaper);
  const dims = { wMm: paperDims.w, hMm: paperDims.h };
  const wPx = Math.round(dims.wMm * pxPerMm);
  const hPx = Math.round(dims.hMm * pxPerMm);
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-100000px";
  iframe.style.top = "0";
  iframe.style.width = `${wPx}px`;
  iframe.style.height = `${hPx}px`;
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  try {
    // Write the doc.
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();

    // Wait for stylesheets + fonts + images.
    await waitForIframeReady(iframe);

    // The body is the printable content; rasterize once and split into pages.
    const body = doc.body;
    if (!body) throw new Error("iframe body missing");
    // Ensure the iframe height matches full content so nothing is clipped.
    const contentH = Math.max(body.scrollHeight, doc.documentElement.scrollHeight);
    iframe.style.height = `${contentH}px`;

    const canvas = await html2canvas(body, {
      scale: 2,
      backgroundColor: "#ffffff",
      logging: false,
      useCORS: true,
      allowTaint: false,
      imageTimeout: 15000,
      width: wPx,
      height: contentH,
      windowWidth: wPx,
      windowHeight: contentH,
    });

    // Build the PDF with the same page format as print.
    let format: any;
    if (paper === "A5") format = "a5";
    else if (paper === "Letter") format = "letter";
    else if (paper === "Legal") format = "legal";
    else if (paper === "80mm") format = orient === "landscape" ? [200, 80] : [80, 200];
    else if (paper === "custom") format = [paperDims.w, paperDims.h];
    else format = "a4";
    const pdf = new jsPDF({ orientation: orient, unit: "mm", format });
    const pageWmm = pdf.internal.pageSize.getWidth();
    const pageHmm = pdf.internal.pageSize.getHeight();

    // Canvas is at scale=2; total content height in mm:
    const canvasPxPerMm = canvas.width / pageWmm;
    const totalHmm = canvas.height / canvasPxPerMm;
    const pageCount = Math.max(1, Math.ceil(totalHmm / pageHmm));

    for (let i = 0; i < pageCount; i++) {
      const sliceHpx = Math.min(canvas.height - i * pageHmm * canvasPxPerMm, pageHmm * canvasPxPerMm);
      if (sliceHpx <= 0) break;
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = Math.round(sliceHpx);
      const ctx = slice.getContext("2d");
      if (!ctx) break;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(
        canvas,
        0, Math.round(i * pageHmm * canvasPxPerMm),
        canvas.width, slice.height,
        0, 0,
        canvas.width, slice.height,
      );
      const imgData = slice.toDataURL("image/png");
      if (i > 0) pdf.addPage(format, orient);
      const sliceHmm = slice.height / canvasPxPerMm;
      pdf.addImage(imgData, "PNG", 0, 0, pageWmm, sliceHmm);
    }

    return pdf.output("blob");
  } finally {
    document.body.removeChild(iframe);
  }
}

async function waitForIframeReady(iframe: HTMLIFrameElement): Promise<void> {
  const doc = iframe.contentDocument;
  if (!doc) return;
  // Wait for document.readyState === complete.
  if (doc.readyState !== "complete") {
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      iframe.addEventListener("load", done, { once: true });
      setTimeout(done, 4000);
    });
  }
  // Fonts.
  const fontsReady = (doc as any).fonts?.ready;
  if (fontsReady?.then) {
    await Promise.race([
      fontsReady.then(() => undefined).catch(() => undefined),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  }
  // Images.
  const imgs = Array.from(doc.images ?? []);
  await Promise.all(
    imgs.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.addEventListener("load", () => resolve(), { once: true });
        img.addEventListener("error", () => resolve(), { once: true });
        setTimeout(resolve, 4000);
      });
    }),
  );
}

/**
 * Render a DocumentPreview off-screen and return a PDF base64 string.
 * Used for client-side auto-upload to Google Drive.
 */
export async function renderDocToPdfBase64(
  store: any,
  state: any,
  totals: any,
  docNo: string,
  paperSize: string,
  orientation: Orient = "portrait",
  fitSingle: boolean = true,
  templateConfig?: { header_text?: string; footer_text?: string } | null,
  renderOptions: { scale?: number; imageTimeoutMs?: number } = {},
): Promise<string | null> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const React = await import("react");
  const mod = await import("../documents/DocumentPreview");
  const DocumentPreview = mod.default;
  const html = renderToStaticMarkup(
    React.createElement(DocumentPreview, { store, state, totals, docNo, templateConfig }),
  );
  const div = document.createElement("div");
  div.style.position = "fixed";
  div.style.left = "-10000px";
  div.style.top = "0";
  div.innerHTML = html;
  document.body.appendChild(div);
  try {
    const el = div.querySelector("#doc-print") as HTMLElement | null;
    if (!el) return null;
    const blob = await elementToPdfBlob(el, paperSize, orientation, fitSingle, null, renderOptions);
    return await blobToBase64(blob);
  } finally {
    document.body.removeChild(div);
  }
}