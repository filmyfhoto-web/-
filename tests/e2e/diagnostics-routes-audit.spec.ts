import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

for (const vp of VIEWPORTS) {
  test.describe(`route audit — ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("shows version, environment and zero failing menus", async ({ page }) => {
      await page.goto("/diagnostics/routes");
      await expect(page.getByTestId("diag-routes-page")).toBeVisible();
      const summary = await page.getByTestId("diag-routes-summary").innerText();
      expect(summary).toContain("ไม่ผ่าน 0");
      await expect(page.getByTestId("diag-routes-customer")).toBeVisible();
      await expect(page.getByTestId("diag-routes-admin")).toBeVisible();
      await expect(page.getByText(/เวอร์ชัน v\d+\.\d+\.\d+/)).toBeVisible();
    });

    test("device filter narrows the audit table", async ({ page }) => {
      await page.goto("/diagnostics/routes");
      await page.getByTestId(`diag-routes-filter-${vp.name}`).click();
      await expect(page.getByTestId("diag-routes-shared")).toBeVisible();
    });
  });
}

test("diagnostics reports live connection health and links to the audit", async ({ page }) => {
  await page.goto("/diagnostics");
  await expect(page.getByTestId("diag-health")).toBeVisible();
  for (const id of ["internet", "api", "database", "auth", "realtime"]) {
    await expect(page.getByTestId(`diag-health-${id}`)).toBeVisible({ timeout: 15000 });
  }
  await page.getByTestId("diag-routes-link").click();
  await expect(page).toHaveURL(/\/diagnostics\/routes$/);
});

test("dev and published builds both expose /version.json", async ({ request }) => {
  const res = await request.get("/version.json");
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(typeof json.tag).toBe("string");
  expect(json.tag.length).toBeGreaterThan(0);
});