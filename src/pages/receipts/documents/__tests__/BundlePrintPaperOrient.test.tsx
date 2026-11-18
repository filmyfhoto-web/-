/**
 * Print geometry is LOCKED to the resolved document page layout (A4 portrait
 * by default) so nothing shifts between preview, page 2+ and the printer.
 * These tests guarantee:
 *  - the selected paper/orientation is still exposed on `#doc-print` as data
 *    attributes for downstream tooling,
 *  - attachment pages always use the locked page layout, never the raw paper,
 *  - an explicit `pageLayout` override is the only way to change the geometry.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { BundlePrint, PAPER_DIMENSIONS_MM, type BundleAttachmentRef, type BundleDocRef } from "../BundlePrint";
import type { PrintBundleSelection } from "../../lib/printPrefs";

vi.mock("../DocumentPreview", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  __esModule: true,
  default: ({ state }: any) => (
    <div className="doc-page" data-doc-paper={state.paper_size}>{state.document_type}</div>
  ),
}));

function makeBundle(order: string[]): PrintBundleSelection {
  return { order, selected: Object.fromEntries(order.map((id) => [id, true])) };
}

const totals: any = { subtotal: 0, grand_total: 0, net_total: 0, amount_before_vat: 0, vat_amount: 0, withholding_tax_amount: 0 };
const docs: BundleDocRef[] = [];

describe("BundlePrint · paper + orientation propagation", () => {
  const attachments: BundleAttachmentRef[] = [
    { id: "att:upload:x", label: "แนบ", pages: [{ dataUrl: "data:image/png;base64,AAA", width: 100, height: 141 }] },
  ];
  const bundle = makeBundle(["doc:main", "att:upload:x"]);

  it.each(Object.entries(PAPER_DIMENSIONS_MM))(
    "paper %s keeps attachment pages on the locked A4 portrait geometry",
    (paper) => {
      const state: any = { document_type: "receipt", paper_size: paper, font_scale: 1, items: [] };
      const { container } = render(
        <BundlePrint store={null} state={state} totals={totals} mainDocNo="R-1" docs={docs} attachments={attachments} bundle={bundle} />,
      );
      const root = container.querySelector<HTMLElement>("#doc-print")!;
      expect(root.getAttribute("data-paper")).toBe(paper);
      expect(root.getAttribute("data-orient")).toBe("portrait");
      expect(root.getAttribute("data-paper-width-mm")).toBe("210");
      expect(root.getAttribute("data-paper-height-mm")).toBe("297");
      const att = container.querySelector<HTMLElement>(".attachment-page")!;
      expect(att.style.width).toBe("210mm");
      expect(att.style.minHeight).toBe("297mm");
    },
  );

  it("landscape is recorded but does not swap the locked page geometry", () => {
    const state: any = { document_type: "receipt", paper_size: "A4", font_scale: 1, items: [] };
    const { container } = render(
      <BundlePrint store={null} state={state} totals={totals} mainDocNo="R-1" docs={docs} attachments={attachments} bundle={bundle} orient="landscape" />,
    );
    const root = container.querySelector<HTMLElement>("#doc-print")!;
    expect(root.getAttribute("data-orient")).toBe("landscape");
    const att = container.querySelector<HTMLElement>(".attachment-page")!;
    expect(att.style.width).toBe("210mm");
    expect(att.style.minHeight).toBe("297mm");
  });

  it("an explicit pageLayout override (190×270) drives the attachment geometry", () => {
    const state: any = { document_type: "receipt", paper_size: "A4", font_scale: 1, items: [] };
    const { container } = render(
      <BundlePrint
        store={null}
        state={state}
        totals={totals}
        mainDocNo="R-1"
        docs={docs}
        attachments={attachments}
        bundle={bundle}
        pageLayout={{ widthMm: 190, heightMm: 270 }}
      />,
    );
    const att = container.querySelector<HTMLElement>(".attachment-page")!;
    expect(att.style.width).toBe("190mm");
    expect(att.style.minHeight).toBe("270mm");
  });

  it("does not override state.paper_size when rendering the main document", () => {
    const state: any = { document_type: "receipt", paper_size: "A5", font_scale: 1, items: [] };
    const { container } = render(
      <BundlePrint store={null} state={state} totals={totals} mainDocNo="R-1" docs={docs} attachments={[]} bundle={makeBundle(["doc:main"])} />,
    );
    // The mock DocumentPreview exposes the paper_size it received via a data attr.
    const docPage = container.querySelector<HTMLElement>("[data-doc-paper]")!;
    expect(docPage.getAttribute("data-doc-paper")).toBe("A5");
  });
});