/**
 * Helpers for triggering a real print dialog that uses the app's @media print
 * rules, even when the app is running inside an iframe (e.g. Lovable preview).
 *
 * Why: when window.print() is called from within an iframe, browsers usually
 * print the top-level (parent) document. That document does NOT contain the
 * #doc-print node and our @media print CSS, so the user sees blank pages.
 * The fix is to open a fresh top-level window populated with the printable
 * HTML + current stylesheets, then call print() in that window.
 */

import { isPrintDebugEnabled, logPrintStage, recordPrintDiagnostics, type PrintDiagnostics } from "./printDebug";
import type { PrintMargins } from "./printPrefs";
import { printQueue } from "./printQueue";
import { getLockedPageLayout } from "./paperConstants";
import { openPrintWindowOrSurface } from "@/lib/printSurface";
import { PAPER_SIZES } from "@/lib/printScale";

export function isInIframe(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

/**
 * Combine one or more printable blocks (each `<div id="doc-print">…</div>`)
 * into a single HTML string suitable for the print window. Multiple blocks
 * are separated by a forced page break so e.g. an invoice + companion
 * receipt print together as one job but start on fresh A4 pages.
 *
 * Extracted so the behaviour is unit-testable and so any caller producing a
 * multi-document print payload uses the same separator markup.
 */
export function combinePrintBlocks(blocks: HTMLElement[]): string {
  if (!blocks || blocks.length === 0) return "";
  try {
    logPrintStage("blocks-collected", {
      count: blocks.length,
      hasCompanion: blocks.length > 1,
      ids: blocks.map((b) => b.id),
      docNos: blocks.map((b) =>
        (b.querySelector(".docno")?.textContent ?? b.getAttribute("data-doc-no") ?? "").trim(),
      ),
    });
  } catch { /* noop */ }
  if (blocks.length === 1) return blocks[0].outerHTML;
  return blocks
    .map((el, i) =>
      i === 0
        ? el.outerHTML
        : `<div class="rds-print-break" style="break-before:page;page-break-before:always"></div>${el.outerHTML}`,
    )
    .join("");
}

export type OpenPrintWindowOpts = {
  bodyHtml: string;
  paperSize?: string; // "A4" | "A5" | "80mm 200mm"
  orient?: "portrait" | "landscape";
  onAfterPrint?: () => void;
  /** Add body class while printing — mirrors `body.is-printing` in the app. */
  bodyClass?: string;
  /**
   * Optional source element to snapshot. If provided, computed styles will be
   * inlined onto each descendant so the document remains legible even when
   * the copied stylesheets fail to load in the new window.
   */
  sourceEl?: HTMLElement | null;
  /** Number of times to call print() in the popup. Defaults to 1. */
  copies?: number;
  /** Page margins in mm. Defaults to 10mm each side. */
  margins?: PrintMargins;
  /** When true (default), suppress the bill header on pages 2+ */
  headerOnce?: boolean;
  /** Font scale 0.7–1.3 applied via --doc-font-scale. */
  fontScale?: number;
  /** Font scope: "content" | "all" — sets --doc-font-scope variable. */
  fontScope?: "content" | "all";
  /** Fired after the browser print API has actually been invoked. */
  onPrintDispatched?: (via: "popup" | "iframe" | "current") => void;
  /** Fired when the helper aborts before invoking print(). */
  onPrintFailed?: (reason: string) => void;
  /** Show a top-level manual print toolbar inside popup windows. */
  manualPrintToolbar?: boolean;
};

export type PrintPreflight = {
  hasText: boolean;
  hasContent: boolean;
  textLength: number;
  pageCount: number;
  hasDocPrint: boolean;
  visualCount?: number;
  childCount?: number;
  bounds?: { width: number; height: number };
};

// Whitelist of CSS properties that materially affect document layout/legibility.
// Snapshotting every computed property would bloat the HTML 20x; this subset
// is enough to keep a printable look without external CSS.
const SNAPSHOT_PROPS = [
  "font-family", "font-size", "font-weight", "font-style", "line-height",
  "color", "background-color", "text-align", "text-decoration",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "border-collapse", "border-spacing",
  "width", "min-width", "max-width", "height",
  "display", "table-layout", "vertical-align",
  "white-space", "word-break", "overflow-wrap",
  "page-break-before", "page-break-after", "page-break-inside", "break-inside",
];

function snapshotInlineStyles(src: HTMLElement): string {
  // Never mutate the live preview. Clone it to an off-screen but visible tree,
  // then read computed styles from that clone. This avoids the blank-print bug
  // where the source DOM was temporarily visibility:hidden/display:none while
  // another snapshot/export was reading it.
  let measuringClone: HTMLElement | null = null;
  try {
    measuringClone = src.cloneNode(true) as HTMLElement;
    const existingRootStyle = measuringClone.getAttribute("style") ?? "";
    measuringClone.setAttribute(
      "style",
      `${existingRootStyle}${existingRootStyle ? ";" : ""}` +
      "display:block !important;visibility:visible !important;position:fixed !important;" +
      "left:-100000px !important;top:0 !important;height:auto !important;" +
      "opacity:1 !important;pointer-events:none !important;overflow:visible !important;",
    );
    document.body.appendChild(measuringClone);
    void measuringClone.offsetHeight;
    const clone = measuringClone.cloneNode(true) as HTMLElement;
    const srcNodes: Element[] = [measuringClone, ...Array.from(measuringClone.querySelectorAll("*"))];
    const dstNodes: Element[] = [clone, ...Array.from(clone.querySelectorAll("*"))];
    const len = Math.min(srcNodes.length, dstNodes.length);
    for (let i = 0; i < len; i++) {
      const s = srcNodes[i] as HTMLElement;
      const d = dstNodes[i] as HTMLElement;
      if (!s || !d || !(s instanceof HTMLElement)) continue;
      // Skip script/style nodes entirely.
      const tag = s.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "LINK") continue;
      const cs = window.getComputedStyle(s);
      const existing = d.getAttribute("style") ?? "";
      const parts: string[] = existing ? [existing.replace(/;?\s*$/, "")] : [];
      for (const prop of SNAPSHOT_PROPS) {
        const val = cs.getPropertyValue(prop);
        // Never let a residual `display:none` from a hidden ancestor leak into
        // the print iframe — that's exactly what produced blank pages.
        if (prop === "display" && val === "none") continue;
        if (prop === "visibility" && val === "hidden") continue;
        if (prop === "opacity" && val === "0") continue;
        // Transparent text colours would make copied text invisible in the
        // print popup. Force a legible fallback instead of dropping the
        // whole style so descendants keep their layout.
        if (
          (prop === "color" || prop === "-webkit-text-fill-color") &&
          (val.trim().toLowerCase() === "transparent" ||
            val.replace(/\s+/g, "") === "rgba(0,0,0,0)")
        ) {
          parts.push(`${prop}:#111111`);
          continue;
        }
        if (val && val !== "auto" && val !== "normal" && val !== "0px" && val !== "rgba(0, 0, 0, 0)") {
          parts.push(`${prop}:${val}`);
        }
      }
      if (parts.length) d.setAttribute("style", parts.join(";"));
    }
    // Hard guarantee the root is visible in the print document.
    const rootStyle = (clone.getAttribute("style") ?? "")
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s && !/^(display|visibility|position|left|right|top|bottom|opacity|pointer-events|height)\s*:/i.test(s))
      .join(";");
    clone.setAttribute(
      "style",
      `${rootStyle}${rootStyle ? ";" : ""}display:block;visibility:visible;position:static;left:auto;right:auto;top:auto;bottom:auto;opacity:1;pointer-events:auto;height:auto`,
    );
    return clone.outerHTML;
  } catch {
    return src.outerHTML;
  } finally {
    try { measuringClone?.remove(); } catch { /* noop */ }
  }
}

