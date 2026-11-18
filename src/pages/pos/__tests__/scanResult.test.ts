import { describe, it, expect } from "vitest";
import {
  acceptScanResult,
  classifyScan,
  pickScanImage,
  scanDisplayPrice,
  toScanResultView,
  type ScanProductLike,
} from "../scanResult";
import type { VariantSummary } from "../variantPicker";

const P = (o: Partial<ScanProductLike> & { id: string; name: string }): ScanProductLike => ({
  code: null, barcode: null, standard_price: 10, stock: 5, unit: "ชิ้น",
  image_url: null, active: true, has_variants: false, ...o,
});
const V = (o: Partial<VariantSummary> & { id: string; product_id: string }): VariantSummary => ({
  sku: null, barcode: null, name: null, attributes: {}, price: null, price_override: null,
  stock: 3, active: true, archived_at: null, image_url: null, ...o,
} as VariantSummary);

describe("classifyScan", () => {
  it("adds a normal product scanned by barcode", () => {
    const p = P({ id: "p1", name: "ปากกา", barcode: "8850001" });
    const r = classifyScan("8850001", [p], []);
    expect(r.status).toBe("added");
    expect(r.product?.id).toBe("p1");
    expect(r.variant).toBeNull();
  });

  it("matches by product code too", () => {
    const p = P({ id: "p1", name: "ปากกา", code: "FY-001" });
    expect(classifyScan("fy-001", [p], []).status).toBe("added");
  });

  it("adds the exact SKU variant without the picker", () => {
    const p = P({ id: "p1", name: "สมุด", has_variants: true });
    const v = V({ id: "v1", product_id: "p1", sku: "SKU-A", barcode: "999" });
    const r = classifyScan("999", [p], [v]);
    expect(r.status).toBe("added");
    expect(r.variant?.id).toBe("v1");
  });

  it("opens the variant picker when the parent code needs a choice", () => {
    const p = P({ id: "p1", name: "สมุด", barcode: "111", has_variants: true });
    const vs = [V({ id: "v1", product_id: "p1" }), V({ id: "v2", product_id: "p1" })];
    const r = classifyScan("111", [p], vs);
    expect(r.status).toBe("variant_required");
    expect(r.variant).toBeNull();
    expect(r.message).toContain("สมุด");
  });

  it("auto-picks when only one sellable variant exists", () => {
    const p = P({ id: "p1", name: "สมุด", barcode: "111", has_variants: true });
    const vs = [V({ id: "v1", product_id: "p1" }), V({ id: "v2", product_id: "p1", active: false })];
    expect(classifyScan("111", [p], vs).variant?.id).toBe("v1");
  });

  it("reports unknown barcodes in Thai including the code and keeps product null", () => {
    const r = classifyScan("404404", [P({ id: "p1", name: "ปากกา", barcode: "1" })], []);
    expect(r.status).toBe("not_found");
    expect(r.product).toBeNull();
    expect(r.message).toContain("404404");
    expect(r.message).toMatch(/ไม่พบสินค้า/);
  });

  it("flags out-of-stock products but still exposes name/image", () => {
    const p = P({ id: "p1", name: "ยางลบ", barcode: "22", stock: 0, image_url: "u.jpg" });
    const r = classifyScan("22", [p], []);
    expect(r.status).toBe("unavailable");
    expect(r.message).toMatch(/หมดสต๊อก/);
    expect(toScanResultView(r, 1).imageUrl).toBe("u.jpg");
  });

  it("flags disabled products and disabled variants", () => {
    const p = P({ id: "p1", name: "ไม้บรรทัด", barcode: "33", active: false });
    expect(classifyScan("33", [p], []).status).toBe("unavailable");
    const p2 = P({ id: "p2", name: "สมุด", has_variants: true });
    const v = V({ id: "v1", product_id: "p2", barcode: "44", active: false });
    const r = classifyScan("44", [p2], [v]);
    expect(r.status).toBe("unavailable");
    expect(r.product?.name).toBe("สมุด");
  });

  it("uses the supplied effective stock resolver", () => {
    const p = P({ id: "p1", name: "กล่อง", barcode: "55", stock: 0 });
    expect(classifyScan("55", [p], [], { stockOf: () => 12 }).status).toBe("added");
  });

  it("treats an empty code as invalid", () => {
    expect(classifyScan("  ", [], []).status).toBe("invalid");
  });
});

describe("image fallback + price", () => {
  it("prefers the SKU variant image, then the parent, then null placeholder", () => {
    expect(pickScanImage({ image_url: "v.jpg" }, { image_url: "p.jpg" })).toBe("v.jpg");
    expect(pickScanImage({ image_url: null }, { image_url: "p.jpg" })).toBe("p.jpg");
    expect(pickScanImage(null, { image_url: "  " })).toBeNull();
    expect(pickScanImage(null, null)).toBeNull();
  });

  it("shows the variant override price, never a cost field", () => {
    const p = P({ id: "p1", name: "x", standard_price: 20 });
    expect(scanDisplayPrice(p, null)).toBe(20);
    const v = V({ id: "v1", product_id: "p1", price_override: 35 });
    expect(scanDisplayPrice(p, v)).toBe(35);
    const view = toScanResultView(classifyScan("", [], []), 1);
    expect(Object.keys(view)).not.toContain("cost");
  });
});

describe("acceptScanResult (stale async guard)", () => {
  const mk = (seq: number, code: string) =>
    toScanResultView(classifyScan(code, [P({ id: "p1", name: "n", barcode: code })], []), seq);

  it("keeps the newest sequence and drops late arrivals", () => {
    const first = mk(1, "aaa");
    const second = mk(2, "bbb");
    expect(acceptScanResult(first, second).code).toBe("bbb");
    expect(acceptScanResult(second, first).code).toBe("bbb");
    expect(acceptScanResult(null, first).code).toBe("aaa");
  });
});

describe("scan policy + wording", () => {
  const p = (over: Partial<ScanProductLike> = {}): ScanProductLike => ({
    id: "p1",
    name: "ปากกา",
    code: "P001",
    barcode: "8850001",
    standard_price: 12,
    stock: 0,
    unit: "ด้าม",
    image_url: null,
    active: true,
    has_variants: false,
    ...over,
  });

  it("uses the exact Thai wording with the scanned code for an unknown barcode", () => {
    const c = classifyScan("999888", [p()], []);
    expect(c.status).toBe("not_found");
    expect(c.message).toContain("ไม่พบสินค้านี้");
    expect(c.message).toContain("999888");
  });

  it("blocks a zero-stock scan under the default (no over-sell) store policy", () => {
    const c = classifyScan("8850001", [p({ stock: 0 })], []);
    expect(c.status).toBe("unavailable");
  });

  it("adds a zero-stock scan when the store policy allows negative stock", () => {
    const c = classifyScan("8850001", [p({ stock: 0 })], [], { allowNegativeStock: true });
    expect(c.status).toBe("added");
  });

  it("keeps the disabled-product rule independent of the over-sell policy", () => {
    const c = classifyScan("8850001", [p({ active: false, stock: 5 })], [], {
      allowNegativeStock: true,
    });
    expect(c.status).toBe("unavailable");
    expect(c.message).toContain("ปิดการขาย");
  });
});
