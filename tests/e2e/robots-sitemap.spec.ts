import { expect, test } from "@playwright/test";

const ORIGIN = "https://filmyynatta.com";
const SITEMAP_URL = `${ORIGIN}/sitemap.xml`;

test("robots.txt points at the current sitemap.xml", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.ok()).toBeTruthy();
  const txt = await res.text();

  const sitemapLines = txt
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^sitemap:/i.test(l));
  expect(sitemapLines).toEqual([`Sitemap: ${SITEMAP_URL}`]);

  // Crawlers must not be blocked wholesale.
  expect(txt).not.toMatch(/^\s*Disallow:\s*\/\s*$/m);
  expect(txt).toMatch(/User-agent: \*/);
  for (const path of ["/admin", "/staff", "/pos", "/portal", "/account", "/my-orders"]) {
    expect(txt, `robots.txt should disallow ${path}`).toContain(`Disallow: ${path}`);
  }
});

test("sitemap.xml is valid, current, and matches robots directives", async ({ request }) => {
  const robotsTxt = await (await request.get("/robots.txt")).text();
  const disallowed = [...robotsTxt.matchAll(/^Disallow:\s*(\S+)\s*$/gm)].map((m) => m[1]);

  const res = await request.get("/sitemap.xml");
  expect(res.ok()).toBeTruthy();
  const xml = await res.text();
  expect(xml.startsWith("<?xml")).toBeTruthy();
  expect(xml).toContain("<urlset");

  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(locs.length).toBeGreaterThan(0);
  // Unique, absolute, on the canonical origin.
  expect(new Set(locs).size).toBe(locs.length);
  for (const loc of locs) expect(loc.startsWith(`${ORIGIN}/`)).toBeTruthy();

  // No sitemap URL may be blocked by robots.txt.
  for (const loc of locs) {
    const path = new URL(loc).pathname;
    for (const rule of disallowed) {
      expect(
        path === rule || path.startsWith(`${rule}/`),
        `sitemap lists ${path} but robots.txt disallows ${rule}`,
      ).toBe(false);
    }
  }

  // Every listed URL is a route the app actually serves (no 404 shell redirects).
  for (const loc of locs) {
    const pageRes = await request.get(new URL(loc).pathname);
    expect(pageRes.status(), `${loc} should be served`).toBeLessThan(400);
  }
});
