import { describe, it, expect } from "vitest";
import {
  assertCompanionPageBreak,
  assertPrintableContainsCompanion,
  inspectPrintable,
} from "../printableAssertions";

function build(mainNo: string, companionNo: string | null, opts?: { breakStyle?: string }) {
  const root = document.createElement("div");
  root.id = "printable-area";
  const main = document.createElement("div");
  main.id = "doc-print";
  main.setAttribute("data-kind", "delivery");
  main.innerHTML = `<span class="docno">${mainNo}</span>`;
  root.appendChild(main);
  if (companionNo) {
    const wrap = document.createElement("div");
    wrap.className = "rds-companion-doc";
    const style = opts?.breakStyle ?? "page";
    wrap.setAttribute("style", `break-before:${style};page-break-before:always`);
    const cmp = document.createElement("div");
    cmp.id = "doc-print";
    cmp.setAttribute("data-kind", "receipt");
    cmp.innerHTML = `<span class="docno">${companionNo}</span>`;
    wrap.appendChild(cmp);
    root.appendChild(wrap);
  }
  document.body.appendChild(root);
  return root;
}

describe("printableAssertions", () => {
  it("inspectPrintable reports counts + ordering", () => {
    const root = build("DN-2026-000001", "RC-2026-000001");
    const r = inspectPrintable(root);
    expect(r.docPrintCount).toBe(2);
    expect(r.companionWrapperCount).toBe(1);
    expect(r.kindsInOrder).toEqual(["delivery", "receipt"]);
    expect(r.docNosInOrder).toEqual(["DN-2026-000001", "RC-2026-000001"]);
    expect(r.companionHasPageBreak).toBe(true);
    expect(r.separatorBetweenBlocks).toBe(true);
  });

  it("assertPrintableContainsCompanion passes for valid delivery+receipt", () => {
    const root = build("DN-2026-000001", "RC-2026-000001");
    expect(() =>
      assertPrintableContainsCompanion(root, {
        mainDocNo: "DN-2026-000001",
        companionDocNo: "RC-2026-000001",
        mainKind: "delivery",
        companionKind: "receipt",
      }),
    ).not.toThrow();
  });

  it("throws when companion is missing", () => {
    const root = build("DN-2026-000001", null);
    expect(() =>
      assertPrintableContainsCompanion(root, {
        mainDocNo: "DN-2026-000001",
        companionDocNo: "RC-2026-000001",
      }),
    ).toThrow(/>=2 #doc-print/);
  });

  it("assertCompanionPageBreak rejects missing break-before", () => {
    const root = build("DN-2026-000001", "RC-2026-000001", { breakStyle: "auto" });
    expect(() => assertCompanionPageBreak(root)).toThrow(/break-before/);
  });
});