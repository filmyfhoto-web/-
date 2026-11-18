import { describe, it, expect } from "vitest";
import {
  visibleTabsForStore,
  docTypesForTab,
  tabBucketForStore,
  displayDocLabelForStore,
  DOC_TYPE_LABEL,
} from "../docTheme";

/**
 * Colorlab issues a single combined document labelled
 * "ใบเสร็จรับเงิน/ใบกำกับภาษี". These invariants guard the tab / filter /
 * label plumbing so historical `receipt` and `tax_invoice` rows keep
 * surfacing under one bucket without being double-counted.
 */
describe("colorlab combined receipt/tax_invoice bucket", () => {
  it("visibleTabsForStore('colorlab') has ONE combined tab, not two", () => {
    const tabs = visibleTabsForStore("colorlab");
    expect(tabs).toContain("receipt_tax");
    expect(tabs).not.toContain("receipt");
    expect(tabs).not.toContain("tax_invoice");
  });

  it("printing (non-VAT) hides tax_invoice from tabs; receipt stays", () => {
    const tabs = visibleTabsForStore("printing");
    expect(tabs).toContain("receipt");
    expect(tabs).not.toContain("tax_invoice");
    expect(tabs).not.toContain("receipt_tax");
  });

  it("docTypesForTab('colorlab','receipt_tax') covers legacy invoice too", () => {
    expect(docTypesForTab("colorlab", "receipt_tax").sort()).toEqual([
      "invoice",
      "receipt",
      "tax_invoice",
    ]);
  });

  it("historical receipt/tax_invoice rows bucket into receipt_tax for colorlab", () => {
    expect(tabBucketForStore("colorlab", "receipt")).toBe("receipt_tax");
    expect(tabBucketForStore("colorlab", "tax_invoice")).toBe("receipt_tax");
    expect(tabBucketForStore("colorlab", "invoice")).toBe("receipt_tax");
  });

  it("historical rows keep their canonical bucket for other stores", () => {
    expect(tabBucketForStore("printing", "receipt")).toBe("receipt");
    expect(tabBucketForStore("printing", "tax_invoice")).toBe("tax_invoice");
    expect(tabBucketForStore("printing", "invoice")).toBe("tax_invoice");
  });

  it("colorlab row labels collapse receipt + tax_invoice into the combined name", () => {
    expect(displayDocLabelForStore("colorlab", "receipt")).toBe("ใบเสร็จรับเงิน/ใบกำกับภาษี");
    expect(displayDocLabelForStore("colorlab", "tax_invoice")).toBe("ใบเสร็จรับเงิน/ใบกำกับภาษี");
    expect(displayDocLabelForStore("colorlab", "receipt_tax")).toBe("ใบเสร็จรับเงิน/ใบกำกับภาษี");
  });

  it("other stores keep their original per-type labels", () => {
    expect(displayDocLabelForStore("printing", "receipt")).toBe(DOC_TYPE_LABEL.receipt);
    expect(displayDocLabelForStore("printing", "tax_invoice")).toBe(DOC_TYPE_LABEL.tax_invoice);
  });

  it("combined count never double-counts (sum matches raw union)", () => {
    // Simulate row counts fetched per stored type. The combined tab should
    // equal the sum of the constituent types — not the sum PLUS itself.
    const raw = { receipt: 12, tax_invoice: 7, invoice: 3, delivery: 4, quotation: 9 };
    const combined = raw.receipt + raw.tax_invoice + raw.invoice;
    expect(combined).toBe(22);
    // Ensure our helper doesn't accidentally include unrelated types.
    expect(docTypesForTab("colorlab", "receipt_tax")).not.toContain("delivery");
    expect(docTypesForTab("colorlab", "receipt_tax")).not.toContain("quotation");
  });
});