// Guards the "stock_movements is the only mutation path" invariant.
// These are source-level contract tests: they fail loudly if someone
// re-introduces a direct `products.stock` / `product_variants.stock` write.
import { describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { buildVariantSyncPayload } from "../../supabase/functions/_shared/myshop";

describe("product form never writes stock directly on update", () => {
  it("routes stock edits through pos_adjust_stock", async () => {
    const src = await readFile("src/lib/productSave.ts", "utf8");
    expect(src).toContain('p_mode: "set"');
    expect(src).toContain("pos_adjust_stock");
    // stock is only part of the INSERT payload (opening balance), never UPDATE
    expect(src).not.toMatch(/stock:\s*Number\(v\.stock \?\? 0\),/);
    expect(src).toContain("payload.stock = Number(v.stock ?? 0);");
  });

  it("skips wrapper products (their stock is derived from the base)", async () => {
    const src = await readFile("src/lib/productSave.ts", "utf8");
    expect(src).toContain("product_unit_links");
  });
});

describe("purchase order receiving", () => {
  it("uses the central RPC with an idempotency key, not a direct update", async () => {
    const src = await readFile("src/pages/admin/Purchases.tsx", "utf8");
    expect(src).toContain("pos_adjust_stock");
    expect(src).toContain("p_idempotency_key");
    expect(src).not.toMatch(/from\("products"\)\.update\(\{ stock/);
    expect(src).not.toMatch(/from\("stock_movements"\)\.insert/);
  });
});

describe("myshop-stock-sync worker", () => {
  it("claims from the outbox and pushes absolute stock only", async () => {
    const src = await readFile("supabase/functions/myshop-stock-sync/index.ts", "utf8");
    expect(src).toContain("myshop_stock_claim");
    expect(src).toContain("myshop_stock_complete");
    expect(src).toContain("syncStock: true");
    expect(src).toContain("syncPrice: false");
    expect(src).not.toContain("/adjust");
    expect(src).not.toContain("/prices");
  });

  it("builds a stock-only variant payload", () => {
    const plan = buildVariantSyncPayload({ myshopVariantId: "42", stock: 7, syncPrice: false, syncStock: true });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.payload).toEqual({ inventoryId: 42, onHandNumber: 7 });
      expect(plan.payload).not.toHaveProperty("price");
    }
  });

  it("never guesses a missing MyShop variant id", () => {
    expect(buildVariantSyncPayload({ myshopVariantId: null, stock: 3, syncPrice: false, syncStock: true }).ok).toBe(false);
  });
});

describe("myshop_stock_claim SQL (regression: ambiguous \"id\")", () => {
  it("qualifies every id reference in the newest claim definition", async () => {
    const dir = "supabase/migrations";
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    const withClaim: string[] = [];
    for (const f of files) {
      const sql = await readFile(`${dir}/${f}`, "utf8");
      if (/FUNCTION\s+public\.myshop_stock_claim/i.test(sql)) withClaim.push(sql);
    }
    expect(withClaim.length).toBeGreaterThan(0);
    const latest = withClaim[withClaim.length - 1];
    // Output columns of RETURNS TABLE shadow bare column names inside the body,
    // so `IN (SELECT id FROM ...)` / `SELECT id FROM ...` must never appear.
    expect(latest).not.toMatch(/SELECT\s+id\s+FROM/i);
    expect(latest).not.toMatch(/\bIN\s*\(\s*SELECT\s+id\b/i);
    expect(latest).toMatch(/o\.id\s+AS\s+outbox_id/i);
    expect(latest).toMatch(/FOR UPDATE OF o SKIP LOCKED/i);
  });
});

describe("myshop_apply_order_stock partial-safety contract", () => {
  async function latestApplyOrderStockSql() {
    const dir = "supabase/migrations";
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    let latest = "";
    for (const f of files) {
      const sql = await readFile(`${dir}/${f}`, "utf8");
      if (/FUNCTION\s+public\.myshop_apply_order_stock/i.test(sql)) latest = sql;
    }
    expect(latest).not.toBe("");
    return latest;
  }

  it("only flags fully deducted when no eligible line is missing a deduct movement", async () => {
    const sql = await latestApplyOrderStockSql();
    expect(sql).toMatch(/stock_deducted\s*=\s*v_full/i);
    expect(sql).not.toMatch(/SET stock_deducted\s*=\s*true/i);
    expect(sql).toMatch(/:deduct:'\s*\|\|\s*oi\.id::text/);
    expect(sql).toMatch(/'fully_deducted'/);
  });

  it("retries only the lines without a deduct movement", async () => {
    const sql = await latestApplyOrderStockSql();
    expect(sql).toMatch(/idempotency_key\s*=\s*v_deduct_key/i);
    expect(sql).toMatch(/CONTINUE;/);
  });

  it("restores per-line without requiring the global stock_deducted flag", async () => {
    const sql = await latestApplyOrderStockSql();
    expect(sql).not.toMatch(/NOT r\.stock_deducted/);
    expect(sql).toMatch(/:restore:'\s*\|\|\s*oi\.id::text/);
    expect(sql).toMatch(/stock_restored\s*=\s*v_full/i);
    expect(sql).toMatch(/'fully_restored'/);
  });

  it("reports movements and blocked counts", async () => {
    const sql = await latestApplyOrderStockSql();
    expect(sql).toMatch(/'movements'\s*,\s*v_count/);
    expect(sql).toMatch(/'blocked'\s*,\s*v_blocked/);
  });
});
