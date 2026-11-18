import { describe, it, expect } from "vitest";
import { docToFormState } from "../DocumentsList";

const baseRow = {
  document_type: "receipt",
  paper_size: "A4",
  document_date: "2026-06-24",
  show_document_date: true,
  vat_mode: "none",
  vat_rate: 0,
  price_type: "no_vat",
  withholding_tax_enabled: false,
  withholding_tax_rate: 0,
  discount_amount: 0,
  customer_id: null,
  customer_name: "ลูกค้า",
  customer_phone: "",
  customer_address: "",
  customer_tax_id: "",
  customer_branch: "",
  payment_method: "cash",
  notes: "",
  project_name: "โครงการ A",
};

describe("docToFormState — show_* flags roundtrip", () => {
  it("preserves all three show_* = false from DB row", () => {
    const s = docToFormState(
      { ...baseRow, show_payment_method: false, show_payment_date: false, show_footer_document_date: false },
      [],
    );
    expect(s.show_payment_method).toBe(false);
    expect(s.show_payment_date).toBe(false);
    expect(s.show_footer_document_date).toBe(false);
  });

  it("preserves all three show_* = true from DB row", () => {
    const s = docToFormState(
      { ...baseRow, show_payment_method: true, show_payment_date: true, show_footer_document_date: true },
      [],
    );
    expect(s.show_payment_method).toBe(true);
    expect(s.show_payment_date).toBe(true);
    expect(s.show_footer_document_date).toBe(true);
  });

  it("defaults missing show_* (older docs) to true", () => {
    const s = docToFormState(baseRow, []);
    expect(s.show_payment_method).toBe(true);
    expect(s.show_payment_date).toBe(true);
    expect(s.show_footer_document_date).toBe(true);
  });

  it("treats explicit null as true (legacy safety)", () => {
    const s = docToFormState(
      { ...baseRow, show_payment_method: null, show_payment_date: null, show_footer_document_date: null },
      [],
    );
    expect(s.show_payment_method).toBe(true);
    expect(s.show_payment_date).toBe(true);
    expect(s.show_footer_document_date).toBe(true);
  });

  it("project_name and other fields are preserved alongside flags", () => {
    const s = docToFormState(
      { ...baseRow, project_name: "X-2026", show_payment_method: false },
      [],
    );
    expect(s.project_name).toBe("X-2026");
    expect(s.customer_name).toBe("ลูกค้า");
    expect(s.show_payment_method).toBe(false);
    expect(s.show_payment_date).toBe(true);
  });
});
