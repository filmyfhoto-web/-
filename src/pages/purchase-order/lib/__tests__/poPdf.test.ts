/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  paginatePoRoot,
  buildPoPages,
  waitForPoAssets,
  exportPurchaseOrderPdf,
  PoRowTooTallError,
  PoBlockTooTallError,
  A4_W_PX,
  A4_H_PX,
  USABLE_H_PX,
} from "../poPdf";

// ---------- fixture: minimal DOM that mirrors the redesigned print root ----------
let __tallRow = false;
let __tallTotals = false;
let __origRect: () => DOMRect;

beforeEach(() => {
  __origRect = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    // Feed synthetic heights ONLY to the offscreen page-content wrapper
    // that our pagination code measures. Everything else falls through
    // to jsdom's default (which happens to be all zeros — fine here).
    if (this.classList && this.classList.contains("po-pdf-page-content")) {
      let h = 0;
      this.childNodes.forEach((c) => {
        if (!(c instanceof HTMLElement)) return;
        if (c.tagName === "TABLE") {
          const rows = c.querySelectorAll("tbody > tr").length;
          h += 30 + rows * (__tallRow ? 1400 : 30);
          return;
        }
        const name = c.getAttribute("data-po-section");
        if (name === "header") h += 120;
        else if (name === "notice") h += 90;
        else if (name === "info") h += 160;
        else if (name === "totals") h += __tallTotals ? 1400 : 120;
        else if (name === "notes") h += 120;
        else h += 30;
      });
      return { height: h, width: A4_W_PX, top: 0, left: 0, right: A4_W_PX, bottom: h, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    }
    return __origRect.call(this);
  };
});

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = __origRect;
  __tallRow = false;
  __tallTotals = false;
  document.body.innerHTML = "";
});

