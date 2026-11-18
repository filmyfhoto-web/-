import { describe, it, expect } from "vitest";
import { queryKeyMatchesTables, tokensForTable } from "../realtimeTargets";

describe("realtime targeting", () => {
  it("matches document queries when rds_documents changes", () => {
    expect(queryKeyMatchesTables(["rds_docs", "store-1"], ["rds_documents"])).toBe(true);
    expect(queryKeyMatchesTables(["rds_dashboard_docs", "s"], ["rds_documents"])).toBe(true);
  });

  it("does not invalidate unrelated queries", () => {
    expect(queryKeyMatchesTables(["rds_products_list", "s"], ["rds_documents"])).toBe(false);
    expect(queryKeyMatchesTables(["line_login_logs"], ["stock_movements"])).toBe(false);
  });

  it("matches product and category queries", () => {
    expect(queryKeyMatchesTables(["pos_products", "s"], ["rds_products"])).toBe(true);
    expect(queryKeyMatchesTables(["rds_categories_list", "s"], ["rds_categories"])).toBe(true);
    expect(queryKeyMatchesTables(["rds_products_list", "s"], ["stock_movements"])).toBe(true);
  });

  it("matches customer job requests to job/dashboard keys", () => {
    expect(queryKeyMatchesTables(["film_job_requests"], ["film_job_requests"])).toBe(true);
    expect(queryKeyMatchesTables(["rds_dashboard_counts", "s"], ["film_job_requests"])).toBe(true);
  });

  it("derives singular and prefix-free tokens", () => {
    expect(tokensForTable("rds_products")).toContain("product");
    expect(tokensForTable("orders")).toContain("order");
  });

  it("ignores non-string key parts", () => {
    expect(queryKeyMatchesTables([{ scope: "docs" }, 5], ["rds_documents"])).toBe(false);
  });
});
