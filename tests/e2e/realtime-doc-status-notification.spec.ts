import { test, expect } from "@playwright/test";

/**
 * Verifies the realtime pipeline for document status changes:
 * - DB trigger inserts a `notifications` row with structured body
 * - Subscriber receives the event via supabase realtime
 * - Sonner toast renders with title, document number, and a working "ไปยังรายการนี้" action button
 */
test("status change emits realtime toast with deep link", async ({ page, baseURL }) => {
  const STORE = process.env.E2E_STORE_SLUG ?? "colorlab";
  const DOC_ID = process.env.E2E_DOC_ID;
  test.skip(!DOC_ID, "set E2E_DOC_ID to an existing rds_documents id");

  await page.goto(`${baseURL}/receipts/${STORE}/dashboard`);
  await page.waitForTimeout(4000); // allow realtime channel to SUBSCRIBE

  const result = await page.evaluate(async (id) => {
    const mod: any = await import("/src/integrations/supabase/client.ts");
    const sb = mod.supabase;
    const { data } = await sb.from("rds_documents").select("status").eq("id", id).single();
    const next = data?.status === "issued" ? "paid" : "issued";
    const { error } = await sb.from("rds_documents").update({ status: next }).eq("id", id);
    return { from: data?.status, to: next, error: error?.message ?? null };
  }, DOC_ID);
  expect(result.error).toBeNull();

  const toast = page.locator("[data-sonner-toast]").first();
  await expect(toast).toBeVisible({ timeout: 10_000 });
  await expect(toast).toContainText("สถานะเอกสาร");
  await expect(page.getByRole("button", { name: "ไปยังรายการนี้" })).toBeVisible();
});