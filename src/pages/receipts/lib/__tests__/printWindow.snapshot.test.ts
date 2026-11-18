import { describe, it, expect } from "vitest";
import { buildPrintHtml, diagnosePrintHtml } from "../printWindow";

describe("snapshotInlineStyles (via buildPrintHtml sourceEl)", () => {
  it("produces visible markup even when sourceEl ancestor is display:none", () => {
    const host = document.createElement("div");
    host.className = "hidden";
    host.style.display = "none";
    host.style.position = "fixed";
    host.style.left = "-99999px";
    host.style.top = "0";
    host.style.height = "0";
    host.style.opacity = "0";
    host.innerHTML = `<div id="doc-print"><table><tbody><tr><td>HELLO-PRINT</td></tr></tbody></table></div>`;
    document.body.appendChild(host);

    const html = buildPrintHtml({ bodyHtml: "", sourceEl: host });

    // Root must not carry display:none after snapshot.
    const rootMatch = html.match(/<div class="hidden"[^>]*style="([^"]*)"/);
    expect(rootMatch, "root style attribute should be present").toBeTruthy();
    expect(rootMatch![1]).not.toMatch(/display\s*:\s*none/i);
    expect(rootMatch![1]).toMatch(/display\s*:\s*block/i);
    expect(rootMatch![1]).toMatch(/position\s*:\s*static/i);
    expect(rootMatch![1]).toMatch(/left\s*:\s*auto/i);
    expect(rootMatch![1]).toMatch(/height\s*:\s*auto/i);
    expect(rootMatch![1]).toMatch(/opacity\s*:\s*1/i);

    // Visible text must reach the print HTML.
    expect(html).toContain("HELLO-PRINT");

    // The live element's inline style should be restored (was display:none).
    expect(host.style.display).toBe("none");
    expect(host.style.position).toBe("fixed");
    expect(host.style.left).toBe("-99999px");

    document.body.removeChild(host);
  });

  it("does not let app print CSS hide popup body text", () => {
    const host = document.createElement("div");
    host.innerHTML = `<div id="doc-print"><h1>VISIBLE POPUP TEXT</h1><p>ลูกค้าทดสอบ</p></div>`;
    document.body.appendChild(host);

    const style = document.createElement("style");
    style.textContent = `@media print { body * { visibility: hidden; } }`;
    document.head.appendChild(style);

    const html = buildPrintHtml({ bodyHtml: "", sourceEl: host });
    expect(html).toContain("VISIBLE POPUP TEXT");
    expect(html).toContain("body, body * { visibility: visible !important; }");
    expect(html).toContain("#doc-print, #doc-print *");
    expect(html).toContain("opacity: 1 !important");

    document.head.removeChild(style);
    document.body.removeChild(host);
  });

  it("preserves discrete .doc-page sections and reports page count", () => {
    const host = document.createElement("div");
    host.innerHTML = `<div id="doc-print"><section class="doc-page">หน้า 1 เนื้อหา</section><section class="doc-page">หน้า 2 เนื้อหา</section></div>`;
    document.body.appendChild(host);

    const html = buildPrintHtml({ bodyHtml: host.innerHTML, paperSize: "210mm 297mm", orient: "portrait" });
    expect(html).toContain("@page { size: 210mm 297mm;");
    expect(html).toContain(".doc-page + .doc-page");
    expect(html).not.toContain("min-height: 0 !important");
    const diag = diagnosePrintHtml(html);
    expect(diag.hasDocPrint).toBe(true);
    expect(diag.hasText).toBe(true);
    expect(diag.pageCount).toBe(2);

    document.body.removeChild(host);
  });

  it("does not mutate source DOM while snapshotting hidden elements", () => {
    const host = document.createElement("div");
    host.style.display = "none";
    host.style.visibility = "hidden";
    host.innerHTML = `<div id="doc-print"><section class="doc-page">SOURCE-STAYS-HIDDEN</section></div>`;
    document.body.appendChild(host);

    buildPrintHtml({ bodyHtml: "", sourceEl: host });

    expect(host.style.display).toBe("none");
    expect(host.style.visibility).toBe("hidden");
    expect(host.textContent).toContain("SOURCE-STAYS-HIDDEN");
    document.body.removeChild(host);
  });
});