import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ล็อกเส้นทาง LIFF — /l/shop ถูกลงทะเบียนไว้ที่ LINE Developers Console
 * ถ้าย้าย path หรือเปลี่ยน endpoint เมื่อไหร่ LINE login พังทันที
 * เทสต์ชุดนี้จะ fail เพื่อกันการแก้โดยไม่ตั้งใจ
 */
const read = (p: string) => readFileSync(p, "utf8");
const CANONICAL = "https://filmyynatta.com/l/shop";

describe("LIFF endpoint lock", () => {
  it("route /l/shop ยังอยู่ที่เดิมและชี้ไปหน้า LiffShop", () => {
    const app = read("src/App.tsx");
    const line = app.split("\n").find((l) => l.includes('path="/l/shop"'))!;
    expect(line).toBeTruthy();
    expect(line).toContain("LiffShop");
    expect(app).toContain('import("./pages/LiffShop.tsx")');
  });

  it("endpoint canonical ต้องเป็น https://filmyynatta.com/l/shop", () => {
    const src = read("src/pages/LiffShop.tsx");
    expect(src).toContain(`CANONICAL_LIFF_ENDPOINT = "${CANONICAL}"`);
    expect(src).toContain('url.pathname !== "/l/shop"');
  });

  it("ฝั่งเซิร์ฟเวอร์ตรวจ endpoint ด้วย path เดียวกัน", () => {
    const files = ["supabase/functions/line-liff-check/index.ts", "supabase/functions/line-endpoint-monitor/index.ts"];
    for (const f of files) {
      let src = "";
      try { src = read(f); } catch { continue; }
      expect(src).toContain("/l/shop");
    }
  });
});
