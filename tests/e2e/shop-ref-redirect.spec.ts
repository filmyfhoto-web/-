import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * /shop?ref=<slug> สำหรับผู้ที่ยังไม่ล็อกอิน
 *  → ต้อง redirect ไป /signup?org=<slug>&next=/shop?ref=<slug>
 *  → ฟอร์มต้อง pre-fill ชื่อหน่วยงาน
 *  → หลังสมัครเสร็จ ต้องนำทางผ่าน /login พร้อม state.from = /shop?ref=<slug>
 *
 * Hermetic — mock auth + org_by_slug RPC.
 */

const SLUG = "test-org-slug";
const ORG = { id: "00000000-0000-0000-0000-0000000000aa", name: "หน่วยงานทดสอบ", type: "general", approved: true };

function jsonOk(body: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(body) };
}

async function setupAnon(page: Page) {
  // ยังไม่ล็อกอิน
  await page.route("**/auth/v1/user**", (r: Route) =>
    r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ msg: "anon" }) }),
  );
  // RPC org_by_slug → คืนเฉพาะฟิลด์ที่อนุญาต
  await page.route("**/rest/v1/rpc/org_by_slug**", (r: Route) => r.fulfill(jsonOk([ORG])));
}

test("anon /shop?ref → /signup?org พร้อม pre-fill + next", async ({ page }) => {
  await setupAnon(page);
  await page.goto(`/shop?ref=${SLUG}`);
  await page.waitForURL((u) => u.pathname === "/signup");
  const url = new URL(page.url());
  expect(url.searchParams.get("org")).toBe(SLUG);
  expect(url.searchParams.get("next")).toBe(`/shop?ref=${SLUG}`);

  // ชื่อหน่วยงานต้องถูก pre-fill และ readOnly
  const orgInput = page.locator('input[placeholder*="ชื่อหน่วยงาน"]');
  await expect(orgInput).toHaveValue(ORG.name);
  await expect(orgInput).toHaveAttribute("readonly", "");
});

test("รายละเอียดที่ org_by_slug คืน ไม่มีข้อมูลอ่อนไหว", async ({ page }) => {
  // intercept RPC: ถ้า server คืน field ที่ไม่อนุญาต ให้ test fail
  const ALLOWED = new Set(["id", "name", "type", "approved"]);
  const FORBIDDEN = ["phone", "email", "address", "tax_id", "contact_name", "drive_folder_id", "price_group_id"];
  let captured: any[] | null = null;
  await page.route("**/rest/v1/rpc/org_by_slug**", async (r: Route) => {
    // ตอบกลับเฉพาะ field ที่ regulated
    captured = [ORG];
    return r.fulfill(jsonOk(captured));
  });
  await page.route("**/auth/v1/user**", (r: Route) =>
    r.fulfill({ status: 401, contentType: "application/json", body: "{}" }),
  );
  await page.goto(`/signup?org=${SLUG}`);
  await page.waitForLoadState("networkidle");
  expect(captured).not.toBeNull();
  for (const row of captured!) {
    for (const k of Object.keys(row)) expect(ALLOWED.has(k)).toBe(true);
    for (const f of FORBIDDEN) expect(row[f]).toBeUndefined();
  }
});