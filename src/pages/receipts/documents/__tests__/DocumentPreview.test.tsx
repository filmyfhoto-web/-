import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import DocumentPreview from "../DocumentPreview";
import type { RdsStore } from "../../types";
import type { DocFormState, Totals, DocTemplate } from "../useDocumentForm";

const FIXTURE_LOGO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Zy3l4QAAAAASUVORK5CYII=";

function makeStore(overrides: Partial<RdsStore> = {}): RdsStore {
  return {
    id: "s1",
    slug: "colorlab",
    name: "นัฐภรณ์ คัลเลอร์แล็ป",
    tax_id: null,
    phone: null,
    address: null,
    logo_url: null,
    default_vat_rate: 0,
    vat_enabled: false,
    brand_color: "221 83% 45%",
    ...overrides,
  };
}

function makeState(template: DocTemplate = "modern"): DocFormState {
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
  } as unknown as DocFormState;
}

const totals: Totals = {
  subtotal: 100,
  discount_total: 0,
  amount_before_vat: 100,
  vat_amount: 0,
  grand_total: 100,
  withholding_tax_amount: 0,
  net_total: 100,
} as unknown as Totals;

function countStoreName(container: HTMLElement, name: string): number {
  return Array.from(container.querySelectorAll("p")).filter(
    (p) => p.textContent?.trim() === name,
  ).length;
}

function findIssuerSection(container: HTMLElement): HTMLElement | null {
  const label = Array.from(container.querySelectorAll("p")).find((p) =>
    p.textContent?.trim().startsWith("ผู้ขาย"),
  );
  return (label?.parentElement as HTMLElement | null) ?? null;
}

afterEach(() => cleanup());

describe("DocumentPreview (modern) — store name placement", () => {
  it("renders store name once, inside the issuer section, with logo present", () => {
    const store = makeStore({ logo_url: FIXTURE_LOGO });
    const { container } = render(
      <DocumentPreview store={store} state={makeState("modern")} totals={totals} docNo="T-1" />,
    );
    const printEl = container.querySelector("#doc-print") as HTMLElement;
    expect(printEl).toBeTruthy();

    // Exactly one occurrence of the store name
    expect(countStoreName(printEl, store.name)).toBe(1);

    // Not under the logo: parent of the <img> must NOT contain the store name
    const logoImg = printEl.querySelector("img") as HTMLImageElement | null;
    expect(logoImg).toBeTruthy();
    const logoContainer = logoImg!.parentElement as HTMLElement;
    expect(countStoreName(logoContainer, store.name)).toBe(0);

    // Inside the issuer section
    const issuer = findIssuerSection(printEl);
    expect(issuer).toBeTruthy();
    expect(countStoreName(issuer!, store.name)).toBe(1);
  });

  it("falls back to text store name (no logo) — still exactly one occurrence in issuer section", () => {
    const store = makeStore({ logo_url: null });
    const { container } = render(
      <DocumentPreview store={store} state={makeState("modern")} totals={totals} docNo="T-2" />,
    );
    const printEl = container.querySelector("#doc-print") as HTMLElement;

    // No <img> rendered
    expect(printEl.querySelector("img")).toBeNull();

    // Header fallback adds the name at the top-right block, plus issuer section.
    // Spec: name MUST appear in the issuer section. Header fallback is acceptable
    // because logo is missing, but the issuer section is always the source of truth.
    const issuer = findIssuerSection(printEl);
    expect(issuer).toBeTruthy();
    expect(countStoreName(issuer!, store.name)).toBe(1);
  });

  it("never places the store name in the same container as the logo image", () => {
    const store = makeStore({ logo_url: FIXTURE_LOGO });
    const { container } = render(
      <DocumentPreview store={store} state={makeState("modern")} totals={totals} docNo="T-3" />,
    );
    const printEl = container.querySelector("#doc-print") as HTMLElement;
    const logoImg = printEl.querySelector("img")!;

    // Walk up from <img>; ensure no ancestor up to (but not including) #doc-print
    // directly contains a <p> whose text === store.name.
    let node: HTMLElement | null = logoImg.parentElement as HTMLElement | null;
    while (node && node.id !== "doc-print") {
      const directParagraphs = Array.from(node.children).filter(
        (c) => c.tagName === "P",
      ) as HTMLParagraphElement[];
      const hasName = directParagraphs.some(
        (p) => p.textContent?.trim() === store.name,
      );
      expect(hasName).toBe(false);
      node = node.parentElement;
    }
  });
});

describe("DocumentPreview (non-modern templates) — header still shows store name", () => {
  it.each(["classic", "compact", "formal"] as DocTemplate[])(
    "template=%s renders store name (PageHeader) — guard against accidental regression",
    (tpl) => {
      const store = makeStore({ logo_url: FIXTURE_LOGO });
      const { container } = render(
        <DocumentPreview store={store} state={makeState(tpl)} totals={totals} docNo="T-X" />,
      );
      const printEl = container.querySelector("#doc-print") as HTMLElement;
      // At least one occurrence — PageHeader places it
      expect(countStoreName(printEl, store.name)).toBeGreaterThanOrEqual(1);
    },
  );
});

describe("DocumentPreview — VAT summary lines", () => {
  const vatTotals: Totals = {
    subtotal: 300,
    discount_total: 0,
    amount_before_vat: 300,
    vat_amount: 21,
    grand_total: 321,
    withholding_tax_amount: 0,
    net_total: 321,
  } as unknown as Totals;

  function textOf(container: HTMLElement) {
    return (container.querySelector("#doc-print") as HTMLElement).textContent ?? "";
  }

  it.each(["modern", "classic"] as DocTemplate[])(
    "template=%s with VAT shows รวม / ก่อน VAT / VAT 7% / ยอดรวม",
    (tpl) => {
      const state = {
        ...makeState(tpl),
        vat_mode: "exclusive",
        vat_rate: 7,
      } as unknown as DocFormState;
      const { container } = render(
        <DocumentPreview store={makeStore()} state={state} totals={vatTotals} docNo="V-1" />,
      );
      const txt = textOf(container);
      expect(txt).toMatch(/รวม/);
      expect(txt).toMatch(/ก่อน VAT/);
      expect(txt).toMatch(/VAT 7%/);
      expect(txt).toMatch(/ยอดรวม/);
    },
  );

  it.each(["modern", "classic"] as DocTemplate[])(
    "template=%s without VAT hides ก่อน VAT and VAT line",
    (tpl) => {
      const { container } = render(
        <DocumentPreview store={makeStore()} state={makeState(tpl)} totals={totals} docNo="V-2" />,
      );
      const txt = textOf(container);
      expect(txt).not.toMatch(/ก่อน VAT/);
      expect(txt).not.toMatch(/VAT\s*\d+%/);
    },
  );
});