import { test, expect } from "@playwright/test";

test.describe("POS หน้าร้าน PWA", () => {
  test("serves its own manifest and 🏪 icons", async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/manifest-pos.webmanifest`);
    expect(res.status()).toBe(200);
    const m = JSON.parse(await res.text());
    expect(m.name).toContain("POS หน้าร้าน");
    expect(m.short_name).toBe("POS หน้าร้าน");
    expect(m.start_url).toContain("/launch?app=pos");
    expect(m.id).not.toBe("/launch?app=staff");
    expect(m.display).toBe("standalone");
    const sizes = (m.icons as { sizes: string; purpose?: string }[]).map((i) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(m.icons.some((i: { purpose?: string }) => (i.purpose ?? "").includes("maskable"))).toBe(true);

    for (const icon of m.icons as { src: string }[]) {
      const r = await request.get(`${baseURL}${icon.src.split("?")[0]}`);
      expect(r.status(), icon.src).toBe(200);
    }
    const apple = await request.get(`${baseURL}/icons/pos-apple-touch.png`);
    expect(apple.status()).toBe(200);
  });

  test("does not collide with staff/admin manifests", async ({ request, baseURL }) => {
    const read = async (f: string) => JSON.parse(await (await request.get(`${baseURL}/${f}`)).text());
    const [pos, staff, admin] = await Promise.all([
      read("manifest-pos.webmanifest"),
      read("manifest-staff.webmanifest"),
      read("manifest-admin.webmanifest"),
    ]);
    const ids = [pos.id, staff.id, admin.id];
    expect(new Set(ids).size).toBe(3);
    expect(new Set([pos.theme_color, staff.theme_color, admin.theme_color]).size).toBe(3);
    expect(new Set([pos.name, staff.name, admin.name]).size).toBe(3);
    const iconSrc = (m: { icons: { src: string }[] }) => m.icons[0].src;
    expect(new Set([iconSrc(pos), iconSrc(staff), iconSrc(admin)]).size).toBe(3);
  });

  test("signed-out visitors cannot open the register", async ({ page }) => {
    await page.goto("/pos/register");
    // Never wait for `networkidle` here: the app holds long-lived sockets
    // (HMR in dev, realtime in prod) so the network never goes idle and the
    // test times out instead of asserting. Wait for the guard's redirect.
    await page.waitForURL((url) => !url.pathname.startsWith("/pos/register"), { timeout: 15000 });
    await expect(page.getByTestId("pos-register")).toHaveCount(0);
    expect(page.url()).toContain("/staff/login");
  });

  test("portal offers the POS entry alongside staff and admin", async ({ page }) => {
    await page.goto("/portal");
    await expect(page.getByTestId("portal-pos")).toBeVisible();
    await expect(page.getByTestId("portal-pos")).toContainText("POS หน้าร้าน");
  });
});

test("portal shows the 🏪 POS card that launches the register app", async ({ page }) => {
  await page.goto("/portal");
  const card = page.getByTestId("portal-pos");
  await expect(card).toBeVisible();
  await expect(card).toContainText("เปิด POS");
  await expect(page.getByTestId("portal-pos-badge")).toContainText("v1.1.13");
  await expect(card).toHaveAttribute("href", "/launch?app=pos");
  await card.click();
  await page.waitForURL(/\/staff\?|\/pos\/register/, { timeout: 20_000 });
});
