/**
 * Row-aware A4 PDF pagination for the ใบสั่งสินค้า (Purchase Order) page.
 *
 * Design contract:
 *   - Source of truth is the on-screen `#po-print-root` element.
 *   - We deep-clone it, synchronise <input>/<textarea> values into static
 *     text nodes, and strip anything marked `.po-no-print` /
 *     `[data-print-exclude="true"]` so toolbar/form chrome is never captured.
 *   - We assemble an ordered stream of "sections" (header, notice,
 *     customer/document info, items table, totals, notes+signature) and
 *     lay them out into offscreen A4 page DOM nodes, measuring after each
 *     append. When the next section (or a single item row) does not fit,
 *     we open a fresh A4 page. For continuation pages of the items table
 *     we clone the <thead> so the table header repeats on every page.
 *   - Each A4 page is captured by html2canvas independently and added as a
 *     single image on its own jsPDF page — no negative offsets, no
 *     mid-row slicing.
 *   - CSS `transform: scale(...)` on the on-screen preview is neutralised
 *     on the clone so exported dimensions stay a true 210×297 mm.
 */

export const PX_PER_MM = 96 / 25.4;
export const A4_W_PX = 210 * PX_PER_MM;
export const A4_H_PX = 297 * PX_PER_MM;
export const PAGE_PAD_PX = 12 * PX_PER_MM;
export const USABLE_H_PX = A4_H_PX - 2 * PAGE_PAD_PX;

export interface PaginateResult {
  container: HTMLDivElement;
  pages: HTMLDivElement[];
}

export interface BuildPagesOptions {
  /** When true (default), sandbox is fixed-positioned offscreen for capture.
   *  When false, container is a plain block ready to be inserted into a
   *  visible preview host (no positioning, no overflow tricks). */
  offscreen?: boolean;
}

/** Signal that a single item row does not fit an A4 page even after the
 *  deterministic compaction fallback. Callers should surface this to the
 *  user rather than silently cropping. */
export class PoRowTooTallError extends Error {
  public readonly rowIndex: number;
  constructor(rowIndex: number) {
    super(`ไม่สามารถวางแถวสินค้า #${rowIndex + 1} ในหน้าเดียวได้ แม้บีบขนาดแล้ว`);
    this.name = "PoRowTooTallError";
    this.rowIndex = rowIndex;
  }
}

/** Signal that a tail block (totals or notes+signature) is too tall to
 *  fit even a fresh A4 page after readable compaction. Never crop it. */
export class PoBlockTooTallError extends Error {
  public readonly section: "totals" | "notes";
  constructor(section: "totals" | "notes") {
    const label = section === "totals" ? "ยอดรวม" : "หมายเหตุ/ลายเซ็น";
    super(`ไม่สามารถวางบล็อก "${label}" ในหน้าเดียวได้ แม้บีบขนาดแล้ว`);
    this.name = "PoBlockTooTallError";
    this.section = section;
  }
}

/**
 * Wait for fonts + every image inside `root` to actually decode. Uses
 * `img.decode()` when available (guarantees the pixel data is ready)
 * and falls back to `load` / `error` events for older browsers.
 */
export async function waitForPoAssets(root: HTMLElement | null): Promise<void> {
  try { await (document as any).fonts?.ready; } catch { /* noop */ }
  if (!root) return;
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(imgs.map(async (img) => {
    if (typeof img.decode === "function") {
      try { await img.decode(); return; } catch { /* fall through to load/error */ }
    }
    if (img.complete && img.naturalWidth > 0) return;
    await new Promise<void>((resolve) => {
      const done = () => {
        img.removeEventListener("load", done);
        img.removeEventListener("error", done);
        resolve();
      };
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    });
  }));
}

function makePage(offscreen: boolean): HTMLDivElement {
  const page = document.createElement("div");
  page.className = "po-pdf-page";
  const styleParts = [
    `width:${A4_W_PX}px`,
    `height:${A4_H_PX}px`,
    `padding:${PAGE_PAD_PX}px`,
    "box-sizing:border-box",
    "background:#ffffff",
    "color:#111",
    "overflow:hidden",
    "position:relative",
    "font-family:\"Sarabun\",\"Noto Sans Thai\",system-ui,sans-serif",
    "transform:none",
  ];
  if (!offscreen) {
    styleParts.push("box-shadow:0 10px 30px -12px rgba(0,0,0,0.18)");
    styleParts.push("margin:0 auto");
  }
  page.style.cssText = styleParts.join(";");
  const content = document.createElement("div");
  content.className = "po-pdf-page-content";
  content.style.cssText = `width:100%;max-width:100%;`;
  page.appendChild(content);
  return page;
}

function contentEl(page: HTMLDivElement): HTMLDivElement {
  return page.firstElementChild as HTMLDivElement;
}

function contentHeightPx(page: HTMLDivElement): number {
  return contentEl(page).getBoundingClientRect().height;
}

/**
 * Try to append `node` to the given page. Rolls back if it would overflow
 * the usable A4 body height. Returns true on success.
 */
