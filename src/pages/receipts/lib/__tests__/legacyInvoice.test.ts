import { describe, it, expect } from "vitest";
import {
  DOC_TYPE_LABEL,
  DOC_TYPE_ORDER,
  DEFAULT_DOC_THEME,
  getDocLabel,
  resolveDocTheme,
} from "../docTheme";

/**
 * Regression coverage: ใบแจ้งหนี้ (invoice) was removed from the create
 * flow but historical rows must still render everywhere — list pages,
 * dashboards, theme color resolution, label lookups.
 */
describe("legacy invoice document type", () => {
  it("getDocLabel returns the deprecated Thai label", () => {
    expect(getDocLabel("invoice")).toBe("ใบแจ้งหนี้ (เลิกใช้)");
  });

  it("getDocLabel falls back to the raw string for unknown legacy types", () => {
    expect(getDocLabel("custom_legacy_type")).toBe("custom_legacy_type");
    expect(getDocLabel(null)).toBe("เอกสาร");
    expect(getDocLabel(undefined)).toBe("เอกสาร");
  });

  it("DOC_TYPE_LABEL still has the invoice entry for legacy renderers", () => {
    expect(DOC_TYPE_LABEL.invoice).toMatch(/ใบแจ้งหนี้/);
  });

  it("DOC_TYPE_ORDER no longer includes invoice (hidden from create flows)", () => {
    expect((DOC_TYPE_ORDER as readonly string[]).includes("invoice")).toBe(false);
  });

  it("resolveDocTheme returns a non-empty color for legacy invoice rows", () => {
    const theme = resolveDocTheme("invoice", null);
    expect(theme.title).toBeTruthy();
    expect(theme.header).toBeTruthy();
    expect(DEFAULT_DOC_THEME.invoice.title).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("resolveDocTheme returns safe fallback for any unknown legacy type", () => {
    const theme = resolveDocTheme("nonexistent_type", null);
    // Should not throw; empty strings are acceptable as the renderer falls
    // back to its own neutral default.
    expect(typeof theme.title).toBe("string");
    expect(typeof theme.header).toBe("string");
  });

  it("filtering a list containing legacy invoice rows does not throw", () => {
    const rows = [
      { id: "1", document_type: "invoice", document_no: "INV-2024-0001" },
      { id: "2", document_type: "quotation", document_no: "QT-2026-0001" },
      { id: "3", document_type: "delivery", document_no: "DN-2026-0001" },
    ];
    const labelled = rows.map((r) => ({ ...r, label: getDocLabel(r.document_type) }));
    expect(labelled[0].label).toContain("ใบแจ้งหนี้");
    expect(labelled.every((r) => typeof r.label === "string" && r.label.length > 0)).toBe(true);
  });
});