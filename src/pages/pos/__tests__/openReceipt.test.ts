/**
 * The printable receipt must be reachable through same-tab navigation.
 * Popups were the root cause of the iOS/PWA "หน้าเด้ง" reports.
 */
import { describe, it, expect, vi } from "vitest";
import { receiptPath, safeReturnTo, openReceiptInNewTab } from "../openReceipt";

describe("receiptPath", () => {
  it("defaults to a plain in-app path with no autoprint", () => {
    expect(receiptPath("abc")).toBe("/pos/receipt/abc");
  });

  it("carries returnTo for POS and history", () => {
    expect(receiptPath("abc", { returnTo: "/pos" })).toBe("/pos/receipt/abc?returnTo=%2Fpos");
    expect(receiptPath("abc", { returnTo: "/pos/history" })).toBe(
      "/pos/receipt/abc?returnTo=%2Fpos%2Fhistory",
    );
  });

  it("adds autoprint only when explicitly requested", () => {
    expect(receiptPath("abc", { autoprint: true })).toBe("/pos/receipt/abc?autoprint=1");
  });
});

describe("safeReturnTo", () => {
  it("keeps in-app POS paths", () => {
    expect(safeReturnTo("/pos/history")).toBe("/pos/history");
  });
  it("rejects external and non-POS targets", () => {
    expect(safeReturnTo("https://evil.test")).toBe("/pos");
    expect(safeReturnTo("//evil.test")).toBe("/pos");
    expect(safeReturnTo("/admin")).toBe("/pos");
    expect(safeReturnTo(null)).toBe("/pos");
  });
});

describe("openReceiptInNewTab", () => {
  it("is an optional secondary action that never throws", () => {
    const win = { open: vi.fn(() => ({})) } as unknown as Window;
    expect(openReceiptInNewTab("r1", { win })).toBe(true);
    const blocked = { open: vi.fn(() => null) } as unknown as Window;
    expect(openReceiptInNewTab("r1", { win: blocked })).toBe(false);
  });
});
