import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import DocumentPreview from "../DocumentPreview";
import type { RdsStore } from "../../types";
import type { DocFormState, Totals, DocTemplate } from "../useDocumentForm";

function makeStore(): RdsStore {
  return {
    id: "s1",
    slug: "colorlab",
    name: "ร้านทดสอบ",
    tax_id: null,
    phone: null,
    address: null,
    logo_url: null,
    default_vat_rate: 0,
    vat_enabled: false,
    brand_color: "221 83% 45%",
  } as RdsStore;
}

function makeState(template: DocTemplate, flags: Partial<DocFormState>): DocFormState {
  return {
    document_type: "receipt",
    paper_size: "A4",
    template,
    document_date: "2026-06-24",
    show_document_date: true,
    vat_mode: "none",
    vat_rate: 0,
    price_type: "no_vat",
    withholding_tax_enabled: false,
    withholding_tax_rate: 0,
    discount_amount: 0,
    customer_id: null,
    customer_name: "ลูกค้าทดสอบ",
    customer_phone: "",
    customer_address: "",
    customer_tax_id: "",
    customer_branch: "",
    payment_method: "cash",
    notes: "",
    show_payment_method: true,
    show_payment_date: true,
    show_footer_document_date: true,
    items: [
      {
        key: "k1",
        product_id: null,
        name: "สินค้า A",
        description: "",
        price: 100,
        quantity: 1,
        unit: "ชิ้น",
        discount_percent: 0,
        discount_amount: 0,
      },
    ],
    ...flags,
  } as DocFormState;
}

const totals: Totals = {
  subtotal: 100,
  discount_total: 0,
  amount_before_vat: 100,
  vat_amount: 0,
  grand_total: 100,
  withholding_tax_amount: 0,
  net_total: 100,
} as Totals;

afterEach(() => cleanup());

const TEMPLATES: DocTemplate[] = ["modern", "classic", "compact", "formal"];

function text(container: HTMLElement): string {
  const root = container.querySelector("#doc-print") as HTMLElement;
  return (root?.textContent ?? "").replace(/\s+/g, " ");
}

describe.each(TEMPLATES)("DocumentPreview [%s] — show_* flags drive visibility", (tpl) => {
  it("shows วิธีจ่ายเงิน but never renders lower payment/footer dates", () => {
    const { container } = render(
      <DocumentPreview store={makeStore()} state={makeState(tpl, {})} totals={totals} docNo="T-1" />,
    );
    const t = text(container);
    expect(t).toContain("วิธีจ่ายเงิน");
    expect(t).not.toContain("วันที่จ่ายเงิน");
    expect(t).not.toContain("วันที่:");
  });

  it("hides วิธีจ่ายเงิน when show_payment_method = false", () => {
    const { container } = render(
      <DocumentPreview
        store={makeStore()}
        state={makeState(tpl, { show_payment_method: false })}
        totals={totals}
        docNo="T-2"
      />,
    );
    expect(text(container)).not.toContain("วิธีจ่ายเงิน");
  });

  it("keeps วันที่จ่ายเงิน hidden even when show_payment_date = true/false", () => {
    const { container } = render(
      <DocumentPreview
        store={makeStore()}
        state={makeState(tpl, { show_payment_date: false })}
        totals={totals}
        docNo="T-3"
      />,
    );
    expect(text(container)).not.toContain("วันที่จ่ายเงิน");
  });

  it("does not render signer/footer document date", () => {
    const { container: cAll } = render(
      <DocumentPreview store={makeStore()} state={makeState(tpl, {})} totals={totals} docNo="T-4a" />,
    );
    expect(text(cAll)).not.toContain("วันที่:");
    cleanup();

    const { container: cOff } = render(
      <DocumentPreview
        store={makeStore()}
        state={makeState(tpl, { show_footer_document_date: false })}
        totals={totals}
        docNo="T-4b"
      />,
    );
    expect(text(cOff)).not.toContain("วันที่:");
  });

  it("hides ALL three sections when every flag is false", () => {
    const { container } = render(
      <DocumentPreview
        store={makeStore()}
        state={makeState(tpl, {
          show_payment_method: false,
          show_payment_date: false,
          show_footer_document_date: false,
          show_document_date: false,
        })}
        totals={totals}
        docNo="T-5"
      />,
    );
    const t = text(container);
    expect(t).not.toContain("วิธีจ่ายเงิน");
    expect(t).not.toContain("วันที่จ่ายเงิน");
    // Should still render core content
    expect(t).toContain("สินค้า A");
    expect(t).toContain("T-5");
  });
});
