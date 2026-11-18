import { test, expect, devices } from "@playwright/test";

/**
 * Verifies /l/shop keeps working as the LINE Login (web / desktop) and
 * LIFF (in-app / mobile) return URL after the domain migration to
 * filmyynatta.com. Each case must:
 *   - respond with HTTP < 400
 *   - render the SPA shell (#root)
 *   - not throw an uncaught error in the browser
 *
 * We do NOT drive the real LINE OAuth flow — that requires a live LIFF
 * app and a real Channel. We only assert the return-URL contract that
 * both flows depend on: the page must load and mount without a 404.
 */

type Case = { name: string; path: string };

const cases: Case[] = [
  { name: "plain /l/shop", path: "/l/shop" },
  { name: "web login return (?next=)", path: "/l/shop?next=%2Fshop" },
  { name: "web login return (?code&state)", path: "/l/shop?code=stub&state=stub" },
  { name: "LIFF redirect (?liff.state)", path: "/l/shop?liff.state=%2Fshop" },
  { name: "LIFF hash id_token", path: "/l/shop#access_token=stub&id_token=stub" },
];

const viewports = [
  { label: "desktop", viewport: { width: 1280, height: 800 } },
  { label: "mobile", viewport: devices["iPhone 13"].viewport },
];

for (const vp of viewports) {
  test.describe(`LINE return URL — ${vp.label}`, () => {
    test.use({ viewport: vp.viewport });

    for (const c of cases) {
      test(`${c.name}`, async ({ page }) => {
        const uncaught: string[] = [];
        page.on("pageerror", (e) => uncaught.push(String(e?.message || e)));

        const res = await page.goto(c.path, { waitUntil: "domcontentloaded" });
        expect(res, `no response for ${c.path}`).not.toBeNull();
        expect(res!.status(), `HTTP ${res!.status()}`).toBeLessThan(400);

        const html = await page.content();
        expect(html).toContain('id="root"');

        // Wait for React to mount something inside #root.
        await page.waitForFunction(
          () => !!document.querySelector("#root")?.firstElementChild,
          null,
          { timeout: 10_000 },
        );

        expect(uncaught, `uncaught errors: ${uncaught.join(" | ")}`).toEqual([]);
      });
    }
  });
}