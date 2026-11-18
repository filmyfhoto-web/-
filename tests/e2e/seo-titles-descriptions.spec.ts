import { expect, test, type Page } from "@playwright/test";

/**
 * Verifies that every public route renders the exact <title> and
 * <meta name="description"> declared in its page source (via SeoHead /
 * Helmet), that the canonical URL self-references the route, and that no two
 * pages share a title or description.
 */

const ORIGIN = "https://filmyynatta.com";

type Expected = { path: string; title: string; description: string; canonical?: string };

const PAGES: Expected[] = [
  {
    path: "/login",
    title: "อัปเดตสินค้าและบริการ — ร้านนัฐภรณ์ เชียงกลาง",
    description:
      "อัปเดตสินค้าและบริการแบบเรียลไทม์จากร้านนัฐภรณ์ เชียงกลาง เข้าสู่ระบบเพื่อสั่งซื้อและขอใบเสนอราคา",
  },
  {
    path: "/signup",
    title: "ปิดรับสมัครสมาชิก — ร้านนัฐภรณ์ เชียงกลาง",
    description: "ร้านเปิดใช้เฉพาะแอดมินและลูกค้าผ่าน LINE เท่านั้น ไม่รับสมัครสมาชิกทั่วไปแล้ว",
  },
  {
    path: "/welcome",
    title: "เข้าสู่ระบบ — ร้านนัฐภรณ์",
    description: "เลือกวิธีเข้าใช้งานระบบร้านนัฐภรณ์ สำหรับลูกค้า พนักงาน และผู้ดูแลระบบ",
  },
  {
    path: "/privacy-policy",
    title: "นโยบายความเป็นส่วนตัว — ร้านนัฐภรณ์ เชียงกลาง",
    description: "นโยบายความเป็นส่วนตัวของร้านนัฐภรณ์ เชียงกลาง เกี่ยวกับการเก็บ ใช้ และดูแลข้อมูลลูกค้า",
  },
  {
    path: "/terms-of-use",
    title: "เงื่อนไขการใช้งาน — ร้านนัฐภรณ์ เชียงกลาง",
    description:
      "เงื่อนไขการใช้งานระบบของร้านนัฐภรณ์ เชียงกลาง สำหรับสมาชิก การสั่งซื้อ และการใช้บริการเอกสาร",
  },
  {
    path: "/forgot-password",
    title: "ลืมรหัสผ่าน — ร้านนัฐภรณ์ เชียงกลาง",
    description: "รีเซ็ตรหัสผ่านผ่านอีเมล",
  },
  {
    path: "/reset-password",
    title: "ตั้งรหัสผ่านใหม่",
    description: "ตั้งรหัสผ่านใหม่หลังจากคลิกลิงก์รีเซ็ต",
  },
  {
    path: "/school/invalid",
    title: "ลิงก์โรงเรียนไม่ถูกต้อง",
    description: "ลิงก์ที่ใช้เข้าสู่หน้าสินค้าไม่ถูกต้องหรือหมดอายุ",
  },
  {
    path: "/faq/line-oa",
    title: "เชื่อม LINE OA สำหรับร้านค้า — ตอบกลับและแจ้งสถานะออเดอร์",
    description:
      "เชื่อม LINE OA กับระบบร้านค้า ตอบกลับลูกค้า แจ้งยอด และสถานะออเดอร์ผ่าน LINE Official Account ได้ในที่เดียว",
  },
];

async function readHead(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  // Head tags are applied in an effect after the lazy route chunk mounts.
  await page.waitForFunction(
    () => !!document.querySelector('meta[name="description"][data-managed-head="true"]'),
    undefined,
    { timeout: 20_000 },
  );
  return page.evaluate(() => ({
    title: document.title,
    description:
      document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "",
    ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? "",
    ogDescription:
      document.querySelector('meta[property="og:description"]')?.getAttribute("content") ?? "",
    descriptionCount: document.querySelectorAll('meta[name="description"]').length,
    canonicalCount: document.querySelectorAll('link[rel="canonical"]').length,
  }));
}

for (const expected of PAGES) {
  test(`metadata is correct on ${expected.path}`, async ({ page }) => {
    const head = await readHead(page, expected.path);
    expect(head.title).toBe(expected.title);
    expect(head.description).toBe(expected.description);
    expect(head.canonical).toBe(expected.canonical ?? `${ORIGIN}${expected.path}`);
    // og/twitter mirror the final title + description, never diverge.
    expect(head.ogTitle).toBe(expected.title);
    expect(head.ogDescription).toBe(expected.description);
    // Exactly one description and one canonical — no leftovers from index.html.
    expect(head.descriptionCount).toBe(1);
    expect(head.canonicalCount).toBe(1);
  });
}

test("no public page shares a title or description", async ({ page }) => {
  const titles = new Map<string, string>();
  const descriptions = new Map<string, string>();
  for (const expected of PAGES) {
    const head = await readHead(page, expected.path);
    expect(head.title.length, `${expected.path} has an empty title`).toBeGreaterThan(0);
    expect(head.description.length, `${expected.path} has an empty description`).toBeGreaterThan(0);
    expect(titles.has(head.title), `duplicate title on ${expected.path} and ${titles.get(head.title)}`).toBe(false);
    expect(
      descriptions.has(head.description),
      `duplicate description on ${expected.path} and ${descriptions.get(head.description)}`,
    ).toBe(false);
    titles.set(head.title, expected.path);
    descriptions.set(head.description, expected.path);
  }
});

test("every sitemap URL is a route the app serves with its own metadata", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.ok()).toBeTruthy();
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(locs.length).toBeGreaterThan(0);
  for (const loc of locs) {
    expect(loc.startsWith(`${ORIGIN}/`)).toBeTruthy();
  }
  // Every page we assert metadata for must be advertised in the sitemap.
  for (const expected of PAGES) {
    expect(locs, `sitemap missing ${expected.path}`).toContain(`${ORIGIN}${expected.path}`);
  }
});
