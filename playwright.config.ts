import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: 0,
  // Per-case reporting so a staging run produces both a human-browsable
  // HTML report and a machine-readable JSON manifest the user can open
  // directly. Override with `PLAYWRIGHT_HTML_REPORT` / `PLAYWRIGHT_JSON_REPORT`
  // env vars when wiring into CI artifacts.
  reporter: [
    ["list"],
    ["html", { outputFolder: process.env.PLAYWRIGHT_HTML_REPORT ?? "playwright-report", open: "never" }],
    ["json", { outputFile: process.env.PLAYWRIGHT_JSON_REPORT ?? "playwright-report/results.json" }],
  ],
  // Per-engine + per-OS baselines. Visual snapshots are only valid against
  // ONE engine on ONE OS — font shaping & sub-pixel rounding diverge across
  // chromium / webkit / linux / darwin. We segment by both so each project
  // owns its own baseline tree.
  snapshotPathTemplate:
    "{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}",
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.02,
      threshold: 0.2,
    },
  },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    viewport: { width: 1280, height: 900 },
    headless: true,
    trace: "retain-on-failure",
    // Deterministic locale/timezone for any date or number formatting.
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
    // Kill OS-level motion + force a stable color scheme so animation /
    // hover states never bleed into screenshots.
    reducedMotion: "reduce",
    colorScheme: "light",
    forcedColors: "none",
  },
  // Cross-engine coverage for layout regressions. Each project carries its
  // own snapshot baseline tree (see snapshotPathTemplate). Update baselines
  // with `bun run test:e2e:update` (all projects) or
  // `bun run test:e2e:update -- --project=webkit` (single engine).
  projects: [
    {
      name: "chromium",
      testIgnore: /customer-scroll-stability\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 1,
        colorScheme: "light",
        locale: "th-TH",
        timezoneId: "Asia/Bangkok",
        reducedMotion: "reduce",
      },
    },
    {
      name: "webkit",
      testIgnore: /customer-scroll-stability\.spec\.ts/,
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 1,
        colorScheme: "light",
        locale: "th-TH",
        timezoneId: "Asia/Bangkok",
        reducedMotion: "reduce",
      },
    },
    // Mobile / tablet coverage for the customer storefront. These projects
    // only run the specs tagged for small screens (see testMatch) so the
    // desktop suites keep a single stable baseline.
    {
      name: "mobile-chromium",
      testMatch: /customer-(scroll-stability|mobile).*\.spec\.ts/,
      use: { ...devices["Pixel 7"], locale: "th-TH", timezoneId: "Asia/Bangkok", reducedMotion: "reduce" },
    },
    {
      name: "mobile-webkit",
      testMatch: /customer-(scroll-stability|mobile).*\.spec\.ts/,
      use: { ...devices["iPhone 13"], locale: "th-TH", timezoneId: "Asia/Bangkok", reducedMotion: "reduce" },
    },
    {
      name: "tablet-chromium",
      testMatch: /customer-(scroll-stability|mobile).*\.spec\.ts/,
      use: { ...devices["Galaxy Tab S4"], locale: "th-TH", timezoneId: "Asia/Bangkok", reducedMotion: "reduce" },
    },
    {
      name: "tablet-webkit",
      testMatch: /customer-(scroll-stability|mobile).*\.spec\.ts/,
      use: { ...devices["iPad (gen 7)"], locale: "th-TH", timezoneId: "Asia/Bangkok", reducedMotion: "reduce" },
    },
  ],
  webServer: {
    command: "bun run dev",
    url: "http://localhost:8080",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});