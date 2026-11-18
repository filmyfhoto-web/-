import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_POS_SETTINGS,
  computeVat,
  formatBaht,
  loadPosSettings,
  loadReceiptPaper,
  paperBodyWidth,
  paperPageCss,
  savePosSettings,
  saveReceiptPaper,
} from "../receiptPrefs";

describe("receiptPrefs", () => {
  beforeEach(() => localStorage.clear());

  it("falls back to defaults when nothing is stored", () => {
    expect(loadPosSettings()).toEqual(DEFAULT_POS_SETTINGS);
  });

  it("merges legacy settings that predate the store-info fields", () => {
    localStorage.setItem("pos.settings.v1", JSON.stringify({ paperSize: "58mm", copies: 9 }));
    const p = loadPosSettings();
    expect(p.paperSize).toBe("58mm");
    expect(p.copies).toBe(5); // clamped
    expect(p.storeName).toBe("");
  });

  it("ignores an invalid stored paper size", () => {
    localStorage.setItem("pos.settings.v1", JSON.stringify({ paperSize: "letter" }));
    expect(loadPosSettings().paperSize).toBe("80mm");
  });

  it("remembers the last paper per branch and falls back to default", () => {
    saveReceiptPaper("58mm", "branch-a");
    expect(loadReceiptPaper("branch-a")).toBe("58mm");
    expect(loadReceiptPaper("branch-b")).toBe("58mm"); // default mirror
    saveReceiptPaper("A4", "branch-b");
    expect(loadReceiptPaper("branch-a")).toBe("58mm");
    expect(loadReceiptPaper("branch-b")).toBe("A4");
  });

  it("uses the settings paper when no print has happened yet", () => {
    savePosSettings({ ...DEFAULT_POS_SETTINGS, paperSize: "A4" });
    expect(loadReceiptPaper()).toBe("A4");
  });

  it("emits paper-specific @page rules and widths", () => {
    expect(paperPageCss("58mm")).toContain("58mm auto");
    expect(paperPageCss("80mm")).toContain("80mm auto");
    expect(paperPageCss("A4")).toContain("A4 portrait");
    expect(paperBodyWidth("58mm")).toBe("54mm");
    expect(paperBodyWidth("A4")).toBe("186mm");
  });

  it("does not show VAT when disabled", () => {
    const v = computeVat(107, { vatEnabled: false, vatRate: 7, vatIncluded: true });
    expect(v.enabled).toBe(false);
    expect(v.vat).toBe(0);
    expect(v.total).toBe(107);
  });

  it("extracts VAT so base + vat always equals the charged total", () => {
    const v = computeVat(107, { vatEnabled: true, vatRate: 7, vatIncluded: true });
    expect(v.base).toBe(100);
    expect(v.vat).toBe(7);
    expect(v.base + v.vat).toBeCloseTo(v.total, 2);
  });

  it("never changes the charged total for VAT-exclusive shops", () => {
    const v = computeVat(250, { vatEnabled: true, vatRate: 7, vatIncluded: false });
    expect(v.total).toBe(250);
    expect(v.base + v.vat).toBeCloseTo(250, 2);
  });

  it("formats baht with two decimals", () => {
    expect(formatBaht(1234.5)).toBe("1,234.50");
    expect(formatBaht(0)).toBe("0.00");
  });
});