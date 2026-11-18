import { describe, it, expect } from "vitest";

/**
 * Unit tests for the policy that blocks ใบส่งของ (delivery) saves when the
 * referenced ใบเสนอราคา (quotation) is missing or has not yet been printed.
 *
 * The decision is a pure function of three inputs: the new doc's
 * document_type, the related_document_no it claims to reference, and the
 * row fetched for that QT. We factor it here so we can lock in every branch
 * without mounting the React form.
 */

type QtRow = {
  document_type: string;
  print_status?: string | null;
  last_printed_at?: string | null;
} | null;

export type DeliveryGuardResult =
  | { ok: true }
  | { ok: false; reason: "missing_quotation" | "quotation_not_printed" };

export function evaluateDeliveryGuard(args: {
  documentType: string;
  relatedNo: string;
  qt: QtRow;
}): DeliveryGuardResult {
  if (args.documentType !== "delivery") return { ok: true };
  const rel = (args.relatedNo ?? "").trim();
  if (!rel) return { ok: false, reason: "missing_quotation" };
  if (!args.qt || args.qt.document_type !== "quotation") {
    return { ok: false, reason: "missing_quotation" };
  }
  const printed = args.qt.print_status === "printed" || !!args.qt.last_printed_at;
  if (!printed) return { ok: false, reason: "quotation_not_printed" };
  return { ok: true };
}

describe("delivery guard", () => {
  it("passes through for non-delivery documents", () => {
    expect(evaluateDeliveryGuard({ documentType: "receipt", relatedNo: "", qt: null }))
      .toEqual({ ok: true });
  });

  it("blocks when no related_document_no is set", () => {
    const r = evaluateDeliveryGuard({ documentType: "delivery", relatedNo: "", qt: null });
    expect(r).toEqual({ ok: false, reason: "missing_quotation" });
  });

  it("blocks when related doc exists but is not a quotation", () => {
    const r = evaluateDeliveryGuard({
      documentType: "delivery",
      relatedNo: "RC-2026-0001",
      qt: { document_type: "receipt", print_status: "printed" },
    });
    expect(r).toEqual({ ok: false, reason: "missing_quotation" });
  });

  it("blocks when the quotation has never been printed", () => {
    const r = evaluateDeliveryGuard({
      documentType: "delivery",
      relatedNo: "QT-2026-0001",
      qt: { document_type: "quotation", print_status: "not_printed", last_printed_at: null },
    });
    expect(r).toEqual({ ok: false, reason: "quotation_not_printed" });
  });

  it("allows when the quotation has print_status='printed'", () => {
    const r = evaluateDeliveryGuard({
      documentType: "delivery",
      relatedNo: "QT-2026-0001",
      qt: { document_type: "quotation", print_status: "printed" },
    });
    expect(r.ok).toBe(true);
  });

  it("allows when the quotation has a last_printed_at timestamp", () => {
    const r = evaluateDeliveryGuard({
      documentType: "delivery",
      relatedNo: "QT-2026-0001",
      qt: { document_type: "quotation", last_printed_at: "2026-06-27T10:00:00Z" },
    });
    expect(r.ok).toBe(true);
  });

  it("blocks when the quotation row is soft-deleted (caller passes qt=null)", () => {
    // The guard receives the row already-filtered by the caller (which uses
    // `.is('deleted_at', null)` upstream). A deleted QT → qt is null → block.
    const r = evaluateDeliveryGuard({ documentType: "delivery", relatedNo: "QT-2026-0001", qt: null });
    expect(r).toEqual({ ok: false, reason: "missing_quotation" });
  });

  it("blocks when the related_no resolves under a different store (qt=null)", () => {
    // Cross-store lookups are scoped by `store_id` in the caller so a mismatched
    // store yields a null fetch. Treat the same as a missing quotation.
    const r = evaluateDeliveryGuard({ documentType: "delivery", relatedNo: "QT-2026-0001", qt: null });
    expect(r.ok).toBe(false);
  });

  it("blocks when print_status='print_error' and no last_printed_at", () => {
    const r = evaluateDeliveryGuard({
      documentType: "delivery",
      relatedNo: "QT-2026-0001",
      qt: { document_type: "quotation", print_status: "print_error", last_printed_at: null },
    });
    expect(r).toEqual({ ok: false, reason: "quotation_not_printed" });
  });

  it("allows when print_status='print_error' but last_printed_at is set (recovered)", () => {
    // The print actually completed once, even if a later attempt errored —
    // the document has been physically printed, so DN is allowed.
    const r = evaluateDeliveryGuard({
      documentType: "delivery",
      relatedNo: "QT-2026-0001",
      qt: { document_type: "quotation", print_status: "print_error", last_printed_at: "2026-05-01T00:00:00Z" },
    });
    expect(r.ok).toBe(true);
  });
});