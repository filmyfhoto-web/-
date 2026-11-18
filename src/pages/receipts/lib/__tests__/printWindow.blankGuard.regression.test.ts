import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { printViaHiddenIframe } from "../printWindow";

/**
 * Regression: the hidden iframe used to have `width:0;height:0`, which made
 * every `getBoundingClientRect()` inside it return 0×0 and the printable
 * preflight abort with "หน้าพิมพ์ว่าง" even though the document actually had
 * text + a #doc-print root. We now size the iframe like an A4 sheet and the
 * preflight tolerates 0-rect content when text/DOM exist.
 */

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("printViaHiddenIframe blank-guard regression", () => {
  it("hidden iframe is created with non-zero layout dimensions", () => {
    const before = document.querySelectorAll("iframe").length;
    const src = document.createElement("div");
    src.innerHTML = `<div id="doc-print"><section class="doc-page">
      <h1>ใบเสร็จรับเงิน</h1><p>ลูกค้าทดสอบ</p><table><tr><td>สินค้า</td><td>100</td></tr></table>
    </section></div>`;
    document.body.appendChild(src);
    const ok = printViaHiddenIframe({
      bodyHtml: "",
      sourceEl: src.firstElementChild as HTMLElement,
      paperSize: "A4",
      orient: "portrait",
    });
    expect(ok).toBe(true);
    const iframes = document.querySelectorAll("iframe");
    expect(iframes.length).toBe(before + 1);
    const iframe = iframes[iframes.length - 1] as HTMLIFrameElement;
    // Must NOT be 0×0 — otherwise getBoundingClientRect inside it is 0 and
    // the blank-guard would fire on real content.
    expect(iframe.style.width).not.toBe("0px");
    expect(iframe.style.height).not.toBe("0px");
    // Off-screen but sized like a page.
    expect(iframe.style.width).toMatch(/^\d{3,}px$/);
    expect(iframe.style.height).toMatch(/^\d{3,}px$/);
    expect(iframe.style.position).toBe("fixed");
    document.body.removeChild(src);
    iframe.parentNode?.removeChild(iframe);
  });
});