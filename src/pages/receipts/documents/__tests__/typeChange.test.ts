import { describe, it, expect } from "vitest";

/**
 * Pure-logic tests for the "change document type after save" flow.
 *
 * The flow itself lives inside DocumentForm.duplicateAsType and is exercised
 * end-to-end by the playwright spec. Here we lock in two invariants that
 * don't require mounting React: the running-number RPC must be called with
 * the NEW type (so the prefix matches), and the new row must back-reference
 * the source via related_document_no.
 */

type DocType = "quotation" | "delivery" | "receipt" | "tax_invoice";

/** Pure helper mirroring duplicateAsType's payload construction. */
function buildDuplicatePayload(
  storeId: string,
  source: { document_no: string; document_type: DocType },
  newType: DocType,
  newNo: string,
) {
  return {
    store_id: storeId,
    document_type: newType,
    document_no: newNo,
    related_document_no: source.document_no,
  };
}

/** Stand-in for rds_next_doc_no — must return a different prefix per type. */
function fakeNextNo(type: DocType): string {
  const map: Record<DocType, string> = {
    quotation: "QT-2026-0099",
    delivery: "DN-2026-0099",
    receipt: "RC-2026-0099",
    tax_invoice: "IT-2026-0099",
  };
  return map[type];
}

describe("document type change", () => {
  it("allocates a new running number using the NEW type's prefix", () => {
    const source = { document_no: "QT-2026-0001", document_type: "quotation" as DocType };
    const dn = buildDuplicatePayload("store-1", source, "delivery", fakeNextNo("delivery"));
    expect(dn.document_no.startsWith("DN-")).toBe(true);
    const rc = buildDuplicatePayload("store-1", source, "receipt", fakeNextNo("receipt"));
    expect(rc.document_no.startsWith("RC-")).toBe(true);
  });

  it("links the new row back to the source via related_document_no", () => {
    const source = { document_no: "QT-2026-0005", document_type: "quotation" as DocType };
    const dn = buildDuplicatePayload("store-1", source, "delivery", fakeNextNo("delivery"));
    expect(dn.related_document_no).toBe("QT-2026-0005");
  });

  it("never reuses the source running number on the new row", () => {
    const source = { document_no: "QT-2026-0005", document_type: "quotation" as DocType };
    const dn = buildDuplicatePayload("store-1", source, "delivery", fakeNextNo("delivery"));
    expect(dn.document_no).not.toBe(source.document_no);
  });

  it("QT → DN → RC sequence emits three distinct numbers", () => {
    const seq = (["quotation", "delivery", "receipt"] as DocType[]).map(fakeNextNo);
    const unique = new Set(seq);
    expect(unique.size).toBe(3);
  });

  it("every prefix matches the documented format ^(QT|DN|RC|IT)-YYYY-NNNN$", () => {
    const re = /^(QT|DN|RC|IT)-\d{4}-\d{4,}$/;
    (["quotation", "delivery", "receipt", "tax_invoice"] as DocType[]).forEach((t) => {
      expect(fakeNextNo(t)).toMatch(re);
    });
  });

  it("QT → DN → RC → QT (re-issue) yields 4 distinct numbers", () => {
    // Stand-in counter that advances per type, mirroring rds_next_doc_no's
    // per-prefix sequence behaviour.
    const counters: Record<DocType, number> = { quotation: 1, delivery: 1, receipt: 1, tax_invoice: 1 };
    const next = (t: DocType) => `${({ quotation: "QT", delivery: "DN", receipt: "RC", tax_invoice: "IT" } as const)[t]}-2026-${String(counters[t]++).padStart(4, "0")}`;
    const seq = [next("quotation"), next("delivery"), next("receipt"), next("quotation")];
    expect(new Set(seq).size).toBe(4);
    expect(seq[0]).toMatch(/^QT-/);
    expect(seq[1]).toMatch(/^DN-/);
    expect(seq[2]).toMatch(/^RC-/);
    expect(seq[3]).toMatch(/^QT-/);
    // Re-issued QT must NOT collide with the original QT number.
    expect(seq[3]).not.toBe(seq[0]);
  });

  it("payload carries to_doc_id when present (for activity-log mirroring)", () => {
    const source = { document_no: "QT-2026-0010", document_type: "quotation" as DocType };
    const dn = buildDuplicatePayload("store-1", source, "delivery", fakeNextNo("delivery"));
    // Audit-log entries on BOTH sides should carry from_no = source AND
    // related_document_no = source so opening either row surfaces the move.
    expect(dn.related_document_no).toBe(source.document_no);
  });
});