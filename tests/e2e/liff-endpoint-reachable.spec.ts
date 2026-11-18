import { test, expect } from "@playwright/test";

// Guards against silent /l/shop 404s. Runs against the dev server; each URL
// must return an HTML shell with #root so the SPA can bootstrap.
const paths = [
  "/l/shop",
  "/l/shop?liff.state=%2Fshop",
  "/l/link",
];

for (const path of paths) {
  test(`LIFF endpoint reachable: ${path}`, async ({ page }) => {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response, `no response for ${path}`).not.toBeNull();
    expect(response!.status(), `HTTP ${response!.status()} for ${path}`).toBeLessThan(400);
    const html = await page.content();
    expect(html).toContain("id=\"root\"");
  });
}