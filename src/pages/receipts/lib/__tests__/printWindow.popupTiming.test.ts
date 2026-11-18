import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { openPrintWindow, printViaCurrentDocument, printViaHiddenIframe, buildPrintHtml, diagnosePrintHtml } from "../printWindow";

function makeFakeWindow() {
  const doc: any = {
    _html: "",
    open: vi.fn(),
    write: vi.fn((s: string) => { doc._html += s; }),
    close: vi.fn(),
    readyState: "complete",
    querySelector: (sel: string) => document.createElement("div"),
    querySelectorAll: () => [] as any,
    images: [],
    body: { textContent: "", firstChild: null, insertBefore: () => {} },
    defaultView: null as any,
  };
  const w: any = {
    document: doc,
    closed: false,
    focus: vi.fn(),
    print: vi.fn(),
    close: vi.fn(() => { w.closed = true; }),
    addEventListener: vi.fn(),
    requestAnimationFrame: (cb: any) => setTimeout(cb, 0),
  };
  doc.defaultView = w;
  return w as Window & { print: any; close: any };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("openPrintWindow reuses a pre-opened targetWindow", () => {
  it("does NOT call window.open when a live targetWindow is provided (proves synchronous-open pattern)", () => {
    const openSpy = vi.spyOn(window, "open");
    const target = makeFakeWindow();
    const el = document.createElement("div");
    el.innerHTML = `<div id="doc-print"><section class="doc-page">HELLO SYNC POPUP</section></div>`;
    document.body.appendChild(el);
    const result = openPrintWindow({ bodyHtml: "", sourceEl: el, paperSize: "A4", orient: "portrait" }, target);
    expect(result).toBe(target);
    expect(openSpy).not.toHaveBeenCalled();
    // Verify the doc was written into the reused window.
    expect((target.document as any)._html).toContain("HELLO SYNC POPUP");
    document.body.removeChild(el);
  });

  it("aborts and closes the pre-opened window when body is empty", () => {
    const target = makeFakeWindow();
    const failed = vi.fn();
    const result = openPrintWindow(
      { bodyHtml: "<div>no doc-print root</div>", onPrintFailed: failed },
      target,
    );
    expect(result).toBeNull();
    expect(failed).toHaveBeenCalledWith("printable_empty");
    expect((target.close as any)).toHaveBeenCalled();
  });
});

describe("printViaHiddenIframe blank guard", () => {
  it("refuses to open a hidden iframe when there is no #doc-print content", () => {
    const failed = vi.fn();
    const ok = printViaHiddenIframe({ bodyHtml: "<div>เนื้อหาไม่ครบ</div>", onPrintFailed: failed });
    expect(ok).toBe(false);
    expect(failed).toHaveBeenCalledWith("iframe_printable_empty");
  });
});

describe("printViaCurrentDocument copies", () => {
  it("dispatches a SINGLE window.print() for every requested copy (one OS dialog)", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    vi.spyOn(window, "focus").mockImplementation(() => {});
    const source = document.createElement("div");
    source.id = "doc-print";
    source.innerHTML = `<section class="doc-page">PRINT THREE COPIES</section>`;
    document.body.appendChild(source);

    const ok = await printViaCurrentDocument({ bodyHtml: "", sourceEl: source, paperSize: "A4", orient: "portrait", copies: 3 });
    expect(ok).toBe(true);
    // All 3 copies are expanded inline in the print host and dispatched via
    // ONE window.print() call — so the user sees a single OS print dialog
    // and cancelling it cancels the entire run (no phantom copy 2/3 dialogs).
    expect(printSpy).toHaveBeenCalledTimes(1);
    const host = document.getElementById("rds-direct-print-host")!;
    expect(host).toBeTruthy();
    // Copies expanded in DOM before print — 3 printable roots inside host.
    expect(host.querySelectorAll("[data-copy-index]").length).toBe(3);

    // afterprint → host cleanup runs. No further print dispatches.
    window.dispatchEvent(new Event("afterprint"));
    await vi.advanceTimersByTimeAsync(200);
    expect(document.getElementById("rds-direct-print-host")).toBeNull();
    vi.advanceTimersByTime(5_000);
    expect(printSpy).toHaveBeenCalledTimes(1);
    document.body.removeChild(source);
  });
});

describe("buildPrintHtml preserves every .doc-page and nonblank text", () => {
  it("keeps all pages and text intact", () => {
    const host = document.createElement("div");
    host.innerHTML =
      `<div id="doc-print">` +
      `<section class="doc-page">หน้าแรก</section>` +
      `<section class="doc-page">หน้าที่สอง</section>` +
      `<section class="doc-page">หน้าสุดท้าย</section>` +
      `</div>`;
    document.body.appendChild(host);
    const html = buildPrintHtml({ bodyHtml: "", sourceEl: host, paperSize: "A4", orient: "portrait" });
    expect(html).toContain("หน้าแรก");
    expect(html).toContain("หน้าที่สอง");
    expect(html).toContain("หน้าสุดท้าย");
    const diag = diagnosePrintHtml(html);
    expect(diag.pageCount).toBe(3);
    expect(diag.hasText).toBe(true);
    // A4 defaults propagate into @page
    expect(html).toMatch(/@page \{ size: A4 portrait/);
    document.body.removeChild(host);
  });
});