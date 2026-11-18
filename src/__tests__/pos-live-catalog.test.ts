import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { POS_LIVE_TABLES } from "@/hooks/usePosLiveCatalog";

const read = (p: string) => readFileSync(p, "utf8");

describe("POS realtime catalog", () => {
  it("watches every table that changes price/stock/variants", () => {
    expect([...POS_LIVE_TABLES]).toEqual([
      "products",
      "product_variants",
      "product_unit_links",
      "stock_movements",
    ]);
  });

  it("cleans up the channel and the listeners", () => {
    const src = read("src/hooks/usePosLiveCatalog.ts");
    expect(src).toContain("supabase.removeChannel");
    expect(src).toContain('removeEventListener("focus"');
    expect(src).toContain('removeEventListener("visibilitychange"');
    expect(src).toContain("clearInterval");
  });

  it("is wired into both POS surfaces with a live indicator", () => {
    for (const file of ["src/pages/pos/PosRegister.tsx", "src/pages/pos/CentralPOS.tsx"]) {
      const src = read(file);
      expect(src).toContain("usePosLiveCatalog(reload)");
      expect(src).toContain('data-testid="pos-live-status"');
    }
  });
});
