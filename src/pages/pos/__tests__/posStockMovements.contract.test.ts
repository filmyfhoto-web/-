import { describe, it, expect } from "vitest";
import fs from "node:fs";

const read = (p: string) => fs.readFileSync(p, "utf8");

/**
 * POS ต้องตัดสต๊อก + บันทึกประวัติการเคลื่อนไหวอัตโนมัติเสมอ
 * โดยผ่าน RPC `pos_checkout` เท่านั้น (ฝั่ง DB เขียน stock_movements ให้)
 * ห้ามมีการเขียน products.stock ตรง ๆ จากหน้าจอขาย
 */
describe("POS → stock movements", () => {
  const surfaces = ["src/pages/pos/PosRegister.tsx", "src/pages/pos/CentralPOS.tsx"];

  it("ทุกหน้าขายเรียก pos_checkout", () => {
    for (const f of surfaces) expect(read(f)).toContain('rpc("pos_checkout"');
  });

  it("ไม่มีการอัปเดตสต๊อกตรงจากหน้าจอขาย", () => {
    for (const f of surfaces) {
      const src = read(f);
      expect(src).not.toMatch(/from\("products"\)[\s\S]{0,80}\.update\(\s*\{[^}]*stock/);
    }
  });

  it("มีหน้าประวัติการเคลื่อนไหวสต๊อกในเส้นทางระบบ", () => {
    const app = read("src/App.tsx");
    expect(app).toContain("PosMovements");
    expect(app).toContain('path="movements"');
  });
});
