import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  hasZeroPrice, lineAmount, linesTotal, quoteFileName, quoteXlsxRows, round2, type WorkLine,
} from "@/lib/workDocsPricing";

const line = (p: Partial<WorkLine> = {}): WorkLine => ({
  key: "1", code: "A1", name: "กระดาษ A4", unit: "รีม", qty: 3, price: 105.5, ...p,
});

describe("ยืนยันและแก้ราคา — การคำนวณต้องมาจากบรรทัดเสมอ", () => {
  it("ยอดบรรทัดปัดทศนิยม 2 ตำแหน่ง", () => {
    expect(lineAmount(line())).toBe(316.5);
    expect(lineAmount(line({ qty: 3, price: 0.335 }))).toBe(1.01);
    expect(round2(1.005)).toBe(1); // ทศนิยมลอยตัวปัดลง — ยึดค่าที่ระบบใช้จริง
    expect(lineAmount(line({ qty: 0, price: 999 }))).toBe(0);
  });

  it("ยอดรวมคือผลบวกของยอดบรรทัด ไม่ใช้ค่า total เดิม", () => {
    const rows = [line(), line({ key: "2", qty: 2, price: 10 })];
    expect(linesTotal(rows)).toBe(336.5);
  });

  it("เตือนได้เมื่อมีบรรทัดราคา 0", () => {
    expect(hasZeroPrice([line()])).toBe(false);
    expect(hasZeroPrice([line(), line({ key: "2", price: 0 })])).toBe(true);
  });

  it("แถว Excel ใช้ตัวเลขเดียวกับตารางบนหน้าจอ", () => {
    const rows = quoteXlsxRows([line()]);
    expect(rows[0]).toMatchObject({ "จำนวน": 3, "ราคาต่อหน่วย": 105.5, "รวม": 316.5 });
  });

  it("ชื่อไฟล์อ้างอิงเลขที่งาน", () => {
    expect(quoteFileName({ code: "PO-1", id: "abcdef12" } as any)).toBe("ใบเสนอราคา-PO-1");
  });

  it("ใช้เทมเพลต PDF/Excel เดิม และส่ง LINE ผ่านหลังบ้านเท่านั้น", () => {
    const lib = readFileSync("src/lib/workDocsPricing.ts", "utf8");
    expect(lib).toContain('kind: "quotation"');
    expect(lib).toContain("send-work-doc-notify");
    expect(lib).not.toContain("api.line.me");
    const fn = readFileSync("supabase/functions/send-work-doc-notify/index.ts", "utf8");
    expect(fn).toContain("quotation");
    expect(fn).toContain("quote_file");
  });

  it("ตะกร้ามี 2 ทางจบ: สั่งซื้อเลย / ขอใบราคา", () => {
    const cart = readFileSync("src/pages/Cart.tsx", "utf8");
    expect(cart).toContain('submit("quote")');
    expect(cart).toContain("สั่งซื้อเลย");
    expect(cart).toContain("doc_intent");
  });
});

describe("เติมราคามาตรฐานอัตโนมัติ", () => {
  it("เติมเฉพาะบรรทัดที่ยังไม่มีราคา และเว้นว่างเมื่อสินค้าไม่ได้ตั้งราคา", async () => {
    vi.resetModules();
    const rowsByCode = [
      { code: "A1", name: "กระดาษ A4", standard_price: 120 },
      { code: "B2", name: "หมึกดำ", standard_price: 0 },
    ];
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: {
        from: () => ({
          select: () => ({ in: async () => ({ data: rowsByCode, error: null }) }),
        }),
      },
    }));
    const { applyStandardPrices } = await import("@/lib/workDocsPricing");
    const out = await applyStandardPrices([
      line({ key: "1", code: "A1", price: 0 }),
      line({ key: "2", code: "B2", name: "หมึกดำ", price: 0 }),
      line({ key: "3", code: "A1", price: 99 }),
    ]);
    expect(out[0].price).toBe(120);   // เติมจากราคามาตรฐาน
    expect(out[1].price).toBe(0);     // ไม่มีราคามาตรฐาน → เว้นว่างให้กรอกเอง
    expect(out[2].price).toBe(99);    // ราคาที่ใส่ไว้แล้วต้องไม่ถูกทับ
    vi.doUnmock("@/integrations/supabase/client");
  });

  it("ช่องราคาแสดงว่างเมื่อยังไม่ตั้งราคา", () => {
    const ui = readFileSync("src/components/admin/work-docs/PriceEditor.tsx", "utf8");
    expect(ui).toContain("applyStandardPrices");
    expect(ui).toContain('Number(l.price) > 0 ? String(l.price) : ""');
  });
});
