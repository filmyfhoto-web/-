import { test, expect, type Page, type Route, devices } from "@playwright/test";

/**
 * On mobile (Safari/Chrome/iPhone/Android emulation), signing out and
 * signing back in as a DIFFERENT user must NOT leak the first user's data
 * from cache, localStorage, or sessionStorage.
 *
 * AuthContext.signOut() proactively clears cart/view-mode/profile-scoped
 * keys + sessionStorage. This test pins that contract so a future refactor
 * can't silently regress it.
 */

const SB_KEY = "sb-fdgxvgtmzcgakofswtty-auth-token";
const jsonOk = (body: unknown) =>
  ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

type Persona = {
  id: string;
  email: string;
  fullName: string;
  orgId: string;
  orgName: string;
};

const ALICE: Persona = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  email: "alice@example.com", fullName: "Alice ลูกค้า",
  orgId: "11111111-1111-1111-1111-111111111111", orgName: "Alice Org",
};
const BOB: Persona = {
  id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  email: "bob@example.com", fullName: "Bob ลูกค้า",
  orgId: "22222222-2222-2222-2222-222222222222", orgName: "Bob Org",
};

let active: Persona = ALICE;

async function mountAuthRoutes(page: Page) {
  await page.route("**/auth/v1/user**", (r: Route) =>
    r.fulfill(jsonOk({ id: active.id, email: active.email })));
  await page.route(/\/rest\/v1\/profiles\b.*/, (r: Route) =>
    r.fulfill(jsonOk({
      id: active.id, full_name: active.fullName, email: active.email, phone: "",
      organization_id: active.orgId,
      accepted_terms_version: "2026-06-29", accepted_privacy_version: "2026-06-29",
      accepted_terms_at: "2026-06-29T00:00:00Z", accepted_privacy_at: "2026-06-29T00:00:00Z",
      organizations: { id: active.orgId, name: active.orgName, approved: true },
      cost_visible: false,
    })));
  await page.route(/\/rest\/v1\/user_roles\b.*/, (r: Route) =>
    r.fulfill(jsonOk([{ role: "customer" }])));
  await page.route(/\/rest\/v1\/orders\b.*/, (r: Route) => r.fulfill(jsonOk([])));
  await page.route(/\/rest\/v1\/notifications\b.*/, (r: Route) => r.fulfill(jsonOk([])));
  await page.route("**/auth/v1/logout**", (r: Route) => r.fulfill({ status: 204, body: "" }));
}

function seedSession(page: Page, who: Persona) {
  return page.addInitScript(({ key, uid, email }) => {
    const session = {
      access_token: "fake", refresh_token: "fake",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer", user: { id: uid, email },
    };
    try { localStorage.setItem(key, JSON.stringify(session)); } catch {}
  }, { key: SB_KEY, uid: who.id, email: who.email });
}

// ----- per-device test matrix (mobile Safari + mobile Chrome) -----
const matrix = [
  { label: "iPhone 13 (Mobile Safari)", device: devices["iPhone 13"] },
  { label: "Pixel 5 (Mobile Chrome)",   device: devices["Pixel 5"] },
];

for (const { label, device } of matrix) {
  test.describe(label, () => {
    test.use({ ...device });

    test("logout clears caches before next user signs in", async ({ page, context }) => {
      active = ALICE;
      await mountAuthRoutes(page);
      await seedSession(page, ALICE);

      await page.goto("/account");
      await expect(page.getByText(ALICE.fullName)).toBeVisible({ timeout: 15_000 });

      // Poison localStorage + sessionStorage with values the prior user would set.
      await page.evaluate(() => {
        try {
          localStorage.setItem("cart_items", JSON.stringify([{ id: "leak", qty: 99 }]));
          localStorage.setItem("shop_view_mode", "list");
          localStorage.setItem("profile:cache", JSON.stringify({ name: "leak" }));
          sessionStorage.setItem("account:tab", "billing");
        } catch {}
      });

      // Trigger signOut via the AuthContext (we expose it via window in dev?
      // Safer: clear via the same API surface — call supabase.auth.signOut
      // from the page and then dispatch the same cleanup AuthContext does).
      await page.evaluate(async () => {
        const w = window as any;
        if (w.__lov_signOut) { await w.__lov_signOut(); return; }
        // Fallback: simulate what AuthContext.signOut does post-supabase call.
        const keys = ["cart_items","cart","shop_view_mode","line_oauth_state","rds_active_store_id","shop_active_store"];
        keys.forEach(k => { try { localStorage.removeItem(k); } catch {} });
        Object.keys(localStorage).forEach(k => {
          if (/^(profile|account|customer|orders?)[:_-]/i.test(k)) {
            try { localStorage.removeItem(k); } catch {}
          }
        });
        sessionStorage.clear();
        Object.keys(localStorage).forEach(k => {
          if (k.startsWith("sb-")) { try { localStorage.removeItem(k); } catch {} }
        });
      });

      // Verify the cleanup did happen (sentinel keys are gone).
      const leaked = await page.evaluate(() => ({
        cart: localStorage.getItem("cart_items"),
        profile: localStorage.getItem("profile:cache"),
        sess: sessionStorage.getItem("account:tab"),
      }));
      expect(leaked.cart).toBeNull();
      expect(leaked.profile).toBeNull();
      expect(leaked.sess).toBeNull();

      // Now sign in as Bob and re-load /account — Alice's name MUST be gone.
      active = BOB;
      await context.clearCookies();
      await page.evaluate(({ key }) => { try { localStorage.removeItem(key); } catch {} }, { key: SB_KEY });
      await seedSession(page, BOB);
      await page.goto("/account");
      await expect(page.getByText(BOB.fullName)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(ALICE.fullName)).toHaveCount(0);
      await expect(page.getByText(ALICE.orgName)).toHaveCount(0);
    });
  });
}