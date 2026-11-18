import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regression guard for the print UX contract:
 * - Row Eye + Printer buttons (both desktop icon-only and mobile card
 *   layouts) must route to `/documents/:id/print-preview?settings=1`.
 * - No row-level button may invoke `printIdsNow` directly — that would
 *   bypass the pre-print settings panel the user requested.
 * - Tooltips must use the new plain-language labels.
 *
 * Bulk print (`printIdsNow` from the top-level bulk toolbar) is exempt.
 */

const SOURCE = readFileSync(
  resolve(__dirname, "..", "DocumentsList.tsx"),
  "utf8",
);

describe("DocumentsList row action contract", () => {
  it("routes row Eye click through openPreview→print-preview?settings=1", () => {
    expect(SOURCE).toMatch(/openPreview[\s\S]{0,400}print-preview\?settings=1/);
    // openPreview must not open the in-page Dialog anymore.
    expect(SOURCE).not.toMatch(/async function openPreview[\s\S]{0,200}setPreviewDoc\(/);
  });

  it("row Printer buttons navigate to print-preview instead of printing directly", () => {
    // goPrintPreview helper exists and points at the settings=1 route.
    expect(SOURCE).toMatch(/function goPrintPreview[\s\S]{0,200}print-preview\?settings=1/);

    // Neither row-level Printer button should call printIdsNow inline.
    const rowPrintBlocks = SOURCE.match(/onClick=\{\(\) => \{\s*if \(isBlockedDelivery\(r\)\) return;\s*[^}]+\}\}/g) ?? [];
    expect(rowPrintBlocks.length).toBeGreaterThanOrEqual(2);
    for (const block of rowPrintBlocks) {
      expect(block).not.toMatch(/printIdsNow\(\[r\.id\]/);
      expect(block).toMatch(/goPrintPreview\(r\)/);
    }
  });

  it("dropdown ‘พิมพ์ทันที’ is relabeled and routes to print-preview", () => {
    expect(SOURCE).not.toMatch(/พิมพ์ทันที/);
    expect(SOURCE).toMatch(/ตั้งค่าและพิมพ์/);
  });

  it("uses the new plain-language tooltips", () => {
    expect(SOURCE).toMatch(/title="ดูตัวอย่าง A4"/);
    expect(SOURCE).toMatch(/ตั้งค่าและพิมพ์ A4/);
  });

  it("preserves bulk print (printIdsNow) for the top toolbar", () => {
    // Bulk print buttons still exist — the whole flow isn't gutted.
    expect(SOURCE).toMatch(/printIdsNow\(ids, "combined"/);
    expect(SOURCE).toMatch(/printIdsNow\(ids, "each"/);
  });
});