const BASELINE_CSS = `
  /* Baseline fallback so the document is still legible if external CSS
     fails to load in the new print window. */
  html, body { margin: 0; padding: 0; background: #ffffff; color: #111;
    font-family: "Sarabun", "Noto Sans Thai", "Tahoma", system-ui, sans-serif;
    font-size: 14px; line-height: 1.45; }
  table { border-collapse: collapse; width: 100%; }
  table, th, td { border: 1px solid #333; }
  th, td { padding: 4px 6px; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 600; text-align: left; }
  h1, h2, h3, h4 { margin: 0 0 6px; font-weight: 700; }
  img { max-width: 100%; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr, td, th { page-break-inside: avoid; break-inside: avoid; }
`;

/** Collect stylesheet/style tags + decide which body HTML to use. */
function collectHead(opts: OpenPrintWindowOpts) {
  const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map((l) => l.outerHTML)
    .join("\n");
  const styles = Array.from(document.querySelectorAll("style"))
    .map((s) => s.outerHTML)
    .join("\n");
  const linkCount = links ? links.split("\n").filter(Boolean).length : 0;
  const styleCount = styles ? styles.split("\n").filter(Boolean).length : 0;
  const bodyHtml = opts.sourceEl ? snapshotInlineStyles(opts.sourceEl) : opts.bodyHtml;
  return { links, styles, bodyHtml, linkCount, styleCount };
}

function marginCss(m?: PrintMargins): string {
  const t = m?.top ?? 10, r = m?.right ?? 10, b = m?.bottom ?? 10, l = m?.left ?? 10;
  return `${t}mm ${r}mm ${b}mm ${l}mm`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function twoAnimationFrames(win: Window = window): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    try {
      win.requestAnimationFrame(() => win.requestAnimationFrame(finish));
    } catch { /* noop */ }
    setTimeout(finish, 120);
  });
}