function buildSourceRoot(rowCount: number, opts?: { tallRow?: boolean; tallTotals?: boolean }): HTMLElement {
  __tallRow = !!opts?.tallRow;
  __tallTotals = !!opts?.tallTotals;
  const root = document.createElement("div");
  root.id = "po-print-root";
  root.setAttribute("data-po-print", "true");

  const mkSection = (name: string, height: number, label = name) => {
    const s = document.createElement("div");
    s.setAttribute("data-po-section", name);
    s.textContent = label;
    Object.defineProperty(s, "getBoundingClientRect", {
      value: () => ({ height, width: A4_W_PX, top: 0, left: 0, right: 0, bottom: height, x: 0, y: 0, toJSON: () => ({}) }),
      configurable: true,
    });
    return s;
  };

  root.appendChild(mkSection("header", 120));
  root.appendChild(mkSection("notice", 90));
  root.appendChild(mkSection("info", 160));

  const table = document.createElement("table");
  table.setAttribute("data-po-section", "items");
  table.className = "po-items";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["ลำดับ", "รายการสินค้า", "จำนวน", "หน่วย", "ราคา", "ยอดรวม"].forEach((t) => {
    const th = document.createElement("th"); th.textContent = t; headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  table.appendChild(tbody);
  for (let i = 0; i < rowCount; i++) {
    const tr = document.createElement("tr");
    tr.setAttribute("data-row-index", String(i));
    // Include a Thai multiline description so we can assert it survives whole.
    tr.innerHTML = `<td>${i + 1}</td><td>สินค้าไทย\nคำอธิบายบรรทัดที่สอง</td><td>1</td><td>ชิ้น</td><td>10</td><td>10</td>`;
    tbody.appendChild(tr);
  }
  root.appendChild(table);

  root.appendChild(mkSection("totals", 120));
  root.appendChild(mkSection("notes", 120));

  // Chrome that must be stripped.
  const chrome = document.createElement("button");
  chrome.className = "po-no-print";
  chrome.textContent = "TOOLBAR";
  root.appendChild(chrome);
  const chrome2 = document.createElement("div");
  chrome2.setAttribute("data-print-exclude", "true");
  chrome2.textContent = "EXCLUDE-ME";
  root.appendChild(chrome2);

  return root;
}

describe("paginatePoRoot — row-aware A4 pagination", () => {
  let root: HTMLElement;

  it("strips toolbar / [data-print-exclude] chrome from all pages", () => {
    root = buildSourceRoot(3);
    document.body.appendChild(root);
    const { container, pages } = paginatePoRoot(root);
    const combined = pages.map((p) => p.textContent).join(" ");
    expect(combined).not.toContain("TOOLBAR");
    expect(combined).not.toContain("EXCLUDE-ME");
    container.remove();
  });

  it("keeps every product row intact (no row is sliced) and repeats <thead> on continuation pages", () => {
    // Many rows → guaranteed multi-page.
    root = buildSourceRoot(60);
    document.body.appendChild(root);
    const { container, pages } = paginatePoRoot(root);
    expect(pages.length).toBeGreaterThan(1);

    // Every page that has item rows must have exactly one <thead> with the
    // full column set — i.e. the header repeats on each such page.
    const itemsPages = pages.filter((p) => p.querySelector("table[data-po-section='items']"));
    expect(itemsPages.length).toBeGreaterThan(1);
    for (const p of itemsPages) {
      const heads = p.querySelectorAll("table[data-po-section='items'] thead tr");
      expect(heads.length).toBe(1);
      expect(heads[0].children.length).toBe(6);
    }

    // At least one page after the first items page is flagged as a
    // continuation — proving thead is a *repeated* clone, not a
    // once-only header.
    const continuations = itemsPages.filter(
      (p) => p.querySelector("table[data-po-items-continuation='true']"),
    );
    expect(continuations.length).toBeGreaterThan(0);

    // No row is duplicated across pages and no row is missing.
    const collectedIdx = pages
      .flatMap((p) => Array.from(p.querySelectorAll<HTMLElement>("tbody > tr")))
      .map((tr) => Number(tr.getAttribute("data-row-index")));
    const unique = new Set(collectedIdx);
    expect(unique.size).toBe(60);
    expect(collectedIdx.length).toBe(60);
    for (let i = 0; i < 60; i++) expect(unique.has(i)).toBe(true);

    container.remove();
  });

  it("moves whole totals / notes+signature blocks to a new page when they do not fit", () => {
    root = buildSourceRoot(40);
    document.body.appendChild(root);
    const { container, pages } = paginatePoRoot(root);
    const totalsPage = pages.find((p) => p.querySelector("[data-po-section='totals']"));
    const notesPage = pages.find((p) => p.querySelector("[data-po-section='notes']"));
    expect(totalsPage).toBeTruthy();
    expect(notesPage).toBeTruthy();
    // Each is a single, unsliced node.
    expect(totalsPage!.querySelectorAll("[data-po-section='totals']").length).toBe(1);
    expect(notesPage!.querySelectorAll("[data-po-section='notes']").length).toBe(1);
    container.remove();
  });

  it("preserves Thai multiline descriptions in-place (never slices content)", () => {
    root = buildSourceRoot(3);
    document.body.appendChild(root);
    const { container, pages } = paginatePoRoot(root);
    const combined = pages.map((p) => p.textContent).join("\n");
    expect(combined).toContain("สินค้าไทย");
    expect(combined).toContain("คำอธิบายบรรทัดที่สอง");
    container.remove();
  });

  it("emits offscreen pages sized at exactly A4 (210×297mm ≈ 793.7×1122.5px)", () => {
    root = buildSourceRoot(2);
    document.body.appendChild(root);
    const { container, pages } = paginatePoRoot(root);
    for (const p of pages) {
      expect(p.style.width).toBe(`${A4_W_PX}px`);
      expect(p.style.height).toBe(`${A4_H_PX}px`);
    }
    expect(USABLE_H_PX).toBeGreaterThan(0);
    container.remove();
  });
});

describe("waitForPoAssets — image decode() readiness", () => {
  it("awaits img.decode() for every image when the API is supported", async () => {
    const root = document.createElement("div");
    const img1 = document.createElement("img");
    const img2 = document.createElement("img");
    const decode1 = vi.fn().mockResolvedValue(undefined);
    const decode2 = vi.fn().mockResolvedValue(undefined);
    (img1 as any).decode = decode1;
    (img2 as any).decode = decode2;
    root.appendChild(img1);
    root.appendChild(img2);
    await waitForPoAssets(root);
    expect(decode1).toHaveBeenCalledTimes(1);
    expect(decode2).toHaveBeenCalledTimes(1);
  });

  it("falls back to load/error when decode() rejects or is unavailable", async () => {
    const root = document.createElement("div");
    const img = document.createElement("img");
    (img as any).decode = vi.fn().mockRejectedValue(new Error("no bitmap"));
    root.appendChild(img);
    const p = waitForPoAssets(root);
    // Simulate the browser dispatching load after decode() rejected.
    setTimeout(() => img.dispatchEvent(new Event("load")), 5);
    await p;
    // If we reach here without hanging, the fallback path worked.
    expect(true).toBe(true);
  });
});

describe("exportPurchaseOrderPdf — one image per jsPDF page, no negative offsets", () => {
  it("adds exactly one image per page, none with a negative Y offset", async () => {
    const root = buildSourceRoot(30);
    document.body.appendChild(root);

    const addImage = vi.fn();
    const addPage = vi.fn();
    const save = vi.fn();
    class FakePDF {
      addImage = addImage;
      addPage = addPage;
      save = save;
    }
    const fakeHtml2canvas = vi.fn(async (_el: HTMLElement) => ({
      width: 100,
      height: 100,
      toDataURL: () => "data:image/jpeg;base64,AAA",
    })) as unknown as typeof import("html2canvas").default;

    await exportPurchaseOrderPdf(root, "test.pdf", {
      html2canvas: fakeHtml2canvas,
      jsPDF: FakePDF as any,
    });

    // Every addImage call places at y=0 (no negative offset "trick").
    for (const call of addImage.mock.calls) {
      const y = call[2];
      expect(y).toBe(0);
    }
    // Number of image writes equals number of pages captured.
    const capturedPages = (fakeHtml2canvas as any).mock.calls.length;
    expect(addImage).toHaveBeenCalledTimes(capturedPages);
    // Exactly (pages - 1) addPage calls (first page is implicit).
    expect(addPage).toHaveBeenCalledTimes(Math.max(0, capturedPages - 1));
    expect(save).toHaveBeenCalledTimes(1);
    document.body.innerHTML = "";
  });
});

describe("PurchaseOrder redesign — responsive preview & source contract", () => {
  const SRC = fs.readFileSync(
    path.resolve(__dirname, "../../../PurchaseOrder.tsx"),
    "utf8",
  );

  it("uses ResizeObserver + a scale transform to fit the A4 sheet on small screens", () => {
    expect(SRC).toMatch(/ResizeObserver/);
    expect(SRC).toMatch(/previewScale/);
    expect(SRC).toMatch(/scale\(\$\{previewScale\}\)/);
  });

  it("keeps the actual sheet at A4 (210mm) so print/PDF are true size", () => {
    // The CSS token width:210mm lives in index.css .po-sheet — read it.
    const css = fs.readFileSync(path.resolve(__dirname, "../../../../index.css"), "utf8");
    expect(css).toMatch(/\.po-sheet\s*\{[^}]*width:\s*210mm/);
    expect(css).toMatch(/min-height:\s*297mm/);
    // Print media strips the scale transform so exported dimensions are 1:1.
    expect(css).toMatch(/@media print[\s\S]*transform:\s*none\s*!important/);
  });

  it("does not reintroduce the tall-canvas negative-offset PDF exporter", () => {
    expect(SRC).not.toMatch(/pos\s*-=\s*pageH/);
    expect(SRC).not.toMatch(/hLeft\s*-=\s*pageH/);
  });

  it("true preview mode uses buildPoPages (not just border-hiding)", () => {
    expect(SRC).toMatch(/buildPoPages/);
    expect(SRC).toMatch(/po-preview-host/);
    // The old border-only preview class is no longer applied conditionally.
    expect(SRC).not.toMatch(/previewMode\s*\?\s*"po-preview-mode"/);
  });

  it("reserves the actual editable sheet height on small screens (not fixed 297mm)", () => {
    // sheet.scrollHeight * previewScale, not the old (297*96/25.4)*scale.
    expect(SRC).toMatch(/sheetHeight\s*\*\s*previewScale/);
    expect(SRC).not.toMatch(/\(\(297 \* 96\) \/ 25\.4\) \* previewScale/);
  });

  it("uses AutoGrowTextarea for item descriptions and note", () => {
    expect(SRC).toMatch(/function AutoGrowTextarea/);
    // useLayoutEffect keyed to value — resizes on mount AND on value change.
    expect(SRC).toMatch(/useLayoutEffect\([\s\S]*props\.value/);
    // Both the item description and the note use it.
    const usages = SRC.match(/<AutoGrowTextarea\b/g) || [];
    expect(usages.length).toBeGreaterThanOrEqual(2);
  });
});

describe("buildPoPages — visible preview parity with PDF paginator", () => {
  it("produces the same page count and row partitioning whether offscreen or on-screen", () => {
    const root = buildSourceRoot(50);
    document.body.appendChild(root);
    const off = paginatePoRoot(root);
    const on = buildPoPages(root, { offscreen: false });
    expect(on.pages.length).toBe(off.pages.length);
    // Each on-screen items page repeats <thead>.
    const itemsPages = on.pages.filter((p) => p.querySelector("table[data-po-section='items']"));
    for (const p of itemsPages) {
      const heads = p.querySelectorAll("table[data-po-section='items'] thead tr");
      expect(heads.length).toBe(1);
    }
    off.container.remove();
    on.container.remove();
  });

  it("on-screen preview container is not offscreen-positioned", () => {
    const root = buildSourceRoot(3);
    document.body.appendChild(root);
    const { container } = buildPoPages(root, { offscreen: false });
    expect(container.style.position).not.toBe("fixed");
    expect(container.style.left).not.toBe("-10000px");
    expect(container.getAttribute("data-po-preview-pages")).toBe("true");
    container.remove();
  });
});

describe("oversize single row safety", () => {
  it("throws PoRowTooTallError instead of silently cropping a row bigger than a page", () => {
    // Row height 200 * (compact still ~200 in fixture) = way over usable A4.
    const root = buildSourceRoot(1, { tallRow: true });
    document.body.appendChild(root);
    // Force the fixture to keep reporting 200px even with compaction classes.
    expect(() => paginatePoRoot(root)).toThrow(PoRowTooTallError);
  });

  it("removes the offscreen sandbox from document.body when it throws", () => {
    const root = buildSourceRoot(1, { tallRow: true });
    document.body.appendChild(root);
    expect(document.querySelector("[data-po-pdf-sandbox]")).toBeNull();
    try { paginatePoRoot(root); } catch { /* expected */ }
    // The sandbox MUST have been removed by the paginator itself so the
    // caller (which never received the container) can't leak DOM.
    expect(document.querySelector("[data-po-pdf-sandbox]")).toBeNull();
  });
});

describe("oversize tail block safety", () => {
  it("throws PoBlockTooTallError when totals cannot fit even after compaction", () => {
    const root = buildSourceRoot(3, { tallTotals: true });
    document.body.appendChild(root);
    expect(() => paginatePoRoot(root)).toThrow(PoBlockTooTallError);
    // Sandbox is cleaned up on throw.
    expect(document.querySelector("[data-po-pdf-sandbox]")).toBeNull();
  });

  it("carries a section identifier so callers can point users to the offending block", () => {
    const root = buildSourceRoot(3, { tallTotals: true });
    document.body.appendChild(root);
    try {
      paginatePoRoot(root);
      throw new Error("expected PoBlockTooTallError");
    } catch (e) {
      expect(e).toBeInstanceOf(PoBlockTooTallError);
      expect((e as PoBlockTooTallError).section).toBe("totals");
    }
  });

  it("attempts BOTH .po-compact-block and .po-compact-block-xs before throwing", () => {
    // Spy on classList.add to observe the compaction ladder.
    const added: string[] = [];
    const origAdd = DOMTokenList.prototype.add;
    DOMTokenList.prototype.add = function (...tokens: string[]) {
      for (const t of tokens) added.push(t);
      return origAdd.apply(this, tokens as any);
    };
    try {
      const root = buildSourceRoot(3, { tallTotals: true });
      document.body.appendChild(root);
      expect(() => paginatePoRoot(root)).toThrow(PoBlockTooTallError);
      expect(added).toContain("po-compact-block");
      expect(added).toContain("po-compact-block-xs");
    } finally {
      DOMTokenList.prototype.add = origAdd;
    }
  });
});

describe("PurchaseOrder — stable preview viewport for scale", () => {
  const SRC = fs.readFileSync(
    path.resolve(__dirname, "../../../PurchaseOrder.tsx"),
    "utf8",
  );
  it("computes previewScale from a stable viewport ref, never from wrapRef", () => {
    expect(SRC).toMatch(/previewViewportRef/);
    // The ResizeObserver that drives previewScale must observe the
    // viewport, not the wrap (which becomes .po-source-hidden in preview).
    expect(SRC).toMatch(/previewViewportRef\.current[\s\S]{0,400}setPreviewScale[\s\S]{0,400}ro\.observe\(viewport\)/);
    // The scale effect must not observe `wrap` (that would reintroduce
    // the mobile-preview scale bug). We accept ro.observe(sheet) only —
    // in a separate effect used for height reservation.
    expect(SRC).not.toMatch(/ro\.observe\(wrap\)/);
  });

  it("uses a monotonic generation token to discard stale async preview builds", () => {
    expect(SRC).toMatch(/previewGenRef/);
    expect(SRC).toMatch(/const myGen = \+\+previewGenRef\.current/);
    expect(SRC).toMatch(/isStale\(\)/);
  });
});