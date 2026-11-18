/**
 * Guards that the main document paginates into real `.doc-page` sections
 * (not just a min-height overlay) — so preview count matches Print / PDF /
 * PNG / JPG exporter output. Also asserts:
 *   - one page for short lists, many pages for long lists
 *   - totals + signature only on the last page
 *   - items table header repeats on every page
 *   - orientation + paper size propagate into the DOM
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import DocumentPreview from "../DocumentPreview";
import type { RdsStore } from "../../types";
import type { DocFormState, Totals } from "../useDocumentForm";

function store(): RdsStore {
  return {
    id: "s", slug: "printing", name: "Test Store",
    tax_id: null, phone: null, address: null, logo_url: null,
    default_vat_rate: 0, vat_enabled: false, brand_color: "221 83% 45%",
  } as any;
}

function makeItems(n: number) {
  return Array.from({ length: n }).map((_, i) => ({
    key: `k${i}`, product_id: null,
    name: `รายการที่ ${i + 1}`, description: "",
    price: 100, quantity: 1, unit: "ชิ้น",
    discount_percent: 0, discount_amount: 0,
  }));
}

function state(items: any[], overrides: Partial<DocFormState> = {}): DocFormState {
  return {
    document_type: "receipt", paper_size: "A4", template: "modern",
    document_date: "2026-06-24", show_document_date: true,
    vat_mode: "none", vat_rate: 0, price_type: "no_vat",
    withholding_tax_enabled: false, withholding_tax_rate: 0, discount_amount: 0,
    customer_id: null, customer_name: "ลูกค้า", customer_phone: "", customer_address: "",
    customer_tax_id: "", customer_branch: "", payment_method: "cash",
    notes: "", items, ...overrides,
  } as unknown as DocFormState;
}

const totals: Totals = { subtotal: 0, discount_total: 0, amount_before_vat: 0, vat_amount: 0, grand_total: 0, withholding_tax_amount: 0, net_total: 0 } as any;

afterEach(() => cleanup());

describe("DocumentPreview · pagination", () => {
  it("short list renders on exactly one .doc-page (modern)", () => {
    const { container } = render(
      <DocumentPreview store={store()} state={state(makeItems(3))} totals={totals} docNo="R-1" />,
    );
    const pages = container.querySelectorAll(".doc-page");
    expect(pages.length).toBe(1);
    expect(pages[0].getAttribute("data-page-role")).toBe("last");
  });

  it("many items span multiple .doc-page sections (modern)", () => {
    const { container } = render(
      <DocumentPreview store={store()} state={state(makeItems(80))} totals={totals} docNo="R-2" />,
    );
    const pages = container.querySelectorAll(".doc-page");
    expect(pages.length).toBeGreaterThan(1);
    // Totals block only appears on the last page.
    const totalsBlocks = container.querySelectorAll(".doc-totals");
    expect(totalsBlocks.length).toBe(1);
    const signatures = container.querySelectorAll(".doc-signature");
    expect(signatures.length).toBe(1);
    // Signature is the child of the last page.
    const lastPage = pages[pages.length - 1];
    expect(lastPage.querySelector(".doc-signature")).toBeTruthy();
  });

  it("items table header repeats on every page that has items (modern)", () => {
    const { container } = render(
      <DocumentPreview store={store()} state={state(makeItems(80))} totals={totals} docNo="R-3" />,
    );
    const tables = container.querySelectorAll(".doc-items-table");
    expect(tables.length).toBeGreaterThan(1);
    for (const t of Array.from(tables)) {
      const headers = t.querySelectorAll("thead th");
      expect(headers.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the locked A4 portrait page size even when orientation is landscape", () => {
    const { container } = render(
      <DocumentPreview store={store()} state={state(makeItems(2))} totals={totals} docNo="R-4" orient="landscape" />,
    );
    const page = container.querySelector<HTMLElement>(".doc-page")!;
    // Page geometry is locked to the resolved document page layout (A4 portrait)
    // so print output never shifts between preview and printer.
    expect(page.style.width).toBe("210mm");
  });

  it("classic template also paginates and only trailer-page has totals", () => {
    const { container } = render(
      <DocumentPreview
        store={store()}
        state={state(makeItems(80), { template: "classic" })}
        totals={totals}
        docNo="R-5"
      />,
    );
    const pages = container.querySelectorAll(".doc-page");
    expect(pages.length).toBeGreaterThan(1);
    expect(container.querySelectorAll(".doc-totals").length).toBe(1);
  });

  it("pages carry data-page-idx and data-page-total for exporter/tests", () => {
    const { container } = render(
      <DocumentPreview store={store()} state={state(makeItems(60))} totals={totals} docNo="R-6" />,
    );
    const pages = Array.from(container.querySelectorAll<HTMLElement>(".doc-page"));
    const total = pages.length;
    pages.forEach((el, i) => {
      expect(el.getAttribute("data-page-idx")).toBe(String(i + 1));
      expect(el.getAttribute("data-page-total")).toBe(String(total));
    });
  });
});