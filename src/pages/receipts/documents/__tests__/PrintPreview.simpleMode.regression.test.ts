import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Simple-mode ("?settings=1", entered from the documents list) UX contract:
 *   - Settings panel opens by default.
 *   - Primary paper is locked to A4 210×297 portrait — saved A5/Letter/etc.
 *     is migrated back to A4 on entry so the preview never renders a
 *     narrow/skewed sheet.
 *   - Advanced controls (paper size select, orientation, custom paper,
 *     column visibility, bundle picker, per-side margins) are hidden
 *     behind a collapsible "ตั้งค่าเพิ่มเติม" that starts closed.
 *   - Print button reads "พิมพ์ A4" and shows "กำลังเตรียมพิมพ์…" when busy.
 *   - Reset restores A4 portrait.
 *   - Back button returns to the documents list, never to the edit form.
 *   - Preflight: empty preview surfaces a toast, no blank popup.
 *   - PrintPreview prints from the current document first; it must never open
 *     an about:blank popup or call openPrintWindow/manualPrintToolbar.
 */

const SOURCE = readFileSync(
  resolve(__dirname, "..", "PrintPreview.tsx"),
  "utf8",
);

describe("PrintPreview simple-mode contract", () => {
  it("reads ?settings=1 from the URL and treats it as simpleMode", () => {
    expect(SOURCE).toMatch(/useSearchParams/);
    expect(SOURCE).toMatch(/searchParams\.get\("settings"\) === "1"/);
  });

  it("panel is open by default", () => {
    expect(SOURCE).toMatch(/useState\(true\);[\s\S]{0,200}advancedOpen/);
  });

  it("advanced panel starts collapsed", () => {
    expect(SOURCE).toMatch(/advancedOpen[\s\S]{0,80}useState\(false\)/);
  });

  it("migrates non-A4 saved prefs to A4 portrait in simple mode", () => {
    expect(SOURCE).toMatch(/if \(simpleMode\)[\s\S]{0,120}paper = "A4"[\s\S]{0,40}orient = "portrait"/);
  });

  it("simple mode forces fit-page preview even when saved previewZoom was 100%", () => {
    expect(SOURCE).toMatch(/if \(simpleMode\)[\s\S]{0,180}next\.previewZoom = null/);
  });

  it("shows the A4 header badge and hides paper/orient controls in simple mode", () => {
    expect(SOURCE).toMatch(/กระดาษหลัก: A4 \(210 × 297 มม\.\)/);
    expect(SOURCE).toMatch(/data-testid="pp-advanced-toggle"/);
    expect(SOURCE).toMatch(/data-testid="pp-advanced-panel"/);
  });

  it("primary print button shows A4 label and a busy state", () => {
    expect(SOURCE).toMatch(/พิมพ์ A4/);
    expect(SOURCE).toMatch(/กำลังเตรียมพิมพ์…/);
  });

  it("Reset restores A4 portrait", () => {
    expect(SOURCE).toMatch(/รีเซ็ตค่าเริ่มต้น \(A4\)/);
    expect(SOURCE).toMatch(/paper: "A4",\s*orient: "portrait"/);
  });

  it("Back button routes to the documents list, not the edit form", () => {
    expect(SOURCE).toMatch(/backToDoc[\s\S]{0,300}\/documents`\)/);
    expect(SOURCE).not.toMatch(/backToDoc[\s\S]{0,200}\/edit`\)/);
  });

  it("doPrint preflights content and uses current-document print without opening any popup", () => {
    const doPrint = SOURCE.slice(SOURCE.indexOf("async function doPrint"), SOURCE.indexOf("async function doPdf"));
    const preflightIdx = doPrint.indexOf("ยังไม่มีเนื้อหาให้พิมพ์");
    expect(preflightIdx).toBeGreaterThan(0);
    expect(doPrint).toContain("printViaCurrentDocument");
    expect(doPrint).toContain("printViaHiddenIframe");
    expect(doPrint).not.toContain("window.open");
    expect(doPrint).not.toContain("openPrintWindow");
    expect(doPrint).not.toContain("manualPrintToolbar");
    expect(SOURCE).toMatch(/import \{ printViaCurrentDocument, printViaHiddenIframe \}/);
  });

  it("fit page centers only in fit mode; explicit 100% starts left for horizontal scroll", () => {
    expect(SOURCE).toMatch(/data-testid="pp-paper-shell"/);
    expect(SOURCE).toMatch(/className="w-full min-w-0"/);
    expect(SOURCE).toMatch(/overflowX: effectiveZoom == null \? "hidden" : "auto"/);
    expect(SOURCE).toMatch(/margin: effectiveZoom == null \? "0 auto" : "0 0 0 0"/);
  });

  it("exposes margin presets (ปกติ/แคบ/กว้าง) in simple mode", () => {
    expect(SOURCE).toMatch(/pp-margin-presets/);
    expect(SOURCE).toMatch(/pp-margin-preset-\$\{p\.key\}/);
    expect(SOURCE).toMatch(/key: "normal"[\s\S]{0,80}key: "narrow"[\s\S]{0,80}key: "wide"/);
  });
});
