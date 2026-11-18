/**
 * Shared DOM assertions for the companion-print regression suite. Designed
 * to run in both jsdom (vitest) and Playwright (`page.evaluate`) contexts —
 * so the implementation must avoid framework-specific APIs.
 *
 * Each assertion throws an Error describing the violation; tests wrap them
 * via `expect(() => assert...()).not.toThrow()` (vitest) or call them inside
 * `page.evaluate` and assert the returned report shape (Playwright).
 */

export type CompanionPrintReport = {
  docPrintCount: number;
  companionWrapperCount: number;
  kindsInOrder: string[];
  docNosInOrder: string[];
  companionHasPageBreak: boolean;
  separatorBetweenBlocks: boolean;
};

function getCompanionWrapper(root: ParentNode): HTMLElement | null {
  return root.querySelector(".rds-companion-doc") as HTMLElement | null;
}

export function inspectPrintable(root: ParentNode): CompanionPrintReport {
  const blocks = Array.from(root.querySelectorAll('[id="doc-print"]')) as HTMLElement[];
  const companion = getCompanionWrapper(root);
  const breakBefore = companion
    ? (companion.style.breakBefore || companion.style.pageBreakBefore || "")
    : "";
  let separatorBetween = false;
  if (blocks.length >= 2 && companion) {
    // companion wrapper must appear in document order after first #doc-print
    const first = blocks[0];
    const cmp = first.compareDocumentPosition(companion);
    separatorBetween = !!(cmp & Node.DOCUMENT_POSITION_FOLLOWING);
  }
  return {
    docPrintCount: blocks.length,
    companionWrapperCount: root.querySelectorAll(".rds-companion-doc").length,
    kindsInOrder: blocks.map((b) => b.getAttribute("data-kind") ?? ""),
    docNosInOrder: blocks.map((b) =>
      (b.querySelector(".docno")?.textContent ?? "").trim(),
    ),
    companionHasPageBreak: breakBefore === "page" || breakBefore === "always",
    separatorBetweenBlocks: separatorBetween,
  };
}

export function assertPrintableContainsCompanion(
  root: ParentNode,
  expected: { mainDocNo: string; companionDocNo: string; mainKind?: string; companionKind?: string },
): CompanionPrintReport {
  const r = inspectPrintable(root);
  if (r.docPrintCount < 2)
    throw new Error(`expected >=2 #doc-print blocks, got ${r.docPrintCount}`);
  if (r.companionWrapperCount !== 1)
    throw new Error(`expected exactly 1 .rds-companion-doc, got ${r.companionWrapperCount}`);
  if (r.docNosInOrder[0] !== expected.mainDocNo)
    throw new Error(`expected first docNo=${expected.mainDocNo}, got ${r.docNosInOrder[0]}`);
  if (r.docNosInOrder[1] !== expected.companionDocNo)
    throw new Error(`expected companion docNo=${expected.companionDocNo}, got ${r.docNosInOrder[1]}`);
  if (expected.mainKind && r.kindsInOrder[0] !== expected.mainKind)
    throw new Error(`expected first kind=${expected.mainKind}, got ${r.kindsInOrder[0]}`);
  if (expected.companionKind && r.kindsInOrder[1] !== expected.companionKind)
    throw new Error(`expected companion kind=${expected.companionKind}, got ${r.kindsInOrder[1]}`);
  if (!r.separatorBetweenBlocks)
    throw new Error("companion wrapper does not follow main #doc-print in document order");
  return r;
}

export function assertCompanionPageBreak(root: ParentNode): void {
  const r = inspectPrintable(root);
  if (!r.companionHasPageBreak)
    throw new Error("companion wrapper missing break-before/page-break-before:page|always");
}