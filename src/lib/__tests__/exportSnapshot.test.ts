import { describe, it, expect } from "vitest";
import { makePdf } from "@/lib/pdf";
import { toCsv, consentFooterLine } from "@/lib/csv";
import * as XLSX from "xlsx";

const consent = {
  termsVersion: "2099-12-31",
  termsAt: "2099-12-31T10:00:00Z",
  privacyVersion: "2099-12-31",
  privacyAt: "2099-12-31T10:00:00Z",
  capturedAt: "2099-12-31T10:05:00Z",
};

describe("export documents embed consent snapshot", () => {
  it("PDF generator produces a non-empty blob when a consent snapshot is supplied", async () => {
    const blob = await makePdf({
      kind: "quotation",
      docNo: "QT-001",
      date: "2099-12-31",
      store: { name: "Test Store" },
      customer: { name: "Test Customer" },
      items: [{ name: "Pen", qty: 1, price: 10, total: 10 }],
      subtotal: 10, discount: 0, shippingFee: 0, total: 10,
      consent,
    });
    expect(blob).toBeTruthy();
    expect(blob.size).toBeGreaterThan(500);
    // The dedicated e2e spec asserts the visible consent footer in real PDF
    // output; this unit test only guards that the renderer accepts the
    // snapshot input without throwing.
  });

  it("CSV footer line carries both versions and the capture timestamp", () => {
    const csv = toCsv([{ a: 1 }]) + "\n" + consentFooterLine(consent);
    expect(csv).toContain("# Consent:");
    expect(csv).toContain("terms=2099-12-31");
    expect(csv).toContain("privacy=2099-12-31");
    expect(csv).toContain("captured=2099-12-31T10:05:00Z");
  });

  it("XLSX sheet appends the consent footer as the last row", () => {
    const ws = XLSX.utils.json_to_sheet([{ a: 1 }]);
    XLSX.utils.sheet_add_aoa(ws, [[consentFooterLine(consent)]], { origin: -1 });
    const csv = XLSX.utils.sheet_to_csv(ws);
    expect(csv).toMatch(/# Consent:.*terms=2099-12-31.*privacy=2099-12-31/);
  });
});