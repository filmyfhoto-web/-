import { describe, it, expect } from "vitest";
import { orderUrls, docUrls, pickPublicOrigin, guestShopUrl, DEFAULT_PUBLIC_APP_URL } from "./urls";

const ORIGIN = "https://app.example.com";

describe("orderUrls", () => {
  it("builds detail/pdf/xlsx for a given order id", () => {
    const u = orderUrls(ORIGIN, "ord-123");
    expect(u.detail_url).toBe("https://app.example.com/admin/orders/ord-123");
    expect(u.pdf_url).toBe("https://app.example.com/admin/orders/ord-123?export=pdf");
    expect(u.xlsx_url).toBe("https://app.example.com/admin/orders/ord-123?export=xlsx");
  });
  it("returns nulls when origin is empty", () => {
    expect(orderUrls("", "x")).toEqual({ detail_url: null, pdf_url: null, xlsx_url: null });
  });
  it("returns nulls when id is empty", () => {
    expect(orderUrls(ORIGIN, "")).toEqual({ detail_url: null, pdf_url: null, xlsx_url: null });
  });
});

describe("docUrls", () => {
  it("uses document_no in the path when present", () => {
    const u = docUrls(ORIGIN, "doc-uuid", "QT-2025-0001");
    expect(u.detail_url).toBe("https://app.example.com/receipts?doc=QT-2025-0001");
    expect(u.pdf_url).toBe("https://app.example.com/receipts?doc=QT-2025-0001&export=pdf");
    expect(u.xlsx_url).toBe("https://app.example.com/receipts?doc=QT-2025-0001&export=xlsx");
  });
  it("falls back to id when document_no is missing", () => {
    const u = docUrls(ORIGIN, "doc-uuid");
    expect(u.detail_url).toBe("https://app.example.com/receipts");
    expect(u.pdf_url).toBe("https://app.example.com/receipts?doc=doc-uuid&export=pdf");
    expect(u.xlsx_url).toBe("https://app.example.com/receipts?doc=doc-uuid&export=xlsx");
  });
  it("url-encodes special characters in document_no", () => {
    const u = docUrls(ORIGIN, "id", "QT/2025#01");
    expect(u.detail_url).toContain("QT%2F2025%2301");
    expect(u.pdf_url).toContain("QT%2F2025%2301");
  });
  it("returns nulls when origin is empty", () => {
    expect(docUrls("", "id", "no")).toEqual({ detail_url: null, pdf_url: null, xlsx_url: null });
  });
});

describe("pickPublicOrigin", () => {
  const fakeReq = (o?: string) => ({
    headers: new Headers(o ? { origin: o } : {}),
  });
  it("uses PUBLIC_APP_URL when it is a valid URL", () => {
    const r = pickPublicOrigin("https://www.filmyynatta.com/", fakeReq("https://preview.lovable.app"));
    expect(r.source).toBe("env");
    expect(r.origin).toBe("https://www.filmyynatta.com");
  });
  it("falls back to default when PUBLIC_APP_URL is missing and logs a reason", () => {
    const r = pickPublicOrigin("", fakeReq("https://preview.lovable.app"));
    expect(r.source).toBe("default");
    expect(r.origin).toBe(DEFAULT_PUBLIC_APP_URL);
    expect(r.reason).toMatch(/PUBLIC_APP_URL/i);
  });
  it("falls back to default when PUBLIC_APP_URL is malformed", () => {
    const r = pickPublicOrigin("not-a-url", fakeReq());
    expect(r.source).toBe("default");
    expect(r.origin).toBe(DEFAULT_PUBLIC_APP_URL);
    expect(r.reason).toMatch(/falling back/i);
  });
});

describe("guestShopUrl", () => {
  it("builds a customer-facing /s/:slug update-products link", () => {
    expect(guestShopUrl("https://www.filmyynatta.com", "sabkon"))
      .toBe("https://www.filmyynatta.com/s/sabkon");
  });
  it("returns null when origin or slug missing", () => {
    expect(guestShopUrl("", "x")).toBeNull();
    expect(guestShopUrl("https://x", null)).toBeNull();
  });
  it("never accidentally points at admin or marketing pages", () => {
    const link = guestShopUrl("https://www.filmyynatta.com", "school-1")!;
    expect(link).toMatch(/\/s\//);
    expect(link).not.toMatch(/\/admin/);
    expect(link).not.toMatch(/lovable\.app$/);
  });
});