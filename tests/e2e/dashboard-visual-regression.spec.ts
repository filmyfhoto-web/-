import { test, expect, type Page } from "@playwright/test";

/**
 * Visual regression — /admin/home (แดชบอร์ดแอดมิน NATTA GROUP) และ /receipts/film (FILM SHOP)
 * จับภาพเทียบ baseline เพื่อตรวจ “ตำแหน่งเพี้ยน / สีเพี้ยน” อัตโนมัติ
 *
 * ต้องมี session พนักงาน/แอดมินจริง:
 *   E2E_STAFF_STORAGE_KEY = sb-<ref>-auth-token
 *   E2E_STAFF_SESSION_JSON = session JSON เต็ม
 * ไม่มี = ข้ามทั้งไฟล์ (ไม่ทำให้ CI แดง)
 *
 * อัปเดต baseline: bunx playwright test dashboard-visual-regression --update-snapshots
 */
const STORAGE_KEY = process.env.E2E_STAFF_STORAGE_KEY;
const SESSION_JSON = process.env.E2E_STAFF_SESSION_JSON;

test.skip(
  !STORAGE_KEY || !SESSION_JSON,
  "ต้องมี E2E_STAFF_STORAGE_KEY / E2E_STAFF_SESSION_JSON เพื่อเข้าหน้าหลังบ้าน",
);

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 960 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "mobile-390", width: 390, height: 844 },
] as const;

const PAGES = [
  { slug: "admin-home", url: "/admin/home", ready: "admin-dashboard-home" },
  { slug: "film-shop", url: "/receipts/film", ready: "film-home" },
] as const;

async function auth(page: Page) {
  await page.addInitScript(
    ([k, v]) => {
      try { localStorage.setItem(k as string, v as string); } catch { /* storage ถูกบล็อก */ }
    },
    [STORAGE_KEY!, SESSION_JSON!],
  );
}

/** ปิดสิ่งที่เปลี่ยนทุกครั้ง (เวลา/สเกเลตัน/แอนิเมชัน) ให้ภาพนิ่ง */
async function stabilize(page: Page) {
  await page.addStyleTag({
    content: `*,*::before,*::after{animation:none!important;transition:none!important}
      [data-testid$="-skeleton"],[data-testid="data-list-skeleton"],[data-testid="data-grid-skeleton"]{visibility:hidden!important}`,
  });
  await page.waitForTimeout(600);
}

for (const vp of VIEWPORTS) {
  test.describe(`visual @ ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const target of PAGES) {
      test(`${target.slug} ตรงกับ baseline`, async ({ page }) => {
        await auth(page);
        await page.goto(target.url, { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId(target.ready)).toBeVisible({ timeout: 20_000 });
        await stabilize(page);

        await expect(page).toHaveScreenshot(`${target.slug}-${vp.name}.png`, {
          fullPage: false,
          maxDiffPixelRatio: 0.02,
        });
      });
    }
  });
}
