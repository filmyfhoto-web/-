import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { printViaCurrentDocument } from "../printWindow";
import { printQueue } from "../printQueue";

function makeDocPrint(html: string) {
  const root = document.createElement("div");
  root.id = "doc-print";
  root.setAttribute("data-doc-print", "true");
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

function stubFastReadiness() {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
    cb(performance.now());
    return 1;
  });
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
  vi.spyOn(window, "focus").mockImplementation(() => {});
}

beforeEach(() => {
  document.body.innerHTML = `<div id="app-root">APP SHOULD HIDE ONLY WHILE PRINTING</div>`;
  stubFastReadiness();
  printQueue.reset();
});

afterEach(() => {
  document.body.innerHTML = "";
  printQueue.reset();
  vi.restoreAllMocks();
});

describe("printViaCurrentDocument", () => {
  it("prints from the current window and never opens an about:blank popup", async () => {
    const source = makeDocPrint(`<section class="doc-page"><h1>ใบเสร็จรับเงิน</h1><p>ลูกค้าทดสอบครบถ้วน</p></section>`);
    const openSpy = vi.spyOn(window, "open");
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});

    const ok = await printViaCurrentDocument({ sourceEl: source, bodyHtml: "", paperSize: "A4", orient: "portrait" });

    expect(ok).toBe(true);
    expect(openSpy).not.toHaveBeenCalled();
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it("creates a nonblank direct host with all .doc-page nodes before window.print", async () => {
    const source = makeDocPrint([
      `<section class="doc-page"><h1>หน้าแรก</h1><p>ข้อความเอกสารหน้าแรกยาวพอ</p></section>`,
      `<section class="doc-page"><h1>หน้าสอง</h1><p>ข้อความเอกสารหน้าสองยาวพอ</p><img alt="logo" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" /></section>`,
    ].join(""));
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {
      const host = document.getElementById("rds-direct-print-host")!;
      const directRoot = host.querySelector("#doc-print-direct") as HTMLElement;
      expect(directRoot).toBeTruthy();
      expect(directRoot.getAttribute("data-doc-print")).toBe("true");
      expect(host.textContent).toContain("หน้าแรก");
      expect(host.textContent).toContain("หน้าสอง");
      expect(host.querySelectorAll(".doc-page")).toHaveLength(2);
      expect(host.querySelectorAll("img")).toHaveLength(1);
    });

    await expect(printViaCurrentDocument({ sourceEl: source, bodyHtml: "", paperSize: "A4", orient: "portrait" })).resolves.toBe(true);
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps every selected document when the source is a multi-document print area", async () => {
    const source = document.createElement("div");
    source.id = "documents-print-area";
    source.innerHTML = [
      `<div class="doc-print-document" data-doc-id="a"><div id="doc-print" data-doc-print="true"><section class="doc-page"><h1>เอกสาร A</h1><p>ข้อความเอกสารแรกครบถ้วน</p></section></div></div>`,
      `<div class="doc-print-document" data-doc-id="b"><div id="doc-print" data-doc-print="true"><section class="doc-page"><h1>เอกสาร B</h1><p>ข้อความเอกสารที่สองครบถ้วน</p></section></div></div>`,
    ].join("");
    document.body.appendChild(source);
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {
      const host = document.getElementById("rds-direct-print-host")!;
      expect(host.querySelectorAll(".doc-print-document")).toHaveLength(2);
      expect(host.textContent).toContain("เอกสาร A");
      expect(host.textContent).toContain("เอกสาร B");
      expect(host.querySelectorAll(".doc-page")).toHaveLength(2);
    });

    await expect(printViaCurrentDocument({ sourceEl: source, bodyHtml: "", paperSize: "A4", orient: "portrait" })).resolves.toBe(true);
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it("locks every printed page to the same physical A4 box and inlines every requested copy into a single window.print() call", async () => {
    const source = makeDocPrint([
      `<section class="doc-page" style="width:210mm;min-height:297mm;height:auto;margin-top:0;padding:10mm 10mm 17mm 10mm"><h1>หน้าแรก</h1><p>ข้อความเอกสารหน้าแรกยาวพอ</p></section>`,
      `<div class="doc-page-divider no-print" style="height:80px;margin:24px 0">— หน้า 2 —</div>`,
      `<section class="doc-page" style="width:210mm;min-height:297mm;height:auto;margin-top:16mm;padding:10mm 10mm 17mm 10mm"><h1>หน้าสอง</h1><p>ข้อความเอกสารหน้าสองยาวพอ</p></section>`,
    ].join(""));
    const snapshots: Array<Array<Record<string, string | null>>> = [];
    vi.spyOn(window, "print").mockImplementation(() => {
      const pages = Array.from(document.querySelectorAll<HTMLElement>("#rds-direct-print-host .doc-page"));
      snapshots.push(pages.map((el) => ({
        idx: el.getAttribute("data-print-page-idx"),
        total: el.getAttribute("data-print-page-total"),
        width: el.style.getPropertyValue("width"),
        height: el.style.getPropertyValue("height"),
        minHeight: el.style.getPropertyValue("min-height"),
        maxHeight: el.style.getPropertyValue("max-height"),
        padding: el.style.getPropertyValue("padding"),
        marginTop: el.style.getPropertyValue("margin-top"),
        overflow: el.style.getPropertyValue("overflow"),
        breakBefore: el.style.getPropertyValue("break-before"),
      })));
    });

    await printViaCurrentDocument({ sourceEl: source, bodyHtml: "", paperSize: "210mm 297mm", orient: "portrait", copies: 2, margins: { top: 10, right: 10, bottom: 17, left: 10 } });
    // Multi-copy inlines all N copies into ONE print dispatch (single OS
    // dialog), so window.print() is called exactly once and every page
    // across every copy is locked identically.
    expect(snapshots).toHaveLength(1);
    const pages = snapshots[0];
    // 2 pages per copy × 2 copies = 4 pages inside one print run.
    expect(pages).toHaveLength(4);
    pages.forEach((p, i) => {
      expect(p.idx).toBe(String(i + 1));
      expect(p.total).toBe("4");
      expect(p.width).toBe("210mm");
      expect(p.height).toBe("297mm");
      expect(p.minHeight).toBe("297mm");
      expect(p.maxHeight).toBe("297mm");
      expect(p.padding).toBe("10mm 10mm 17mm 10mm");
      expect(p.marginTop).toBe("0mm");
      expect(p.overflow).toBe("hidden");
      expect(p.breakBefore).toBe(i === 0 ? "auto" : "page");
    });

    // A single afterprint tears down the host — no phantom second dialog.
    window.dispatchEvent(new Event("afterprint"));
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    expect(document.getElementById("rds-direct-print-host")).toBeNull();
    const divider = document.querySelector<HTMLElement>("#rds-direct-print-host .doc-page-divider");
    // Host is cleaned up so the divider query returns null.
    expect(divider).toBeNull();
  });

  it("calls window.print synchronously even if fonts/assets readiness never resolves", async () => {
    const source = makeDocPrint(`<section class="doc-page"><h1>ใบเสร็จรับเงิน</h1><p>ทดสอบการพิมพ์ทันทีไม่รอ promise</p></section>`);
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: new Promise(() => undefined) },
    });
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {
      expect(document.getElementById("rds-direct-print-host")).toBeTruthy();
      expect(document.getElementById("rds-direct-print-style")).toBeTruthy();
    });

    const result = printViaCurrentDocument({ sourceEl: source, bodyHtml: "", paperSize: "A4", orient: "portrait" });

    expect(printSpy).toHaveBeenCalledTimes(1);
    await expect(result).resolves.toBe(true);
  });

  it("injects A4 portrait margin-0 page CSS and print-only visibility rules", async () => {
    const source = makeDocPrint(`<section class="doc-page"><h1>ใบเสร็จรับเงิน</h1><p>มีข้อความสำหรับพิมพ์</p></section>`);
    vi.spyOn(window, "print").mockImplementation(() => {});

    await printViaCurrentDocument({ sourceEl: source, bodyHtml: "", paperSize: "A4", orient: "portrait" });

    const css = document.getElementById("rds-direct-print-style")?.textContent ?? "";
    expect(css).toContain("@page { size: A4 portrait; margin: 0; }");
    expect(css).toContain("body > *:not(#rds-direct-print-host) { display: none !important; }");
    expect(css).toContain("#rds-direct-print-host {");
    expect(css).toContain("visibility: visible !important");
    expect(css).toContain("#rds-direct-print-host .doc-page");
    expect(css).toContain("width: 210mm !important");
    expect(css).toContain("min-height: 297mm !important");
  });

  it("beats global POS print CSS that hides body children except #print-root", async () => {
    const source = makeDocPrint(`<section class="doc-page"><h1>ใบเสร็จรับเงิน</h1><p>ทดสอบ CSS ชนกัน</p></section>`);
    vi.spyOn(window, "print").mockImplementation(() => {});
    await printViaCurrentDocument({ sourceEl: source, bodyHtml: "", paperSize: "A4", orient: "portrait" });

    const css = document.getElementById("rds-direct-print-style")?.textContent ?? "";
    expect(css).toContain("body > #rds-direct-print-host#rds-direct-print-host");
    expect(css).toMatch(/#rds-direct-print-host#rds-direct-print-host[\s\S]{0,120}display:\s*block\s*!important/);
  });

  it("does NOT hide the cloned root/children in on-screen CSS (blank-print bug guard)", async () => {
    const source = makeDocPrint(`<section class="doc-page"><h1>ใบเสร็จรับเงิน</h1><p>ทดสอบ</p></section>`);
    vi.spyOn(window, "print").mockImplementation(() => {});
    await printViaCurrentDocument({ sourceEl: source, bodyHtml: "", paperSize: "A4", orient: "portrait" });
    const css = document.getElementById("rds-direct-print-style")?.textContent ?? "";
    // Split out the on-screen block (before @media print).
    const mediaIdx = css.indexOf("@media print");
    const onScreen = css.slice(0, mediaIdx);
    const inPrint = css.slice(mediaIdx);
    // On-screen: the direct clone MUST NOT have visibility:hidden — only
    // the host is hidden. Otherwise Chrome keeps the clone invisible during
    // print because the same-specificity "visible" rule in @media print
    // cannot override it.
    const cloneRuleOnScreen = onScreen.slice(
      onScreen.indexOf("#rds-direct-print-host #doc-print-direct"),
    );
    expect(cloneRuleOnScreen).not.toMatch(/visibility:\s*hidden/);
    // In @media print: the clone AND its descendants must be visible with
    // specificity >= the "body * { visibility: hidden }" style, which we
    // guarantee via #rds-direct-print-host <selector>.
    expect(inPrint).toMatch(/#rds-direct-print-host #doc-print-direct[\s\S]{0,400}visibility:\s*visible/);
    expect(inPrint).toMatch(/#rds-direct-print-host #doc-print-direct \*[\s\S]{0,200}visibility:\s*visible/);
  });

  it("marks dispatched before window.print so a sync afterprint still fires success callback", async () => {
    const source = makeDocPrint(`<section class="doc-page"><h1>ใบเสร็จรับเงิน</h1><p>ทดสอบเนื้อหา</p></section>`);
    const after = vi.fn();
    // Simulate Chrome variants that dispatch afterprint synchronously
    // inside window.print(). If dispatched=false at that moment, cleanup
    // would skip onAfterPrint and the success modal would never show.
    vi.spyOn(window, "print").mockImplementation(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
    await printViaCurrentDocument({ sourceEl: source, bodyHtml: "", paperSize: "A4", orient: "portrait", onAfterPrint: after });
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("keeps host/style until afterprint, then cleans up", async () => {
    const source = makeDocPrint(`<section class="doc-page"><h1>ใบเสร็จรับเงิน</h1><p>มีข้อความสำหรับพิมพ์</p></section>`);
    const after = vi.fn();
    vi.spyOn(window, "print").mockImplementation(() => {});

    await printViaCurrentDocument({ sourceEl: source, bodyHtml: "", paperSize: "A4", orient: "portrait", onAfterPrint: after });

    expect(document.getElementById("rds-direct-print-host")).toBeTruthy();
    expect(document.getElementById("rds-direct-print-style")).toBeTruthy();
    expect(after).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("afterprint"));

    expect(document.getElementById("rds-direct-print-host")).toBeNull();
    expect(document.getElementById("rds-direct-print-style")).toBeNull();
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("does not treat an image-only document as blank", async () => {
    const source = makeDocPrint(`<section class="doc-page"><img alt="เอกสารแนบ" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" /></section>`);
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    const failed = vi.fn();

    const ok = await printViaCurrentDocument({ sourceEl: source, bodyHtml: "", paperSize: "A4", orient: "portrait", onPrintFailed: failed });

    expect(ok).toBe(true);
    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(failed).not.toHaveBeenCalled();
  });
});