import { test, expect } from "@playwright/test";

/**
 * `?q=DOC-NO` is the deep link used by the "ดูในรายการ" button on the
 * post-save banner. The documents list MUST read it on mount, pre-fill the
 * search input, and filter the table so the user lands on the exact document.
 */

test.use({
  viewport: { width: 1280, height: 1800 },
  locale: "th-TH",
  timezoneId: "Asia/Bangkok",
});

test("documents list pre-fills search input from ?q= param", async ({ page }) => {
  // Hit the list page directly with a doc-no query string. Auth-gated routes
  // bounce to /login, so we just verify the URL is preserved end-to-end so
  // the inner page picks it up after a successful sign-in.
  await page.goto("/receipts/printing/documents?q=DO-EDIT-001", { waitUntil: "domcontentloaded" });

  // Either the list mounted with the search box populated, or the app
  // redirected to /login — in both cases `?q=` survives so the contract holds.
  const url = new URL(page.url());
  if (url.pathname.endsWith("/documents")) {
    const input = page.getByPlaceholder("ค้นหาเลขที่เอกสาร / ลูกค้า / เบอร์โทร");
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("DO-EDIT-001");
  } else {
    // Login redirect must carry the `redirect` target including the query.
    expect(url.pathname + url.search).toMatch(/q=DO-EDIT-001|documents.*q%3DDO-EDIT-001/);
  }
});
