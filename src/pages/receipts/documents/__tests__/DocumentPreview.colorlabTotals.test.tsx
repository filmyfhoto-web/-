import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import DocumentPreview from "../DocumentPreview";
import type { RdsStore } from "../../types";
import type { DocFormState, Totals, DocTemplate, DocumentType } from "../useDocumentForm";

function makeStore(slug: "colorlab" | "printing"): RdsStore {
  return {
    id: slug,
    slug,
    name: slug === "colorlab" ? "นัฐภรณ์ คัลเลอร์แล็ป" : "นัฐภรณ์ การพิมพ์",
    tax_id: null,
    phone: null,
    address: null,
    logo_url: null,
    default_vat_rate: 7,
    vat_enabled: slug === "colorlab",
    brand_color: "221 83% 45%",
  };
}

function makeState(template: DocTemplate, document_type: DocumentType, withVat: boolean): DocFormState {
  return {
    document_type,
    paper_size: "A4",
    template,
    document_date: "2026-06-24",
    show_document_date: true,
    vat_mode: withVat ? "exclusive" : "none",
    vat_rate: withVat ? 7 : 0,
    price_type: withVat ? "exclude_vat" : "no_vat",
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
    items: [
      { key: "k1", product_id: null, name: "สินค้า A", description: "", price: 100, quantity: 1, unit: "ชิ้น", discount_percent: 0, discount_amount: 0 },
    ],
  } as unknown as DocFormState;
}

const totalsNoVat: Totals = {
  subtotal: 100, discount_total: 0, amount_before_vat: 100,
  vat_amount: 0, grand_total: 100, withholding_tax_amount: 0, net_total: 100,
} as Totals;

const totalsVat: Totals = {
  subtotal: 100, discount_total: 0, amount_before_vat: 100,
  vat_amount: 7, grand_total: 107, withholding_tax_amount: 0, net_total: 107,
} as Totals;

function totalsRowLabels(container: HTMLElement): string[] {
  const root = container.querySelector(".doc-totals") as HTMLElement | null;
  if (!root) return [];
  return Array.from(root.querySelectorAll("tr")).map(
    (tr) => (tr.querySelector("td")?.textContent ?? "").trim(),
  );
}

afterEach(() => cleanup());

describe("Color Lab totals — no duplicate 'รวม' subtotal row", () => {
  const templates: DocTemplate[] = ["modern", "classic", "compact", "formal"];
  const docTypes: DocumentType[] = ["receipt", "tax_invoice", "quotation", "delivery"];

  for (const tpl of templates) {
    for (const dt of docTypes) {
      it(`colorlab ${tpl}/${dt} VAT: shows ก่อน VAT / VAT / ยอดรวม, no top 'รวม'`, () => {
        const { container } = render(
          <DocumentPreview store={makeStore("colorlab")} state={makeState(tpl, dt, true)} totals={totalsVat} docNo="C-1" />,
        );
        const labels = totalsRowLabels(container);
        expect(labels).not.toContain("รวม");
        expect(labels).toEqual(expect.arrayContaining(["ก่อน VAT"]));
        // exactly one grand-total row
        expect(labels.filter((l) => l === "ยอดรวม").length).toBe(1);
      });

      it(`colorlab ${tpl}/${dt} no-VAT: no top 'รวม', one 'ยอดรวม'`, () => {
        const { container } = render(
          <DocumentPreview store={makeStore("colorlab")} state={makeState(tpl, dt, false)} totals={totalsNoVat} docNo="C-2" />,
        );
        const labels = totalsRowLabels(container);
        expect(labels).not.toContain("รวม");
        expect(labels.filter((l) => l === "ยอดรวม").length).toBe(1);
      });
    }
  }
});

describe("นัฐภรณ์ การพิมพ์ (printing) totals unchanged — keeps 'รวม' row", () => {
  it("modern VAT: still shows 'รวม' row above ก่อน VAT", () => {
    const { container } = render(
      <DocumentPreview store={makeStore("printing")} state={{ ...makeState("modern", "receipt", true), vat_mode: "exclusive" }} totals={totalsVat} docNo="P-1" />,
    );
    const labels = totalsRowLabels(container);
    expect(labels).toContain("รวม");
    expect(labels).toContain("ก่อน VAT");
    expect(labels.filter((l) => l === "ยอดรวม").length).toBe(1);
  });

  it("classic no-VAT: still shows 'รวม' row", () => {
    const { container } = render(
      <DocumentPreview store={makeStore("printing")} state={makeState("classic", "receipt", false)} totals={totalsNoVat} docNo="P-2" />,
    );
    const labels = totalsRowLabels(container);
    expect(labels).toContain("รวม");
  });
});