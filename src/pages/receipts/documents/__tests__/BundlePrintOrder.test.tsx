/**
 * BundlePrint order + page numbering parity across export channels.
 *
 * The DOM produced here is the exact node every export channel operates on:
 *   - Print:  `#doc-print.outerHTML` copied into the print window
 *   - PDF:    `elementToPdfBlob(#doc-print, ...)` iterates `.doc-page`
 *   - PNG/JPG: `snapshotToCanvases()` iterates `.doc-page`
 *
 * So verifying the ordering + page-number badges here proves parity for all
 * four channels — no separate rendering pipelines to drift out of sync.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { BundlePrint, type BundleAttachmentRef, type BundleDocRef } from "../BundlePrint";
import type { PrintBundleSelection } from "../../lib/printPrefs";

vi.mock("../DocumentPreview", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  __esModule: true,
  default: ({ docNo, state }: any) => (
    <div className="doc-page" data-doc-type={state.document_type} data-doc-no={docNo ?? ""}>
      main:{state.document_type}
    </div>
  ),
}));

function makeSelection(order: string[]): PrintBundleSelection {
  return { order, selected: Object.fromEntries(order.map((id) => [id, true])) };
}

describe("BundlePrint export parity", () => {
  const baseState: any = { document_type: "receipt", font_scale: 1, items: [] };
  const totals: any = { subtotal: 0, grand_total: 0, net_total: 0, amount_before_vat: 0, vat_amount: 0, withholding_tax_amount: 0 };
  const docs: BundleDocRef[] = [
    { id: "doc:delivery", type: "delivery", docNo: "DL-1" },
  ];

  it("keeps bundle order for docs + attachments and numbers every page", () => {
    const attachments: BundleAttachmentRef[] = [
      {
        id: "att:upload:foo.pdf",
        label: "แนบ 1",
        pages: [
          { dataUrl: "data:image/png;base64,AAA", width: 100, height: 141 },
          { dataUrl: "data:image/png;base64,BBB", width: 100, height: 141 },
        ],
      },
      {
        id: "att:preset:id_copy",
        label: "แนบ 2",
        pages: [{ dataUrl: "data:image/png;base64,CCC", width: 100, height: 141 }],
      },
    ];
    const bundle = makeSelection([
      "doc:main",
      "att:upload:foo.pdf",
      "doc:delivery",
      "att:preset:id_copy",
    ]);

    const { container } = render(
      <BundlePrint
        store={null}
        state={baseState}
        totals={totals}
        mainDocNo="R-1"
        docs={docs}
        attachments={attachments}
        bundle={bundle}
      />,
    );

    // Bundle segment order (top-level `.doc-print-document` wrappers).
    const segments = Array.from(container.querySelectorAll<HTMLElement>(".doc-print-document"));
    expect(segments.map((s) => s.dataset.bundleId)).toEqual([
      "doc:main",
      "att:upload:foo.pdf",
      "doc:delivery",
      "att:preset:id_copy",
    ]);

    // Every doc/attachment page is a `.doc-page` — 1 main + 2 pdf pages + 1 delivery + 1 id-copy = 5.
    const pages = Array.from(container.querySelectorAll<HTMLElement>(".doc-page"));
    expect(pages).toHaveLength(5);

    // Page indices are tagged as data attributes (used by print-range/debug),
    // but no visible page-number badge is rendered anywhere.
    pages.forEach((p, i) => {
      expect(p.getAttribute("data-bundle-page")).toBe(String(i + 1));
      expect(p.getAttribute("data-bundle-total")).toBe("5");
      expect(p.querySelector(".bundle-page-num")).toBeNull();
    });

    // Multi-page attachments break between pages (page 2 of the pdf gets a
    // page-break-before). The first page of each segment must NOT force a
    // break (avoids blank leading pages in some browsers).
    const attPages = Array.from(container.querySelectorAll<HTMLElement>('.attachment-page[data-att-id="att:upload:foo.pdf"]'));
    expect(attPages).toHaveLength(2);
    expect(attPages[0].style.pageBreakBefore).toBe("");
    expect(attPages[1].style.pageBreakBefore).toBe("always");
  });

  it("falls back to url-based attachment when no pre-rendered pages exist", () => {
    const attachments: BundleAttachmentRef[] = [
      { id: "att:preset:bankbook", label: "แนบ", url: "https://example.com/x.png" },
    ];
    const bundle = makeSelection(["doc:main", "att:preset:bankbook"]);
    const { container } = render(
      <BundlePrint
        store={null}
        state={baseState}
        totals={totals}
        mainDocNo="R-2"
        docs={[]}
        attachments={attachments}
        bundle={bundle}
      />,
    );
    const img = container.querySelector<HTMLImageElement>('img[alt="แนบ"]');
    expect(img).toBeTruthy();
    expect(img!.src).toContain("x.png");
  });
});