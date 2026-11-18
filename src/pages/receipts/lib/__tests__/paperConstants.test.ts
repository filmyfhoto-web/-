import { describe, it, expect } from "vitest";
import { A4_PAGE, CONTENT_FRAME, LOCKED_PADDING, getLockedPageLayout } from "../paperConstants";

describe("paperConstants", () => {
  it("locks the A4 page to 210 × 297mm", () => {
    expect(A4_PAGE.widthMm).toBe(210);
    expect(A4_PAGE.heightMm).toBe(297);
  });
  it("locks the content frame to 190 × 270mm", () => {
    expect(CONTENT_FRAME.widthMm).toBe(190);
    expect(CONTENT_FRAME.heightMm).toBe(270);
  });
  it("padding = 10/10/17/10 so content = 190×270 inside A4", () => {
    expect(LOCKED_PADDING).toEqual({ top: 10, right: 10, bottom: 17, left: 10 });
    expect(A4_PAGE.widthMm - LOCKED_PADDING.left - LOCKED_PADDING.right).toBe(CONTENT_FRAME.widthMm);
    expect(A4_PAGE.heightMm - LOCKED_PADDING.top - LOCKED_PADDING.bottom).toBe(CONTENT_FRAME.heightMm);
  });
  it("getLockedPageLayout returns a locked A4 layout with a fresh padding object each call", () => {
    const a = getLockedPageLayout();
    const b = getLockedPageLayout();
    expect(a).toEqual(b);
    expect(a.widthMm).toBe(210);
    expect(a.heightMm).toBe(297);
    expect(a.contentWidthMm).toBe(190);
    expect(a.contentHeightMm).toBe(270);
    expect(a.paddingCss).toBe("10mm 10mm 17mm 10mm");
    // Padding object is a copy, not a reference to the frozen constant.
    a.paddingMm.top = 999;
    expect(getLockedPageLayout().paddingMm.top).toBe(10);
  });
  it("constants themselves are frozen", () => {
    expect(Object.isFrozen(A4_PAGE)).toBe(true);
    expect(Object.isFrozen(CONTENT_FRAME)).toBe(true);
    expect(Object.isFrozen(LOCKED_PADDING)).toBe(true);
  });
});