function printableTextFrom(root: ParentNode | null): string {
  if (!root) return "";
  const printableRoot =
    root.querySelector?.("#doc-print") ??
    root.querySelector?.("[data-doc-print]") ??
    null;
  return ((printableRoot as HTMLElement | null)?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function printableRootFrom(root: ParentNode | null): HTMLElement | null {
  if (!root) return null;
  return (root.querySelector?.("#doc-print") ??
    root.querySelector?.("#doc-print-direct") ??
    root.querySelector?.("[data-doc-print]") ??
    null) as HTMLElement | null;
}

function printableContentStats(root: ParentNode | null) {
  const printableRoot = printableRootFrom(root);
  const text = ((printableRoot as HTMLElement | null)?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const pageCount = printableRoot?.querySelectorAll?.(".doc-page").length ?? 0;
  const visualCount = printableRoot?.querySelectorAll?.("img,svg,canvas").length ?? 0;
  const childCount = printableRoot?.querySelectorAll?.("*").length ?? 0;
  return {
    printableRoot,
    text,
    pageCount,
    visualCount,
    childCount,
    hasContent: !!printableRoot && (text.length >= 10 || pageCount > 0 || visualCount > 0 || childCount > 5),
  };
}

function htmlHasPrintableContent(html: string, minTextLength = 10): boolean {
  const host = document.createElement("div");
  host.innerHTML = html;
  const stats = printableContentStats(host);
  return stats.hasContent || printableTextFrom(host).length >= minTextLength;
}

async function waitForPrintableAssets(doc: Document, diag?: PrintDiagnostics): Promise<void> {
  await twoAnimationFrames(doc.defaultView ?? window);
  const fontsReady = (doc as any).fonts?.ready;
  if (fontsReady && typeof fontsReady.then === "function") {
    let timedOut = false;
    await Promise.race([
      fontsReady.then(() => undefined).catch(() => undefined),
      wait(1500).then(() => { timedOut = true; }),
    ]);
    if (timedOut) diag?.errors.push("fonts_ready_timeout_1500ms");
  }

  try {
    const imgs = Array.from(doc.images ?? []);
    await Promise.all(
      imgs.map(async (image) => {
        let timedOut = false;
        const loaded = (async () => {
          if (image.complete) {
            try { await (image as any).decode?.(); } catch { /* ignore decode failures */ }
            return;
          }
          await new Promise<void>((resolve) => {
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          });
        })();
        await Promise.race([
          loaded.catch(() => undefined),
          wait(1800).then(() => { timedOut = true; }),
        ]);
        if (timedOut) diag?.errors.push(`image_wait_timeout:${image.currentSrc || image.src || "inline"}`);
      }),
    );
  } catch (e: any) {
    diag?.errors.push(`image_wait_failed:${e?.message ?? e}`);
  }
  await twoAnimationFrames(doc.defaultView ?? window);
}

const PAGED_PRINT_CSS = `
  .doc-page { background: #ffffff !important; background-image: none !important;
    box-shadow: none !important; overflow: visible !important; }
  .doc-page + .doc-page { break-before: page !important; page-break-before: always !important; }
  #doc-print table, [data-doc-print] table { page-break-inside: auto; }
  #doc-print thead, [data-doc-print] thead { display: table-header-group; }
  #doc-print tr, #doc-print .avoid-break,
  #doc-print .doc-totals, #doc-print .doc-signature, #doc-print .doc-notes,
  [data-doc-print] tr, [data-doc-print] .avoid-break,
  [data-doc-print] .doc-totals, [data-doc-print] .doc-signature, [data-doc-print] .doc-notes {
    break-inside: avoid !important; page-break-inside: avoid !important;
  }
  .doc-print-document + .doc-print-document,
  [data-doc-print] + [data-doc-print] {
    break-before: page !important; page-break-before: always !important;
  }
`;

function pageSizeCss(paper: string, orient: "portrait" | "landscape"): string {
  const value = (paper || "A4").trim();
  if (/^\d+(?:\.\d+)?mm\s+\d+(?:\.\d+)?mm$/i.test(value)) return value;
  if (/^(a4|a5|letter|legal)$/i.test(value)) return `${value} ${orient}`;
  if (/^80mm\s+200mm$/i.test(value)) return orient === "landscape" ? "200mm 80mm" : "80mm 200mm";
  // 80mm receipt roll: reuse the shared PAPER_SIZES height so this stays in
  // sync with the on-screen PaperViewport/usePaperScale math elsewhere.
  if (/^80mm$/i.test(value)) {
    const { widthMm, heightMm } = PAPER_SIZES["80mm"];
    return orient === "landscape" ? `${heightMm}mm ${widthMm}mm` : `${widthMm}mm ${heightMm}mm`;
  }
  // Label presets (100x70 / 100x75 …): resolve straight from the shared
  // PAPER_SIZES table so @page geometry matches the on-screen PaperViewport
  // instead of silently falling back to A4.
  const preset = (PAPER_SIZES as Record<string, { widthMm: number; heightMm: number } | undefined>)[value];
  if (preset) {
    return orient === "landscape"
      ? `${preset.heightMm}mm ${preset.widthMm}mm`
      : `${preset.widthMm}mm ${preset.heightMm}mm`;
  }
  return `A4 ${orient}`;
}

export function diagnosePrintHtml(html: string): PrintPreflight {
  const host = document.createElement("div");
  host.innerHTML = html;
  const stats = printableContentStats(host);
  return {
    hasText: stats.text.length >= 10,
    hasContent: stats.hasContent,
    textLength: stats.text.length,
    pageCount: stats.pageCount,
    hasDocPrint: !!stats.printableRoot,
    visualCount: stats.visualCount,
    childCount: stats.childCount,
  };
}

/** Builds the full HTML document used for the print popup or preview iframe. */
export function buildPrintHtml(opts: OpenPrintWindowOpts): string {
  const { links, styles, bodyHtml } = collectHead(opts);
  const paper = opts.paperSize ?? "A4";
  const orient = opts.orient ?? "portrait";
  const baseBodyClass = opts.bodyClass ?? "is-printing";
  const bodyClass = baseBodyClass;
  const fontScale = typeof opts.fontScale === "number" ? opts.fontScale : 1;
  const fontScope = opts.fontScope ?? "content";
  const margin = marginCss(opts.margins);
  const toolbar = opts.manualPrintToolbar
    ? `<div id="lovable-print-toolbar" data-no-print="true">
        <button type="button" onclick="window.focus();window.print();">พิมพ์เอกสาร</button>
        <button type="button" onclick="window.close();">ปิด</button>
      </div>`
    : "";
  return `<!doctype html><html lang="th"><head><meta charset="utf-8">
<title>พิมพ์เอกสาร</title>
${links}
${styles}
<style>
  ${BASELINE_CSS}
  @page { size: ${pageSizeCss(paper, orient)}; margin: ${margin}; }
  @media print { .no-print, [data-no-print] { display: none !important; } }
  #lovable-print-toolbar {
    position: sticky; top: 0; z-index: 99999; display: flex; gap: 8px;
    align-items: center; justify-content: center; padding: 10px;
    background: #111827; color: #ffffff; border-bottom: 1px solid #374151;
    font: 14px/1.4 system-ui, sans-serif;
  }
  #lovable-print-toolbar button {
    border: 0; border-radius: 6px; padding: 8px 14px; cursor: pointer;
    background: #ffffff; color: #111827; font: inherit; font-weight: 600;
  }
  body, body * { visibility: visible !important; }
  /* Hard-guarantee the printable subtree is visible even if the source */
  /* tree carried display:none, visibility:hidden or opacity:0 from the */
  /* app @media print CSS. */
  html, body { background:#ffffff !important; color:#111111; }
  #doc-print, #doc-print *,
  [data-doc-print], [data-doc-print] * {
    visibility: visible !important;
    opacity: 1 !important;
  }
  #doc-print, [data-doc-print] {
    display: block !important;
    position: static !important;
    inset: auto !important;
    height: auto !important;
    overflow: visible !important;
  }
  ${PAGED_PRINT_CSS}
  :root { --doc-font-scale: ${fontScale}; --doc-font-scope: ${fontScope}; }
  #doc-print, .doc-print-document { --doc-font-scale: ${fontScale}; --doc-font-scope: ${fontScope}; }
  #lovable-print-debug-banner { position: fixed; top: 0; left: 0; right: 0;
    background: #fef3c7; color: #92400e; font: 12px/1.5 ui-monospace, monospace;
    padding: 6px 10px; border-bottom: 1px solid #f59e0b; z-index: 99999; }
</style>
</head><body class="${bodyClass}">${toolbar}${bodyHtml}</body></html>`;
}

function removeExistingDirectPrintNodes() {
  try { document.getElementById("rds-direct-print-host")?.remove(); } catch { /* noop */ }
  try { document.getElementById("rds-direct-print-style")?.remove(); } catch { /* noop */ }
}

function marginPaddingCss(m?: PrintMargins): string {
  const locked = getLockedPageLayout().paddingMm;
  const t = m?.top ?? locked.top, r = m?.right ?? locked.right, b = m?.bottom ?? locked.bottom, l = m?.left ?? locked.left;
  return `${t}mm ${r}mm ${b}mm ${l}mm`;
}

function physicalPageCss(paper: string, orient: "portrait" | "landscape"): { page: string; width: string; height: string } {
  const value = pageSizeCss(paper, orient);
  const mm = value.match(/^(\d+(?:\.\d+)?)mm\s+(\d+(?:\.\d+)?)mm$/i);
  if (mm) return { page: `${mm[1]}mm ${mm[2]}mm`, width: `${mm[1]}mm`, height: `${mm[2]}mm` };
  const lower = value.toLowerCase();
  const landscape = lower.includes("landscape");
  // A4/A5 physical dimensions come from the same PAPER_SIZES table used by
  // PaperViewport/usePaperScale so print @page geometry and the on-screen
  // preview never drift apart. Letter/Legal aren't in PAPER_SIZES (they're
  // not part of the receipt paper presets), so those stay hard-coded here.
  if (lower.startsWith("a5")) {
    const { widthMm, heightMm } = PAPER_SIZES.A5;
    return landscape
      ? { page: "A5 landscape", width: `${heightMm}mm`, height: `${widthMm}mm` }
      : { page: "A5 portrait", width: `${widthMm}mm`, height: `${heightMm}mm` };
  }
  if (lower.startsWith("letter")) return landscape
    ? { page: "Letter landscape", width: "279mm", height: "216mm" }
    : { page: "Letter portrait", width: "216mm", height: "279mm" };
  if (lower.startsWith("legal")) return landscape
    ? { page: "Legal landscape", width: "356mm", height: "216mm" }
    : { page: "Legal portrait", width: "216mm", height: "356mm" };
  // A4 stays locked to the paperConstants.ts geometry (via PAPER_SIZES.A4).
  const { widthMm, heightMm } = PAPER_SIZES.A4;
  return landscape
    ? { page: "A4 landscape", width: `${heightMm}mm`, height: `${widthMm}mm` }
    : { page: "A4 portrait", width: `${widthMm}mm`, height: `${heightMm}mm` };
}

function setImportant(el: HTMLElement, prop: string, value: string) {
  try { el.style.setProperty(prop, value, "important"); } catch { /* noop */ }
}

function lockDirectPrintPages(host: HTMLElement, opts: OpenPrintWindowOpts): number {
  const orient = opts.orient ?? "portrait";
  const page = physicalPageCss(opts.paperSize ?? "A4", orient);
  const padding = marginPaddingCss(opts.margins);
  const directRoot = host.querySelector<HTMLElement>("#doc-print-direct");
  const root = directRoot ?? printableRootFrom(host) ?? host;

  try {
    root.setAttribute("data-print-page-lock", "true");
    root.setAttribute("data-print-page-width", page.width);
    root.setAttribute("data-print-page-height", page.height);
    root.setAttribute("data-print-page-padding", padding);
  } catch { /* noop */ }

  const screenOnlyNodes = Array.from(host.querySelectorAll<HTMLElement>(
    ".doc-page-divider,.no-print,[data-no-print]",
  ));
  screenOnlyNodes.forEach((el) => {
    setImportant(el, "display", "none");
    setImportant(el, "height", "0");
    setImportant(el, "margin", "0");
    setImportant(el, "padding", "0");
  });

  // Scan wrappers + pages from the host root so multi-copy prints (which
  // clone the entire printable root N times) can be locked in a single
  // pass, not only inside the first `#doc-print-direct` copy.
  const wrappers = Array.from(host.querySelectorAll<HTMLElement>(".doc-print-document"));
  wrappers.forEach((el) => {
    setImportant(el, "display", "block");
    setImportant(el, "position", "static");
    setImportant(el, "width", page.width);
    setImportant(el, "height", "auto");
    setImportant(el, "min-height", "0");
    setImportant(el, "margin", "0");
    setImportant(el, "padding", "0");
    setImportant(el, "transform", "none");
    setImportant(el, "zoom", "1");
    setImportant(el, "break-before", "auto");
    setImportant(el, "page-break-before", "auto");
    setImportant(el, "break-after", "auto");
    setImportant(el, "page-break-after", "auto");
  });

  const pages = Array.from(host.querySelectorAll<HTMLElement>(".doc-page"));
  pages.forEach((el, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === pages.length - 1;
    el.setAttribute("data-print-page-lock", "true");
    el.setAttribute("data-print-page-idx", String(idx + 1));
    el.setAttribute("data-print-page-total", String(pages.length));
    setImportant(el, "display", "block");
    setImportant(el, "position", "relative");
    setImportant(el, "box-sizing", "border-box");
    setImportant(el, "width", page.width);
    setImportant(el, "min-width", page.width);
    setImportant(el, "max-width", page.width);
    setImportant(el, "height", page.height);
    setImportant(el, "min-height", page.height);
    setImportant(el, "max-height", page.height);
    setImportant(el, "padding", padding);
    setImportant(el, "margin-top", "0mm");
    setImportant(el, "margin-bottom", "0mm");
    setImportant(el, "margin-left", "auto");
    setImportant(el, "margin-right", "auto");
    setImportant(el, "overflow", "hidden");
    setImportant(el, "transform", "none");
    setImportant(el, "transform-origin", "top left");
    setImportant(el, "zoom", "1");
    setImportant(el, "break-before", isFirst ? "auto" : "page");
    setImportant(el, "page-break-before", isFirst ? "auto" : "always");
    setImportant(el, "break-after", isLast ? "auto" : "page");
    setImportant(el, "page-break-after", isLast ? "auto" : "always");
    setImportant(el, "break-inside", "avoid");
    setImportant(el, "page-break-inside", "avoid");
  });
  return pages.length;
}

function buildDirectPrintCss(opts: OpenPrintWindowOpts): string {
  const orient = opts.orient ?? "portrait";
  const page = physicalPageCss(opts.paperSize ?? "A4", orient);
  const fontScale = typeof opts.fontScale === "number" ? opts.fontScale : 1;
  const fontScope = opts.fontScope ?? "content";
  return `
    #rds-direct-print-host {
      position: fixed !important;
      left: -100000px !important;
      top: 0 !important;
      width: ${page.width} !important;
      min-height: ${page.height} !important;
      height: auto !important;
      overflow: visible !important;
      visibility: hidden !important;
      opacity: 1 !important;
      pointer-events: none !important;
      background: #ffffff !important;
      transform: none !important;
      zoom: 1 !important;
      --doc-font-scale: ${fontScale};
      --doc-font-scope: ${fontScope};
    }
    #rds-direct-print-host #doc-print-direct,
    #rds-direct-print-host [data-doc-print] {
      display: block !important;
      width: auto !important;
      min-width: 0 !important;
      height: auto !important;
      min-height: 0 !important;
      overflow: visible !important;
      transform: none !important;
      zoom: 1 !important;
      position: static !important;
      inset: auto !important;
      /* Intentionally no on-screen visibility rule for the clone: the
       * host is off-screen so the clone is not visible anyway, and any
       * same-specificity rule here would defeat the @media print visible
       * rule below (Chrome blank-page regression). */
      opacity: 1 !important;
      --doc-font-scale: ${fontScale};
      --doc-font-scope: ${fontScope};
    }
    @page { size: ${page.page}; margin: 0; }
    @media print {
      body > *:not(#rds-direct-print-host) { display: none !important; }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: auto !important;
        min-width: 0 !important;
        height: auto !important;
        overflow: visible !important;
        background: #ffffff !important;
      }
      /* Beat POS thermal print CSS: body > *:not(#print-root) has an ID
         inside :not(), so a plain #rds-direct-print-host display rule loses
         and Chrome prints a blank page. Double the host id specificity. */
      body > #rds-direct-print-host#rds-direct-print-host,
      #rds-direct-print-host#rds-direct-print-host {
        display: block !important;
      }
      #rds-direct-print-host {
        display: block !important;
        position: static !important;
        visibility: visible !important;
        opacity: 1 !important;
        width: auto !important;
        min-width: 0 !important;
        height: auto !important;
        min-height: 0 !important;
        overflow: visible !important;
        transform: none !important;
        zoom: 1 !important;
        pointer-events: auto !important;
        background: #ffffff !important;
      }
      #rds-direct-print-host,
      #rds-direct-print-host * {
        visibility: visible !important;
        opacity: 1 !important;
        color: initial;
      }
      #rds-direct-print-host #doc-print-direct,
      #rds-direct-print-host [data-doc-print] {
        display: block !important;
        position: static !important;
        inset: auto !important;
        width: auto !important;
        height: auto !important;
        overflow: visible !important;
        transform: none !important;
        zoom: 1 !important;
        visibility: visible !important;
        opacity: 1 !important;
      }
      #rds-direct-print-host #doc-print-direct *,
      #rds-direct-print-host [data-doc-print] * {
        visibility: visible !important;
        opacity: 1 !important;
      }
      #rds-direct-print-host .doc-print-document {
        display: block !important;
        position: static !important;
        transform: none !important;
        zoom: 1 !important;
        overflow: visible !important;
      }
      #rds-direct-print-host .doc-print-document + .doc-print-document {
        break-before: page !important;
        page-break-before: always !important;
      }
      #rds-direct-print-host .doc-page {
        display: block !important;
        position: relative !important;
        width: ${page.width} !important;
        width: var(--doc-page-width, ${page.width}) !important;
        min-width: var(--doc-page-width, ${page.width}) !important;
        max-width: var(--doc-page-width, ${page.width}) !important;
        height: ${page.height} !important;
        height: var(--doc-page-height, ${page.height}) !important;
        min-height: ${page.height} !important;
        min-height: var(--doc-page-height, ${page.height}) !important;
        max-height: var(--doc-page-height, ${page.height}) !important;
        box-sizing: border-box !important;
        margin-top: 0 !important;
        margin-bottom: 0 !important;
        margin-left: auto !important;
        margin-right: auto !important;
        padding: var(--doc-page-padding, ${marginPaddingCss(opts.margins)}) !important;
        background: #ffffff !important;
        box-shadow: none !important;
        overflow: hidden !important;
        transform: none !important;
        transform-origin: top left !important;
        zoom: 1 !important;
        break-after: page !important;
        page-break-after: always !important;
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }
      #rds-direct-print-host .doc-page:last-child {
        break-after: auto !important;
        page-break-after: auto !important;
      }
      #rds-direct-print-host .doc-page-divider,
      #rds-direct-print-host .no-print,
      #rds-direct-print-host [data-no-print] {
        display: none !important;
        height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      #rds-direct-print-host table { page-break-inside: auto !important; }
      #rds-direct-print-host thead { display: table-header-group !important; }
      #rds-direct-print-host tr,
      #rds-direct-print-host .avoid-break,
      #rds-direct-print-host .doc-totals,
      #rds-direct-print-host .doc-signature,
      #rds-direct-print-host .doc-notes {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }
      .no-print, [data-no-print] { display: none !important; }
    }
  `;
}

export async function printViaCurrentDocument(opts: OpenPrintWindowOpts): Promise<boolean> {
  const source = (opts.sourceEl ?? document.getElementById("doc-print")) as HTMLElement | null;
  if (!source) {
    try { opts.onPrintFailed?.("current_source_missing"); } catch { /* noop */ }
    return false;
  }
  if (document.getElementById("rds-direct-print-host")) {
    try { opts.onPrintFailed?.("current_print_busy"); } catch { /* noop */ }
    return false;
  }

  let host: HTMLDivElement | null = null;
  let style: HTMLStyleElement | null = null;
  let cleanupTimer = 0;
  let cleaned = false;
  let dispatched = false;
  let printAttempts = 0;
  let afterPrintHandler: (() => void) | null = null;
  let copyAdvanceTimer = 0;
  let runReleased = false;
  const copies = Math.min(10, Math.max(1, Math.round(opts.copies ?? 1)));

  const releaseRun = () => {
    if (runReleased) return;
    runReleased = true;
    try { printQueue.endExternalRun(); } catch { /* noop */ }
  };

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try { if (afterPrintHandler) window.removeEventListener("afterprint", afterPrintHandler); } catch { /* noop */ }
    try { window.removeEventListener("afterprint", cleanup); } catch { /* legacy noop */ }
    try { window.clearTimeout(cleanupTimer); } catch { /* noop */ }
    try { window.clearTimeout(copyAdvanceTimer); } catch { /* noop */ }
    try { host?.remove(); } catch { /* noop */ }
    try { style?.remove(); } catch { /* noop */ }
    releaseRun();
    if (dispatched) {
      try { opts.onAfterPrint?.(); } catch { /* noop */ }
    }
  };

  try {
    removeExistingDirectPrintNodes();
    host = document.createElement("div");
    host.id = "rds-direct-print-host";
    host.setAttribute("aria-hidden", "true");
    host.setAttribute("data-direct-print-host", "true");
    host.style.cssText =
      "position:fixed;left:-100000px;top:0;width:794px;min-height:1123px;height:auto;" +
      "overflow:visible;visibility:hidden;opacity:1;pointer-events:none;background:#fff;transform:none;";

    const wrapper = document.createElement("div");
    wrapper.innerHTML = snapshotInlineStyles(source);
    // Preserve the exact source root when a caller passes a container such as
    // #documents-print-area. Falling back to the first nested #doc-print here
    // drops every selected document after the first one, which breaks bulk
    // multi-file printing. The cloned source root is promoted to the direct
    // print root below and may contain one or many #doc-print descendants.
    const clonedRoot = (wrapper.firstElementChild as HTMLElement | null) ?? printableRootFrom(wrapper);
    if (!clonedRoot) {
      try { opts.onPrintFailed?.("current_clone_empty"); } catch { /* noop */ }
      return false;
    }
    clonedRoot.id = "doc-print-direct";
    clonedRoot.setAttribute("data-doc-print", "true");
    clonedRoot.setAttribute("data-direct-print-root", "true");
    clonedRoot.removeAttribute("aria-hidden");
    host.appendChild(clonedRoot);
    // Multi-copy: duplicate the printable root (N-1) more times inside the
    // same print host so a SINGLE window.print() dispatches every copy in
    // one OS dialog. The previous implementation looped window.print() per
    // copy which forced the user to click Print N times (and cancelling
    // copy 1 still triggered copy 2). Each clone gets stripped of the
    // duplicate id and a stable data-copy attribute so lockDirectPrintPages
    // sees all .doc-page elements and enforces page breaks between them
    // (`break-before: page` on every non-first `.doc-page`).
    clonedRoot.setAttribute("data-copy-index", "1");
    for (let ci = 2; ci <= copies; ci++) {
      const dup = clonedRoot.cloneNode(true) as HTMLElement;
      dup.removeAttribute("id");
      dup.setAttribute("data-doc-print", "true");
      dup.setAttribute("data-direct-print-copy", String(ci));
      dup.setAttribute("data-copy-index", String(ci));
      // Ensure the FIRST .doc-page of every additional copy starts on a
      // new physical page even if the previous copy's last page fits on
      // a partial sheet. `lockDirectPrintPages` sets break-before:page on
      // any non-first `.doc-page`, so that already covers this.
      host.appendChild(dup);
    }
    lockDirectPrintPages(host, opts);

    style = document.createElement("style");
    style.id = "rds-direct-print-style";
    style.textContent = buildDirectPrintCss(opts);
    (document.head || document.documentElement).appendChild(style);
    document.body.appendChild(host);

    const stats = printableContentStats(host);
    if (!stats.hasContent) {
      try { opts.onPrintFailed?.("current_printable_empty"); } catch { /* noop */ }
      removeExistingDirectPrintNodes();
      return false;
    }

    logPrintStage("current-print-host-ready", {
      textLen: stats.text.length,
      pageCount: stats.pageCount,
      visualCount: stats.visualCount,
      childCount: stats.childCount,
      paperSize: opts.paperSize ?? "A4",
      orient: opts.orient ?? "portrait",
    } as any);
    // Do NOT await fonts/images here. `window.print()` must stay in the same
    // user-activation task that started from the button click; Chrome/Safari can
    // silently ignore print() after awaited work, which looks like “พิมพ์ไม่ได้”.
    // The preview DOM is already rendered on screen, so we append the direct
    // host/style synchronously, force a layout flush, then call print().
    void host.offsetHeight;
    if (!document.body.contains(host)) {
      try { opts.onPrintFailed?.("current_host_removed_before_print"); } catch { /* noop */ }
      return false;
    }

    cleanupTimer = window.setTimeout(cleanup, 120_000);
    try { window.focus(); } catch { /* focus is best-effort; never block print */ }
    // Mark dispatched BEFORE window.print() so a synchronous `afterprint`
    // event (some Chrome builds fire it inside print()) doesn't run cleanup
    // with dispatched=false and skip the success callback.
    dispatched = true;
    try { opts.onPrintDispatched?.("current"); } catch { /* noop */ }
    // Single window.print() covers every copy — the copies were expanded
    // in-DOM above, so the browser paginates them all inside ONE OS print
    // dialog. If the user cancels, cancellation cancels the entire run.
    // We still notify the global printQueue so PrintPreview can freeze
    // the preview scale for the duration of the print run.
    try { printQueue.beginExternalRun(); } catch { /* noop */ }
    const lockedPages = lockDirectPrintPages(host, opts);
    printAttempts = 1;
    afterPrintHandler = () => { cleanup(); };
    window.addEventListener("afterprint", afterPrintHandler);
    try { window.focus(); } catch { /* noop */ }
    window.print();
    logPrintStage("print-invoked", { via: "current", copies, lockedPages, mode: "inline-copies" } as any);
    return true;
  } catch (e: any) {
    try { opts.onPrintFailed?.(`current_print_failed:${e?.message ?? e}`); } catch { /* noop */ }
    releaseRun();
    if (!dispatched) removeExistingDirectPrintNodes();
    return false;
  }
}

export function openPrintWindow(opts: OpenPrintWindowOpts, targetWindow?: Window | null): Window | null {
  logPrintStage("cfg-received", {
    paperSize: opts.paperSize,
    orient: opts.orient,
    margins: opts.margins,
    headerOnce: opts.headerOnce,
    fontScale: opts.fontScale,
    fontScope: opts.fontScope,
    copies: opts.copies,
    sourceElProvided: !!opts.sourceEl,
    bodyHtmlBytes: (opts.bodyHtml ?? "").length,
  });
  const preflight = collectHead(opts);
  const bodyDiag = diagnosePrintHtml(preflight.bodyHtml);
  if (!bodyDiag.hasContent || !bodyDiag.hasDocPrint) {
    const diag: PrintDiagnostics = {
      startedAt: Date.now(),
      paperSize: opts.paperSize ?? "A4",
      orient: opts.orient ?? "portrait",
      sourceElProvided: !!opts.sourceEl,
      bodyHtmlBytes: preflight.bodyHtml.length,
      copiedLinkCount: preflight.linkCount,
      copiedStyleCount: preflight.styleCount,
      stylesheetsReady: false,
      stylesheetsLoaded: 0,
      stylesheetsTotal: 0,
      stylesheetWaitMs: 0,
      timedOut: false,
      fallbackReason: "empty_body",
      errors: [`printable preflight failed: text=${bodyDiag.textLength} hasDocPrint=${bodyDiag.hasDocPrint}`],
    };
    recordPrintDiagnostics(diag);
    logPrintStage("popup-print-aborted-empty-before-open", { bodyHtmlBytes: preflight.bodyHtml.length } as any);
    try { opts.onPrintFailed?.("printable_empty"); } catch { /* noop */ }
    try { if (targetWindow && !targetWindow.closed) targetWindow.close(); } catch { /* noop */ }
    return null;
  }
  const w = targetWindow && !targetWindow.closed
    ? targetWindow
    : openPrintWindowOrSurface("width=900,height=1100");
  if (!w) { logPrintStage("popup-blocked"); return null; }
  const { linkCount, styleCount, bodyHtml } = preflight;
  const diag: PrintDiagnostics = {
    startedAt: Date.now(),
    paperSize: opts.paperSize ?? "A4",
    orient: opts.orient ?? "portrait",
    sourceElProvided: !!opts.sourceEl,
    bodyHtmlBytes: bodyHtml.length,
    copiedLinkCount: linkCount,
    copiedStyleCount: styleCount,
    stylesheetsReady: false,
    stylesheetsLoaded: 0,
    stylesheetsTotal: 0,
    stylesheetWaitMs: 0,
    timedOut: false,
    fallbackReason: opts.sourceEl ? "none" : "no_source_el",
    errors: [],
  };
  if (bodyHtml.replace(/<[^>]+>/g, "").trim().length < 5) {
    diag.fallbackReason = "empty_body";
    diag.errors.push("bodyHtml has no visible text content");
  }
  const html = buildPrintHtml(opts);
  w.document.open();
  w.document.write(html);
  w.document.close();
  logPrintStage("popup-opened", { bytes: html.length });
  const copies = Math.min(10, Math.max(1, Math.round(opts.copies ?? 1)));
  let done = false;
  let printDispatched = false;
  const finish = () => {
    if (done) return;
    done = true;
    if (printDispatched) {
      try { opts.onAfterPrint?.(); } catch { /* noop */ }
    }
    try { w.close(); } catch { /* noop */ }
  };
  // The copy loop below owns every afterprint event. Attaching `finish` here
  // closes the popup after copy 1, dropping copy 2+ in multi-copy jobs.
  const debug = isPrintDebugEnabled();
  const injectBanner = () => {
    if (!debug) return;
    try {
      const banner = w.document.createElement("div");
      banner.id = "lovable-print-debug-banner";
      banner.textContent =
        `DEBUG · paper=${diag.paperSize} ${diag.orient} · ` +
        `sheets=${diag.stylesheetsLoaded}/${diag.stylesheetsTotal} ` +
        `(${diag.stylesheetWaitMs}ms${diag.timedOut ? " TIMEOUT" : ""}) · ` +
        `fallback=${diag.fallbackReason} · bytes=${diag.bodyHtmlBytes}`;
      w.document.body.insertBefore(banner, w.document.body.firstChild);
    } catch { /* noop */ }
  };
  // Wait for stylesheets, fonts and images to be ready before printing.
  // Without this, browsers can start printing with a still-loading document
  // and produce blank pages — the root cause of "text disappears when I
  // hit print".
  const trigger = () => {
    diag.stylesheetWaitMs = Date.now() - diag.startedAt;
    injectBanner();
    recordPrintDiagnostics(diag);
    logPrintStage("snapshot-ready", {
      stylesheetsLoaded: diag.stylesheetsLoaded,
      stylesheetsTotal: diag.stylesheetsTotal,
      timedOut: diag.timedOut,
      fallbackReason: diag.fallbackReason,
    });
    if (diag.fallbackReason !== "none") {
      logPrintStage("fallback-inline-style-used", { reason: diag.fallbackReason });
    }
    void (async () => {
      await waitForPrintableAssets(w.document, diag);
      // Verify the popup actually contains printable text. If not, close it
      // instead of showing the user a blank print dialog.
      const printableRoot = typeof w.document.querySelector === "function"
        ? (w.document.querySelector("#doc-print") ?? w.document.querySelector("[data-doc-print]"))
        : null;
      const visibleText = (printableRoot?.textContent ?? w.document.body?.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim();
      const rect = printableRoot instanceof HTMLElement ? printableRoot.getBoundingClientRect() : null;
      const imgCount = printableRoot?.querySelectorAll?.("img,svg,canvas").length ?? 0;
      const childCount = printableRoot?.querySelectorAll?.("*").length ?? 0;
      const pageCount = w.document.querySelectorAll(".doc-page").length;
      // Only abort when there is truly nothing to print. Do NOT require a
      // non-zero bounding rect — off-screen popups / iframes may still lay
      // out at 0×0 but the browser will render them at real page size when
      // print() is invoked. Aborting on rect=0 caused the false "หน้าพิมพ์ว่าง"
      // toast for real documents.
      const hasContent = !!printableRoot && (visibleText.length >= 10 || imgCount > 0 || childCount > 5 || pageCount > 0);
      if (!hasContent) {
        diag.errors.push(`printable-empty: root=${!!printableRoot} text=${visibleText.length} pages=${pageCount} rect=${rect?.width ?? 0}x${rect?.height ?? 0}`);
        logPrintStage("print-aborted-empty", { textLen: visibleText.length, hasRoot: !!printableRoot, pageCount, rect });
        try { opts.onPrintFailed?.("printable_empty"); } catch { /* noop */ }
        try { w.close(); } catch { /* noop */ }
        finish();
        return;
      }
      try {
        w.focus();
        printDispatched = true;
        try { opts.onPrintDispatched?.("popup"); } catch { /* noop */ }
        // Duplicate the printable root inside the popup document so a
        // SINGLE w.print() covers every copy inside one OS dialog.
        // See same fix in printViaCurrentDocument above.
        if (copies > 1 && printableRoot instanceof HTMLElement) {
          const parent = printableRoot.parentElement ?? w.document.body;
          printableRoot.setAttribute("data-copy-index", "1");
          for (let ci = 2; ci <= copies; ci++) {
            const dup = printableRoot.cloneNode(true) as HTMLElement;
            dup.removeAttribute("id");
            dup.setAttribute("data-doc-print", "true");
            dup.setAttribute("data-copy-index", String(ci));
            parent.appendChild(dup);
          }
        }
        const done = () => { finish(); };
        try { w.addEventListener("afterprint", done, { once: true }); } catch { /* noop */ }
        setTimeout(done, Math.max(30_000, copies * 20_000));
        try { w.focus(); w.print(); } catch { done(); }
        logPrintStage("print-invoked", { copies, via: "popup", mode: "inline-copies" } as any);
      } catch (e: any) {
        printDispatched = false;
        diag.errors.push(`popup_print_failed:${e?.message ?? e}`);
        try { opts.onPrintFailed?.("popup_print_failed"); } catch { /* noop */ }
        finish();
      }
    })();
  };
  const waitForStyles = (deadline: number) => {
    try {
      const linkEls = Array.from(
        w.document.querySelectorAll('link[rel="stylesheet"]')
      ) as HTMLLinkElement[];
      diag.stylesheetsTotal = linkEls.length;
      let loaded = 0;
      const allReady = linkEls.every((l) => {
        try {
          const ok = !!l.sheet;
          if (ok) loaded++;
          return ok;
        } catch {
          loaded++;
          return true; /* cross-origin = treat as ready */
        }
      });
      diag.stylesheetsLoaded = loaded;
      if (allReady) {
        diag.stylesheetsReady = true;
        setTimeout(trigger, 60);
      } else if (Date.now() >= deadline) {
        diag.timedOut = true;
        if (diag.fallbackReason === "none") diag.fallbackReason = "stylesheets_timeout";
        setTimeout(trigger, 60);
      } else {
        setTimeout(() => waitForStyles(deadline), 80);
      }
    } catch (e: any) {
      diag.errors.push(`waitForStyles failed: ${e?.message ?? e}`);
      if (diag.fallbackReason === "none") diag.fallbackReason = "sheet_access_error";
      setTimeout(trigger, 60);
    }
  };
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    waitForStyles(Date.now() + 1500);
  };
  if (w.document.readyState === "complete") {
    setTimeout(start, 0);
  } else {
    w.addEventListener("load", start, { once: true });
    // Safety: in some browsers `load` may not fire for written documents.
    setTimeout(start, 1200);
  }
  // Chrome/WebKit can miss `load` on a document.write() popup, especially when
  // opened from a sandboxed preview iframe. Kick once soon after document.close().
  setTimeout(start, 250);
  // Safety: if afterprint never fires (some in-app browsers), cleanup only
  // after every requested copy has had enough time to advance by timeout.
  setTimeout(finish, Math.max(60_000, copies * 35_000 + 5_000));
  return w;
}

/**
 * Print via a hidden same-origin iframe. Avoids popup-blocker issues that
 * affect `window.open()` inside embedded contexts (Lovable preview, PWAs,
 * in-app browsers). Returns true when the print() call was dispatched.
 */
export function printViaHiddenIframe(opts: OpenPrintWindowOpts): boolean {
  try {
    const html = buildPrintHtml(opts);
    if (!htmlHasPrintableContent(html)) {
      logPrintStage("iframe-print-aborted-empty-before-open", { bodyHtmlBytes: html.length } as any);
      try { opts.onPrintFailed?.("iframe_printable_empty"); } catch { /* noop */ }
      return false;
    }
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("title", "print-frame");
    iframe.style.cssText =
      // IMPORTANT: give the hidden iframe a real, non-zero layout viewport.
      // A 0×0 iframe still writes HTML but every `getBoundingClientRect()`
      // inside it returns 0×0, which used to make the preflight below abort
      // print with a false "printable_empty" error even when the document
      // actually contained text and images. Keep it off-screen but sized
      // like an A4 sheet so layout, images, and rects behave normally.
      "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;opacity:0;pointer-events:none;";
    document.body.appendChild(iframe);

    let done = false;
    let printDispatched = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      if (printDispatched) {
        try { opts.onAfterPrint?.(); } catch { /* noop */ }
      }
      try { iframe.parentNode?.removeChild(iframe); } catch { /* noop */ }
    };

    const trigger = () => {
      const cw = iframe.contentWindow;
      if (!cw) { cleanup(); return; }
      // The copy loop owns afterprint. Cleanup only after the last copy so
      // iframe printing does not drop copy 2+.
      const copies = Math.min(10, Math.max(1, Math.round(opts.copies ?? 1)));
      void (async () => {
        await waitForPrintableAssets(cw.document);
        const printableRoot =
          cw.document.querySelector("#doc-print") ??
          cw.document.querySelector("[data-doc-print]");
        const visibleText = (printableRoot?.textContent ?? cw.document.body?.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim();
        const rect = printableRoot instanceof HTMLElement ? printableRoot.getBoundingClientRect() : null;
        const imgCount = printableRoot?.querySelectorAll?.("img,svg,canvas").length ?? 0;
        const childCount = printableRoot?.querySelectorAll?.("*").length ?? 0;
        const pageCount = cw.document.querySelectorAll(".doc-page").length;
        // Same relaxed content check as the popup path — see comment there.
        const hasContent = !!printableRoot && (visibleText.length >= 10 || imgCount > 0 || childCount > 5 || pageCount > 0);
        if (!hasContent) {
          logPrintStage("iframe-print-aborted-empty", { textLen: visibleText.length, pageCount, rect } as any);
          try { opts.onPrintFailed?.("iframe_printable_empty"); } catch { /* noop */ }
          cleanup();
          return;
        }
        try {
          cw.focus();
          printDispatched = true;
          try { opts.onPrintDispatched?.("iframe"); } catch { /* noop */ }
          // Duplicate the printable root inside the iframe document so a
          // SINGLE cw.print() covers every copy inside one OS dialog.
          if (copies > 1 && printableRoot instanceof HTMLElement) {
            const parent = printableRoot.parentElement ?? cw.document.body;
            printableRoot.setAttribute("data-copy-index", "1");
            for (let ci = 2; ci <= copies; ci++) {
              const dup = printableRoot.cloneNode(true) as HTMLElement;
              dup.removeAttribute("id");
              dup.setAttribute("data-doc-print", "true");
              dup.setAttribute("data-copy-index", String(ci));
              parent.appendChild(dup);
            }
          }
          const done = () => { cleanup(); };
          try { cw.addEventListener("afterprint", done, { once: true }); } catch { /* noop */ }
          try { window.addEventListener("afterprint", done, { once: true }); } catch { /* noop */ }
          setTimeout(done, Math.max(30_000, copies * 20_000));
          try { cw.focus(); cw.print(); } catch { done(); }
          logPrintStage("print-invoked", { copies, via: "iframe", mode: "inline-copies" } as any);
        } catch {
          printDispatched = false;
          try { opts.onPrintFailed?.("iframe_print_failed"); } catch { /* noop */ }
          cleanup();
        }
      })();
      setTimeout(cleanup, Math.max(60_000, copies * 35_000 + 5_000));
    };

    let iframeTriggered = false;
    const triggerOnce = () => {
      if (iframeTriggered) return;
      iframeTriggered = true;
      setTimeout(trigger, 80);
    };
    iframe.addEventListener("load", triggerOnce, { once: true });
    // Use srcdoc for cleaner same-origin handling; fall back to document.write.
    try {
      iframe.srcdoc = html;
    } catch {
      const doc = iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
      }
    }
    setTimeout(triggerOnce, 300);
    return true;
  } catch (e: any) {
    try { logPrintStage("iframe-print-failed", { error: String(e?.message ?? e) } as any); } catch { /* noop */ }
    return false;
  }
}