import { describe, it, expect, beforeEach } from "vitest";
import {
  loadPrintPrefs,
  savePrintPrefs,
  clearPrintPrefs,
  resolveInitialPrefs,
  DEFAULT_PRINT_PREFS,
  type PaperSize,
} from "../printPrefs";

describe("printPrefs: extended paper sizes + preview zoom + columnVisibility", () => {
  beforeEach(() => {
    clearPrintPrefs();
  });

  const PAPERS: PaperSize[] = ["A4", "A5", "Letter", "Legal", "80mm", "custom"];

  it.each(PAPERS)("round-trips paper size %s", (paper) => {
    savePrintPrefs({ ...DEFAULT_PRINT_PREFS, paper });
    expect(loadPrintPrefs().paper).toBe(paper);
  });

  it("falls back to A4 for unknown paper", () => {
    savePrintPrefs({ ...DEFAULT_PRINT_PREFS, paper: "Tabloid" as any });
    expect(loadPrintPrefs().paper).toBe("A4");
  });

  it("clamps and persists custom paper dimensions", () => {
    savePrintPrefs({ ...DEFAULT_PRINT_PREFS, paper: "custom", customPaper: { widthMm: 999, heightMm: 10 } });
    const loaded = loadPrintPrefs();
    expect(loaded.paper).toBe("custom");
    expect(loaded.customPaper).toEqual({ widthMm: 500, heightMm: 50 });
  });

  it("clamps and persists previewZoom", () => {
    savePrintPrefs({ ...DEFAULT_PRINT_PREFS, previewZoom: 999 });
    expect(loadPrintPrefs().previewZoom).toBe(3);
    savePrintPrefs({ ...DEFAULT_PRINT_PREFS, previewZoom: 0.01 });
    expect(loadPrintPrefs().previewZoom).toBe(0.25);
    savePrintPrefs({ ...DEFAULT_PRINT_PREFS, previewZoom: null });
    expect(loadPrintPrefs().previewZoom).toBeNull();
  });

  it("preserves columnVisibility across save/load", () => {
    savePrintPrefs({
      ...DEFAULT_PRINT_PREFS,
      columnVisibility: { "receipt:qty": false, "receipt:unit": true },
    });
    const loaded = loadPrintPrefs();
    expect(loaded.columnVisibility["receipt:qty"]).toBe(false);
    expect(loaded.columnVisibility["receipt:unit"]).toBe(true);
  });

  it("resolveInitialPrefs merges columnVisibility from stored + override", () => {
    savePrintPrefs({
      ...DEFAULT_PRINT_PREFS,
      columnVisibility: { "receipt:qty": false },
    });
    const merged = resolveInitialPrefs({
      columnVisibility: { "receipt:unit": false },
    });
    expect(merged.columnVisibility["receipt:qty"]).toBe(false);
    expect(merged.columnVisibility["receipt:unit"]).toBe(false);
  });

  it("default columnVisibility is empty (all columns visible)", () => {
    expect(loadPrintPrefs().columnVisibility).toEqual({});
  });
});