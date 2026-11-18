import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import DocumentPreview from "../DocumentPreview";
import type { RdsStore } from "../../types";
import type { DocFormState, Totals, DocTemplate } from "../useDocumentForm";

function store(): RdsStore {
  return {
    id: "s1", slug: "colorlab", name: "ร้านทดสอบ",
    tax_id: null, phone: null, address: null, logo_url: null,
    default_vat_rate: 0, vat_enabled: false, brand_color: "221 83% 45%",
  } as RdsStore;
}

function state(template: DocTemplate, docType: DocFormState["document_type"]): DocFormState {
  return {
    document_type: docType, paper_size: "A4", template,
    document_date: "2026-06-24", show_document_date: true,
    vat_mode: "none", vat_rate: 0, price_type: "no_vat",
    withholding_tax_enabled: false, withholding_tax_rate: 0,
    discount_amount: 0, customer_id: null, customer_name: "ลูกค้าทดสอบ",
    customer_phone: "", customer_address: "", customer_tax_id: "",
    customer_branch: "", payment_method: "cash", notes: "",
    items: [{ key: "k1", product_id: null, name: "A", description: "", price: 100, quantity: 1, unit: "ชิ้น", discount_percent: 0, discount_amount: 0 }],
  } as unknown as DocFormState;
}

const totals: Totals = {
  subtotal: 100, discount_total: 0, amount_before_vat: 100, vat_amount: 0,
  grand_total: 100, withholding_tax_amount: 0, net_total: 100,
} as unknown as Totals;

afterEach(() => cleanup());

const TOP_BLANK_DATE = "วันที่ ......../.........../...............";

describe("DocumentPreview — bottom date removed for every doc type & template", () => {
  const combos: Array<[DocTemplate, DocFormState["document_type"]]> = [
    ["modern", "receipt"], ["modern", "tax_invoice"], ["modern", "quotation"],
    ["modern", "delivery"],
    ["classic", "receipt"], ["compact", "quotation"], ["formal", "delivery"],
  ];

  it.each(combos)("template=%s type=%s has no blank/duplicate bottom date", (tpl, dt) => {
    const { container } = render(
      <DocumentPreview store={store()} state={state(tpl, dt)} totals={totals} docNo="D-1" />
    );
    const printEl = container.querySelector("#doc-print") as HTMLElement;
    const txt = printEl.textContent ?? "";
    // Top date placeholder is present exactly once (inside project block).
    const occurrences = txt.split(TOP_BLANK_DATE).length - 1;
    expect(occurrences).toBe(1);
    // Top date lives inside .doc-project-block (top parties/header area).
    const project = printEl.querySelector(".doc-project-block") as HTMLElement | null;
    expect(project?.textContent ?? "").toContain(TOP_BLANK_DATE);
    expect(txt).not.toContain("วันที่:");
    // Long centered signature line + label (receipt/tax_invoice/invoice → "(ผู้รับเงิน)").
    if (dt === "receipt" || dt === "tax_invoice") {
      const sig = printEl.querySelector(".doc-signature-single") as HTMLElement | null;
      expect(sig).toBeTruthy();
      const line = sig!.querySelector(".doc-signature-longline") as HTMLElement | null;
      expect(line).toBeTruthy();
      // Responsive width ~40-45% content width with a print-safe cap.
      expect(line!.style.width).toBe("42%");
      expect(line!.style.maxWidth).toBe("72mm");
      expect(line!.style.minWidth).toBe("180px");
      expect(sig!.textContent).toContain("(ผู้รับเงิน)");
    }
    // Project block: date sits below "โครงการ :" with comfortable gap (>=8px).
    const dateEl = project?.querySelector(".doc-project-date") as HTMLElement | null;
    expect(dateEl).toBeTruthy();
    const gap = parseFloat(dateEl!.style.marginTop);
    expect(gap).toBeGreaterThanOrEqual(8);
    expect(gap).toBeLessThanOrEqual(12);
  });
});
