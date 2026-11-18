import type { Page } from "@playwright/test";

/**
 * Wait for a page to be visually quiescent before taking a screenshot or
 * DOM snapshot. Combines:
 *  - `document.fonts.ready` so glyph metrics are final (otherwise Thai
 *    text reflows after webfont swap and snapshots flake).
 *  - Two `requestAnimationFrame` ticks to flush React commits + style
 *    recalcs that ran on mount.
 *  - All running CSS animations / transitions cancelled — belt + braces
 *    on top of Playwright's `animations: "disabled"`.
 *  - Caret hidden (matches the screenshot config) so focused inputs don't
 *    blink between webkit and chromium.
 */
export async function settleForSnapshot(page: Page): Promise<void> {
  await page.evaluate(async () => {
    // Cancel any in-flight CSS animations / transitions.
    document.getAnimations?.().forEach((a) => {
      try { a.cancel(); } catch { /* ignore */ }
    });
    if ((document as any).fonts?.ready) {
      try { await (document as any).fonts.ready; } catch { /* ignore */ }
    }
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );
  });
}