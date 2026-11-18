import { describe, it, expect, beforeEach } from "vitest";
import { parkBill, loadParkedBills } from "../parkedBills";
import type { ParkedCartLine } from "../parkedBills";

const line = (over: Partial<ParkedCartLine> = {}): ParkedCartLine => ({
  product_id: "p1",
  name: "ปากกาลูกลื่น",
  unit: "ด้าม",
  unit_price: 12,
  qty: 2,
  stock: 10,
  variant_id: null,
  variant_label: null,
  sku: null,
  image_url: "https://cdn.test/pen.jpg",
  base_id: null,
  ratio: null,
  ...over,
});

describe("parked bill cart persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps the thumbnail and name of every line across park → reload → restore", () => {
    parkBill({ label: "บิล 1", lines: [line()], discount: 0, customer: null });
    const [bill] = loadParkedBills();
    expect(bill.lines[0].image_url).toBe("https://cdn.test/pen.jpg");
    expect(bill.lines[0].name).toBe("ปากกาลูกลื่น");
  });

  it("tolerates legacy bills stored without an image field", () => {
    const legacy = { ...line() } as Record<string, unknown>;
    delete legacy.image_url;
    parkBill({
      label: "บิลเก่า",
      lines: [legacy as unknown as ParkedCartLine],
      discount: 0,
      customer: null,
    });
    const [bill] = loadParkedBills();
    expect(bill.lines[0].image_url).toBeUndefined();
    expect(bill.lines[0].name).toBe("ปากกาลูกลื่น");
  });
});