function tryAppend(page: HTMLDivElement, node: HTMLElement): boolean {
  const c = contentEl(page);
  c.appendChild(node);
  if (contentHeightPx(page) > USABLE_H_PX + 0.5) {
    c.removeChild(node);
    return false;
  }
  return true;
}

/** Replace every <input>/<textarea> inside `clone` with a static text node
 *  that visually matches the original. Values are taken from the matching
 *  live element in `source` (both trees have identical structure at call
 *  time because we clone before any structural mutation). */
function replaceFormControlsWithText(source: HTMLElement, clone: HTMLElement): void {
  const srcCtl = Array.from(source.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"));
  const dstCtl = Array.from(clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"));
  const n = Math.min(srcCtl.length, dstCtl.length);
  for (let i = 0; i < n; i++) {
    const src = srcCtl[i];
    const dst = dstCtl[i];
    const value = String(src.value ?? "");
    const isTextarea = dst.tagName === "TEXTAREA";
    const replacement = document.createElement(isTextarea ? "div" : "span");
    replacement.className = dst.className;
    replacement.setAttribute("data-po-value", "true");
    replacement.style.display = isTextarea ? "block" : "inline-block";
    replacement.style.whiteSpace = "pre-wrap";
    replacement.style.wordBreak = "break-word";
    replacement.style.minHeight = "1.4em";
    replacement.textContent = value || "\u00A0";
    dst.replaceWith(replacement);
  }
}

/** Strip elements the caller marked as toolbar / print-excluded. */
function stripNoPrint(clone: HTMLElement): void {
  clone
    .querySelectorAll('.po-no-print, [data-print-exclude="true"]')
    .forEach((el) => el.remove());
}

function extractSection(clone: HTMLElement, name: string): HTMLElement | null {
  return clone.querySelector<HTMLElement>(`[data-po-section="${name}"]`);
}

/**
 * Build the ordered list of offscreen A4 pages ready for capture.
 * The returned `container` is inserted into `document.body` (positioned
 * offscreen) and MUST be removed by the caller in a `finally` block.
 */
export function paginatePoRoot(sourceRoot: HTMLElement): PaginateResult {
  return buildPoPages(sourceRoot, { offscreen: true });
}

/**
 * Shared implementation used by both PDF export (offscreen) and the
 * on-screen "ดูตัวอย่าง" (offscreen: false). Same paginator = identical
 * page count, row partitioning and repeated thead between preview & PDF.
 */
export function buildPoPages(
  sourceRoot: HTMLElement,
  opts: BuildPagesOptions = {},
): PaginateResult {
  const offscreen = opts.offscreen !== false;
  // --- 1. clone + sync values + strip chrome ---
  const clone = sourceRoot.cloneNode(true) as HTMLElement;
  replaceFormControlsWithText(sourceRoot, clone);
  stripNoPrint(clone);
  // Neutralise any responsive on-screen scaling so the export is real A4.
  clone.style.transform = "none";
  clone.style.width = `${A4_W_PX}px`;

  // --- 2. mount sandbox — offscreen for capture, or bare block for preview ---
  const container = document.createElement("div");
  container.setAttribute("data-po-pdf-sandbox", "true");
  if (offscreen) {
    container.style.cssText = [
      "position:fixed",
      "left:-10000px",
      "top:0",
      "z-index:-1",
      "background:#ffffff",
      "pointer-events:none",
    ].join(";");
    document.body.appendChild(container);
  } else {
    container.setAttribute("data-po-preview-pages", "true");
    container.style.cssText = "width:100%;display:block;";
    // Must be in the live DOM for getBoundingClientRect measurements to
    // reflect real layout. Caller relocates it into the visible host.
    document.body.appendChild(container);
  }

  try {
  // --- 3. pull each named section out of the clone ---
  const header = extractSection(clone, "header");
  const notice = extractSection(clone, "notice");
  const info = extractSection(clone, "info");
  const itemsTable = extractSection(clone, "items") as HTMLTableElement | null;
  const totals = extractSection(clone, "totals");
  const notesSig = extractSection(clone, "notes");

  const pages: HTMLDivElement[] = [];
  const openPage = () => {
    const p = makePage(offscreen);
    container.appendChild(p);
    pages.push(p);
    return p;
  };

  let page = openPage();

  // --- 4. first-page blocks: header, notice, customer/doc info ---
  const firstBlocks = [header, notice, info].filter(Boolean) as HTMLElement[];
  for (const block of firstBlocks) {
    if (!tryAppend(page, block)) {
      page = openPage();
      // Try once more on a fresh page. If a single block itself is bigger
      // than one page (unlikely for the fixed header), we just accept it —
      // do NOT slice it.
      contentEl(page).appendChild(block);
    }
  }

  // --- 5. items table, row-by-row with repeating <thead> ---
  if (itemsTable) {
    const originalThead = itemsTable.querySelector("thead")!.cloneNode(true) as HTMLElement;
    const originalRows = Array.from(itemsTable.querySelectorAll("tbody > tr"));

    const buildFreshTable = (): HTMLTableElement => {
      const t = document.createElement("table");
      t.className = itemsTable.className;
      t.setAttribute("data-po-section", "items");
      t.setAttribute("data-po-items-continuation", pages.length > 1 ? "true" : "false");
      t.style.width = "100%";
      t.style.borderCollapse = "collapse";
      t.appendChild(originalThead.cloneNode(true));
      const tb = document.createElement("tbody");
      t.appendChild(tb);
      return t;
    };

    let currentTable = buildFreshTable();
    // Mark first table (initial) as non-continuation.
    currentTable.setAttribute("data-po-items-continuation", "false");
    if (!tryAppend(page, currentTable)) {
      page = openPage();
      contentEl(page).appendChild(currentTable);
    }

    for (let idx = 0; idx < originalRows.length; idx++) {
      const row = originalRows[idx] as HTMLElement;
      const tbody = currentTable.querySelector("tbody")!;
      tbody.appendChild(row);
      if (contentHeightPx(page) > USABLE_H_PX + 0.5) {
        // Row does not fit — undo, open new page with a fresh table that
        // carries a REPEATED <thead>, then place the row there.
        tbody.removeChild(row);
        page = openPage();
        currentTable = buildFreshTable();
        currentTable.setAttribute("data-po-items-continuation", "true");
        contentEl(page).appendChild(currentTable);
        const newTbody = currentTable.querySelector("tbody")!;
        newTbody.appendChild(row);
        // Row alone on a fresh page — if it still overflows, apply the
        // deterministic compact fallback and re-measure. If STILL too big,
        // throw so the caller can surface a clear error instead of
        // silently cropping (overflow:hidden on the page would crop it).
        if (contentHeightPx(page) > USABLE_H_PX + 0.5) {
          row.classList.add("po-compact-row");
          if (contentHeightPx(page) > USABLE_H_PX + 0.5) {
            row.classList.add("po-compact-row-xs");
            if (contentHeightPx(page) > USABLE_H_PX + 0.5) {
              // Give up cleanly.
              throw new PoRowTooTallError(idx);
            }
          }
        }
      }
    }
  }

    // --- 6. whole-block tail: totals, notes + signature ---
    const tail: Array<[HTMLElement, "totals" | "notes"]> = [];
    if (totals) tail.push([totals, "totals"]);
    if (notesSig) tail.push([notesSig, "notes"]);
    for (const [block, section] of tail) {
      if (!tryAppend(page, block)) {
        page = openPage();
        contentEl(page).appendChild(block);
        // Fresh page — if the block itself still overflows, apply the
        // deterministic compact-block fallback and remeasure. If STILL too
        // big, throw a clear error rather than letting overflow:hidden
        // silently crop it.
        if (contentHeightPx(page) > USABLE_H_PX + 0.5) {
          block.classList.add("po-compact-block");
          if (contentHeightPx(page) > USABLE_H_PX + 0.5) {
            block.classList.add("po-compact-block-xs");
            if (contentHeightPx(page) > USABLE_H_PX + 0.5) {
              throw new PoBlockTooTallError(section);
            }
          }
        }
      }
    }

    return { container, pages };
  } catch (err) {
    // Any failure during pagination MUST leave the DOM clean — the caller
    // never receives the container so it can't remove it themselves.
    if (container.parentNode) container.parentNode.removeChild(container);
    throw err;
  }
}

/** Full PDF export orchestrator. Cleans up all offscreen DOM and object
 *  URLs in `finally`. Uses one html2canvas call PER page and one jsPDF
 *  page PER image. */
export async function exportPurchaseOrderPdf(
  sourceRoot: HTMLElement,
  filename: string,
  deps?: {
    html2canvas?: typeof import("html2canvas").default;
    jsPDF?: typeof import("jspdf").jsPDF;
  },
): Promise<void> {
  const [html2canvasMod, jsPDFMod] = await Promise.all([
    deps?.html2canvas ? Promise.resolve({ default: deps.html2canvas }) : import("html2canvas"),
    deps?.jsPDF ? Promise.resolve({ default: deps.jsPDF }) : import("jspdf"),
  ]);
  const html2canvas = html2canvasMod.default;
  const jsPDF = jsPDFMod.default;

  await waitForPoAssets(sourceRoot);
  const { container, pages } = paginatePoRoot(sourceRoot);
  const objectUrls: string[] = [];
  try {
    // Fonts are already ready via waitForPoAssets on the source; the
    // offscreen clone shares those font faces.
    await waitForPoAssets(container);

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const canvas = await html2canvas(page, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        windowWidth: page.offsetWidth,
        windowHeight: page.offsetHeight,
      });
      const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
      if (i > 0) pdf.addPage();
      pdf.addImage(dataUrl, "JPEG", 0, 0, 210, 297);
    }
    pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
  } finally {
    for (const u of objectUrls) {
      try { URL.revokeObjectURL(u); } catch { /* noop */ }
    }
    if (container.parentNode) container.parentNode.removeChild(container);
  }
}