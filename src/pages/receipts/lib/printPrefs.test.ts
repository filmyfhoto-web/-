import { describe, it, expect, beforeEach } from "vitest";
import {
  loadPrintPrefs, savePrintPrefs, clearPrintPrefs, resolveInitialPrefs,
  DEFAULT_PRINT_PREFS, DEFAULT_MARGINS,
} from "./printPrefs";

describe("printPrefs", () => {
  beforeEach(() => {
    clearPrintPrefs();
  });

  it("returns defaults when storage is empty", () => {
    expect(loadPrintPrefs()).toEqual(DEFAULT_PRINT_PREFS);
  });

  it("round-trips a saved value", () => {
    savePrintPrefs({
      fontScale: 0.85, fontScope: "all", paper: "A5",
      customPaper: { widthMm: 210, heightMm: 297 },
      orient: "landscape", copies: 3, pageRange: "1,3",
      rememberSettings: true,
      margins: { top: 5, right: 8, bottom: 5, left: 8 },
      headerOnce: false,
      printMode: "auto",
      previewZoom: null,
      columnVisibility: {},
    });
    expect(loadPrintPrefs()).toEqual({
      fontScale: 0.85, fontScope: "all", paper: "A5",
      customPaper: { widthMm: 210, heightMm: 297 },
      orient: "landscape", copies: 3, pageRange: "1,3",
      rememberSettings: true,
      margins: { top: 5, right: 8, bottom: 5, left: 8 },
      headerOnce: false,
      printMode: "auto",
      previewZoom: null,
      columnVisibility: {},
    });
  });

  it("clamps margins to 0-30mm range", () => {
    savePrintPrefs({ ...DEFAULT_PRINT_PREFS, margins: { top: -5, right: 99, bottom: 12, left: 0 } });
    const out = loadPrintPrefs();
    expect(out.margins.top).toBe(0);
    expect(out.margins.right).toBe(30);
    expect(out.margins.bottom).toBe(12);
    expect(out.margins.left).toBe(0);
  });

  it("defaults headerOnce to true and margins to 10mm", () => {
    expect(DEFAULT_PRINT_PREFS.headerOnce).toBe(true);
    expect(DEFAULT_PRINT_PREFS.margins).toEqual(DEFAULT_MARGINS);
  });

  it("clamps out-of-range values", () => {
    savePrintPrefs({
      ...DEFAULT_PRINT_PREFS,
      fontScale: 9.99, copies: 999, rememberSettings: true,
    });
    const out = loadPrintPrefs();
    expect(out.fontScale).toBeLessThanOrEqual(1.3);
    expect(out.copies).toBeLessThanOrEqual(10);
  });

  it("ignores malformed JSON", () => {
    localStorage.setItem("rds_print_prefs_v2", "{not json");
    expect(loadPrintPrefs()).toEqual(DEFAULT_PRINT_PREFS);
  });

  it("resolveInitialPrefs: per-doc override wins over storage", () => {
    savePrintPrefs({ ...DEFAULT_PRINT_PREFS, paper: "A5", fontScale: 0.8 });
    const out = resolveInitialPrefs({ fontScale: 1.2 });
    expect(out.fontScale).toBe(1.2);   // override
    expect(out.paper).toBe("A5");      // from storage
  });
});