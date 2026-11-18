import { test, expect, type Page } from "@playwright/test";
import { openRegister, scanOneItem, noHorizontalOverflow } from "./posRegisterFixture";

/**
 * Every POS dialog must stay operable on a short phone: the primary action has
 * to remain inside the viewport (sticky footer) while overflowing content
 * scrolls in the body. Asserted on real bounding boxes at 390x667 — the
 * smallest screen the shop actually uses.
 */
const VP = { width: 390, height: 667 };

/** The action must be fully on screen and tappable (>=44px touch target). */
async function assertActionOnScreen(page: Page, testid: string) {
  const el = page.getByTestId(testid);
  await expect(el).toBeVisible();
  await page.waitForTimeout(400); // radix open animation settles
  const r = await el.evaluate((n) => {
    const b = n.getBoundingClientRect();
    return { top: b.top, bottom: b.bottom, height: b.height };
  });
  expect(r.top).toBeGreaterThanOrEqual(0);
  expect(r.bottom).toBeLessThanOrEqual(VP.height + 1);
  expect(r.height).toBeGreaterThanOrEqual(36);
}

/** The dialog itself must never exceed the viewport height. */
async function assertFitsViewport(page: Page, testid: string) {
  const r = await page.getByTestId(testid).evaluate((n) => {
    const b = n.getBoundingClientRect();
    return { top: b.top, height: b.height };
  });
  expect(r.height).toBeLessThanOrEqual(VP.height + 1);
  expect(r.top).toBeGreaterThanOrEqual(-1);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(VP);
  await openRegister(page);
});

test("customer dialog: body scrolls, save button stays on screen", async ({ page }) => {
  await page.getByTestId("pos-customer-btn").click();
  await assertFitsViewport(page, "pos-customer-dialog");
  await expect(page.getByTestId("pos-customer-body")).toBeVisible();
  await assertActionOnScreen(page, "pos-customer-save");
  await noHorizontalOverflow(page, VP.width);
});

test("parked bills dialog fits the phone", async ({ page }) => {
  await page.getByTestId("pos-held-btn").click();
  await assertFitsViewport(page, "pos-parked-dialog");
  await noHorizontalOverflow(page, VP.width);
});

test("payment dialog: confirm button pinned above the fold with a real cart", async ({ page }) => {
  await scanOneItem(page);
  await page.getByTestId("pos-mobile-checkout").click();
  await assertFitsViewport(page, "pos-payment-calc");
  await assertActionOnScreen(page, "pos-pay-confirm");
  await noHorizontalOverflow(page, VP.width);
});

test("all four payment methods are selectable (no fake mixed payment)", async ({ page }) => {
  await scanOneItem(page);
  await page.getByTestId("pos-mobile-checkout").click();
  for (const m of ["cash", "transfer", "qr", "card"]) {
    const btn = page.getByTestId(`pos-pay-method-${m}`);
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(btn).toHaveAttribute("data-selected", "true");
  }
  await expect(page.getByTestId("pos-pay-method-mixed")).toHaveCount(0);
});
