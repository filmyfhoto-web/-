import { describe, it, expect } from "vitest";
import { buildDocFilename, buildBundleFilename } from "@/pages/receipts/lib/docFilename";
describe("docFilename", () => {
  it("names single doc", () => {
    expect(buildDocFilename({ document_type: "quotation", document_no: "QT-2026-0001", document_date: "2026-08-13", customer_name: "โรงเรียน/ทดสอบ" }))
      .toBe("QT_QT-2026-0001_2026-08-13_โรงเรียน ทดสอบ.pdf");
  });
  it("names bundle", () => {
    expect(buildBundleFilename([{ document_type: "delivery" }, { document_type: "delivery" }], "pdf")).toMatch(/^DO_\d{4}-\d\d-\d\d_2ฉบับ\.pdf$/);
  });
});
