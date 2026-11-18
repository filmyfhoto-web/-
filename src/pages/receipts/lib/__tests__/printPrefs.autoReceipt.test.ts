import { describe, it, expect, beforeEach } from "vitest";
import {
  getPaperCssSize,
  getPaperSizeMm,
  loadTypePrintPrefs,
  saveTypePrintPrefs,
  clearTypePrintPrefs,
} from "../printPrefs";

describe("printPrefs — auto-receipt paper + per-type sticky prefs", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("auto-receipt maps to 190x270 mm CSS size", () => {
    expect(getPaperSizeMm("auto-receipt")).toEqual({ w: 190, h: 270 });
    expect(getPaperCssSize("auto-receipt")).toBe("190mm 270mm");
  });

  it("saves + reloads sticky prefs per document_type", () => {
    saveTypePrintPrefs("receipt", {
      paper: "auto-receipt",
      orient: "portrait",
      margins: { top: 12, right: 8, bottom: 12, left: 8 },
      customPaper: { widthMm: 190, heightMm: 270 },
    });
    const loaded = loadTypePrintPrefs("receipt");
    expect(loaded?.paper).toBe("auto-receipt");
    expect(loaded?.orient).toBe("portrait");
    expect(loaded?.margins).toEqual({ top: 12, right: 8, bottom: 12, left: 8 });
    expect(loaded?.customPaper).toEqual({ widthMm: 190, heightMm: 270 });
  });

  it("does not leak receipt prefs into other types", () => {
    saveTypePrintPrefs("receipt", { paper: "auto-receipt" });
    expect(loadTypePrintPrefs("quotation")).toBeNull();
    expect(loadTypePrintPrefs("delivery")).toBeNull();
  });

  it("clearTypePrintPrefs removes only the given type", () => {
    saveTypePrintPrefs("receipt", { paper: "auto-receipt" });
    saveTypePrintPrefs("quotation", { paper: "A5" });
    clearTypePrintPrefs("receipt");
    expect(loadTypePrintPrefs("receipt")).toBeNull();
    expect(loadTypePrintPrefs("quotation")?.paper).toBe("A5");
  });

  it("returns null for unknown/empty type", () => {
    expect(loadTypePrintPrefs("")).toBeNull();
    expect(loadTypePrintPrefs(null)).toBeNull();
    expect(loadTypePrintPrefs(undefined)).toBeNull();
  });
});