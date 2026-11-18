import { test, expect, Page } from '@playwright/test';

const HARNESS = '/dev/print-harness';

async function openSettings(page: Page) {
  await page.goto(HARNESS);
  // Panel initial state: settings closed. Toggle it via keyboard.
  const btn = page.getByTestId('open-print-settings');
  await btn.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('receipt-10x7-panel')).toBeVisible();
}

test.describe('Receipt 10×7 cm print settings', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      try {
        localStorage.removeItem('film_shop_receipt_10x7_prefs_v1');
        localStorage.removeItem('film_shop_receipt_10x7_presets_v1');
        localStorage.removeItem('film_shop_receipt_10x7_active_v1');
      } catch {}
    });
  });

  test('keyboard-opens settings and exposes the 10×7 panel', async ({ page }) => {
    await openSettings(page);
    // aria-expanded flips true.
    await expect(page.getByTestId('open-print-settings')).toHaveAttribute('aria-expanded', 'true');
    // Settings container gets focus for keyboard users.
    const focusedRole = await page.evaluate(() => document.activeElement?.getAttribute('role'));
    expect(focusedRole).toBe('region');
  });

  test('orientation toggle updates preview + aria-pressed', async ({ page }) => {
    await openSettings(page);
    await page.getByTestId('orient-landscape').click();
    await expect(page.getByTestId('orient-landscape')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-receipt-orientation="landscape"]')).toBeVisible();
  });

  test('margin input updates preview padding', async ({ page }) => {
    await openSettings(page);
    const top = page.getByTestId('margin-top');
    await top.fill('5');
    await top.blur();
    const padTop = await page
      .locator('[data-receipt-orientation]')
      .evaluate((el) => (el as HTMLElement).style.paddingTop);
    expect(padTop).toBe('5mm');
  });

  test('fit-mode "ขนาดจริง" flips data attribute', async ({ page }) => {
    await openSettings(page);
    await page.getByTestId('fit-actual').click();
    await expect(page.getByTestId('fit-actual')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-receipt-fitmode="actual"]')).toBeVisible();
  });

  test('preset save + reload persists and re-selects', async ({ page }) => {
    await openSettings(page);
    await page.getByTestId('orient-landscape').click();
    page.once('dialog', (d) => d.accept('EPSON TM-T82'));
    await page.getByTestId('preset-save').click();
    await expect(page.getByTestId('preset-select')).toContainText('EPSON TM-T82');
    // Reload — preset list + active id persist.
    await page.reload();
    // Re-open settings after reload.
    await page.getByTestId('open-print-settings').click();
    await expect(page.getByTestId('preset-select')).toContainText('EPSON TM-T82');
  });

  test('sample print triggers a print window with 10×7 @page rule', async ({ page }) => {
    await openSettings(page);
    await page.evaluate(() => {
      (window as any).__printCalled = 0;
      (window as any).__printDoc = '';
      const origOpen = window.open;
      (window as any).open = () => {
        const fake = {
          document: {
            _html: '',
            write(s: string) { (this as any)._html += s; (window as any).__printDoc += s; },
            close() {},
          },
          onload: null as null | (() => void),
          print() { (window as any).__printCalled++; },
          close() {},
        };
        setTimeout(() => { try { fake.onload && fake.onload(); } catch {} }, 0);
        return fake as any;
      };
      (window as any).__origOpen = origOpen;
    });
    await page.getByTestId('sample-print').click();
    await page.waitForTimeout(150);
    const calls = await page.evaluate(() => (window as any).__printCalled);
    const doc = await page.evaluate(() => (window as any).__printDoc as string);
    expect(calls).toBeGreaterThanOrEqual(1);
    expect(doc).toContain('100mm 70mm');
  });

  test('shop route does NOT expose the 10×7 print settings button', async ({ page }) => {
    const resp = await page.goto('/shop', { waitUntil: 'domcontentloaded' });
    // Route may redirect to login/link — either way, no film-shop print settings surface here.
    expect(resp?.status()).toBeLessThan(500);
    await expect(page.getByTestId('open-print-settings')).toHaveCount(0);
    await expect(page.getByTestId('receipt-10x7-panel')).toHaveCount(0);
  });
});