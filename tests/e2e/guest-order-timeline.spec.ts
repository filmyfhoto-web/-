import { test, expect, Route } from "@playwright/test";
import { stubLineGate } from "./fixtures/stagingBackend";

/**
 * End-to-end coverage for the guest quote → order timeline flow.
 *
 * Regressions this file guards against:
 * 1. MyOrderDetail must render `order_status_events` via the token-guarded
 *    `get_order_status_events` RPC (not direct table SELECT / realtime),
 *    because guest anon has no SELECT on the events table anymore.
 * 2. A guest visiting an order without the correct `?t=<link_token>` must
 *    NOT see any timeline rows — the RPC returns [] when the token check
 *    fails, and the UI must respect that (no leakage of another guest's
 *    order events).
 * 3. Cart → submit must call `guest-order-submit` EXACTLY once per click
 *    and navigate to `/my-orders/:id?t=<token>` on the first click, so the
 *    "must click twice" bug can't regress.
 */

// The customer area sits behind the LINE onboarding gate; unlock it so the
// specs below exercise the order pages themselves.
test.beforeEach(async ({ page }) => { await stubLineGate(page); });

const ORDER_ID = "11111111-1111-1111-1111-111111111111";
const LINK_TOKEN = "abcd1234abcd1234abcd1234"; // 24-char token
const GUEST_ID = "22222222-2222-2222-2222-222222222222";

const RPC_ORDER_DETAIL = /\/rest\/v1\/rpc\/get_guest_order_detail/;
const RPC_ORDER_EVENTS = /\/rest\/v1\/rpc\/get_order_status_events/;
const FN_ORDER_SUBMIT  = /\/functions\/v1\/guest-order-submit/;
const RPC_PUBLIC_SETTINGS = /\/rest\/v1\/rpc\/get_public_settings/;

const ORDER_PAYLOAD = {
  order: {
    id: ORDER_ID,
    order_no: "SO-2607-TEST",
    status: "pending_quote",
    created_at: "2026-07-02T02:28:11Z",
    guest_name: "คุณทดสอบ",
    guest_phone: "0812345678",
    subtotal: 100, discount: 0, shipping_fee: 0, total: 100,
    line_link_token: LINK_TOKEN,
    line_user_id: null,
    note: null,
  },
  items: [{ id: "i1", product_code: "P001", product_name: "สินค้าทดสอบ", qty: 1, unit: "ชิ้น", price: 100, total: 100 }],
  organization: null,
};

const EVENTS_OK = [
  { id: "e1", status: "pending_quote", note: "รับคำขอเสนอราคาแล้ว รอทางร้านตรวจสอบ", created_at: "2026-07-02T02:28:12Z" },
  { id: "e2", status: "quoted", note: "เสนอราคาแล้ว", created_at: "2026-07-02T02:30:00Z" },
];

async function seedGuestSession(page: import("@playwright/test").Page) {
  // MyOrderDetail's load() bounces to /shop if the guest session is missing.
  // Preseed a matching session so we can render the page directly.
  await page.addInitScript((gid) => {
    window.localStorage.setItem("guest_session_v1", JSON.stringify({
      guest_id: gid, name: "คุณทดสอบ", phone: "0812345678", project: "โครงการทดสอบ", org_name: "รร.ทดสอบ",
    }));
  }, GUEST_ID);
}

async function stubOrderDetail(page: import("@playwright/test").Page) {
  await page.route(RPC_ORDER_DETAIL, (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ORDER_PAYLOAD) })
  );
  // With the LINE gate unlocked the page loads the detail through the
  // `my-line-orders` function; serve the identical payload so both data
  // paths stay in parity.
  await page.route(/\/functions\/v1\/my-line-orders.*/, (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ORDER_PAYLOAD) })
  );
  await page.route(RPC_PUBLIC_SETTINGS, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ line_url: null }]) })
  );
}

test.describe("MyOrderDetail — RPC-based status timeline", () => {
  test("renders timeline events when the correct link token is present", async ({ page }) => {
    await seedGuestSession(page);
    await stubOrderDetail(page);

    // Assert the RPC is called with the exact token from the URL and reply with events.
    let observedToken: string | null | undefined = undefined;
    await page.route(RPC_ORDER_EVENTS, (route) => {
      const body = route.request().postDataJSON() as { p_order_id: string; p_link_token: string | null };
      observedToken = body?.p_link_token;
      const ok = body?.p_order_id === ORDER_ID && body?.p_link_token === LINK_TOKEN;
      route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify(ok ? EVENTS_OK : []),
      });
    });

    await page.goto(`/my-orders/${ORDER_ID}?t=${LINK_TOKEN}`);

    const timeline = page.getByTestId("status-timeline");
    await expect(timeline).toBeVisible();
    await expect(page.getByTestId("status-event")).toHaveCount(2);
    await expect(timeline).toContainText("รับคำขอเสนอราคาแล้ว");
    await expect(timeline).toContainText("เสนอราคาแล้ว");
    expect(observedToken).toBe(LINK_TOKEN);
  });

  test("hides timeline when guest visits without a valid link token", async ({ page }) => {
    await seedGuestSession(page);
    await stubOrderDetail(page);

    // RPC returns [] because the token check inside get_order_status_events fails.
    // We echo that behaviour here so the UI-level assertion is meaningful.
    let sawWrongToken = false;
    await page.route(RPC_ORDER_EVENTS, (route) => {
      const body = route.request().postDataJSON() as { p_link_token: string | null };
      if (body?.p_link_token !== LINK_TOKEN) sawWrongToken = true;
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });

    await page.goto(`/my-orders/${ORDER_ID}?t=wrong-token-does-not-match`);

    // Order detail still renders, but the timeline section must not.
    await expect(page.getByRole("heading", { name: /SO-2607-TEST/ })).toBeAttached();
    await expect(page.getByTestId("status-timeline")).toHaveCount(0);
    expect(sawWrongToken).toBe(true);
  });
});

test.describe("Cart → guest-order-submit → MyOrderDetail (single-click)", () => {
  test("one click submits the order and lands on /my-orders/:id?t=<token>", async ({ page }) => {
    // Preseed a valid guest session + one item in cart so we can jump straight
    // to /cart without touching /shop (which needs live product data).
    await page.addInitScript((gid) => {
      window.localStorage.setItem("guest_session_v1", JSON.stringify({
        guest_id: gid, name: "คุณทดสอบ", phone: "0812345678", project: "โครงการ", org_name: "รร.ทดสอบ",
      }));
      window.localStorage.setItem("cart_v1", JSON.stringify([{
        product_id: "p1", name: "สินค้าทดสอบ", code: "P001", unit: "ชิ้น", qty: 1, price: 100,
      }]));
      window.localStorage.setItem("cart_note_v1", "");
    }, GUEST_ID);

    // Track submit calls — the "must click twice" bug would show as 0 calls
    // on the first click (state race) or duplicate calls (double fire).
    let submitCalls = 0;
    await page.route(FN_ORDER_SUBMIT, (route) => {
      submitCalls += 1;
      route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ ok: true, order_id: ORDER_ID, line_link_token: LINK_TOKEN }),
      });
    });
    // Stub follow-through page so it renders cleanly after navigation.
    await stubOrderDetail(page);
    await page.route(RPC_ORDER_EVENTS, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(EVENTS_OK) })
    );

    await page.goto("/cart");
    // First "submit" opens the confirm dialog…
    await page.getByRole("button", { name: /ขอเสนอราคา/ }).first().click();
    // …then the confirm action inside the dialog fires the edge function once.
    await page.getByTestId("confirm-submit-order").click();

    await page.waitForURL(new RegExp(`/my-orders/${ORDER_ID}\\?t=${LINK_TOKEN}`), { timeout: 8000 });
    expect(submitCalls).toBe(1);
    await expect(page.getByTestId("status-timeline")).toBeVisible();
  });

  test("confirm button is disabled while submit is in flight (no double-fire)", async ({ page }) => {
    await page.addInitScript((gid) => {
      window.localStorage.setItem("guest_session_v1", JSON.stringify({
        guest_id: gid, name: "คุณทดสอบ", phone: "0812345678", project: "โครงการ", org_name: "รร.ทดสอบ",
      }));
      window.localStorage.setItem("cart_v1", JSON.stringify([{
        product_id: "p1", name: "สินค้าทดสอบ", code: "P001", unit: "ชิ้น", qty: 1, price: 100,
      }]));
      window.localStorage.setItem("cart_note_v1", "");
    }, GUEST_ID);

    // Delay the response so the "in-flight" window is observable.
    let submitCalls = 0;
    await page.route(FN_ORDER_SUBMIT, async (route) => {
      submitCalls += 1;
      await new Promise((r) => setTimeout(r, 1200));
      route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ ok: true, order_id: ORDER_ID, line_link_token: LINK_TOKEN }),
      });
    });
    await stubOrderDetail(page);
    await page.route(RPC_ORDER_EVENTS, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(EVENTS_OK) })
    );

    await page.goto("/cart");
    // The primary CTA becomes disabled once submit is in flight, and the
    // confirm dialog closes immediately, so hammering the buttons must NOT
    // enqueue a second POST.
    await page.getByRole("button", { name: /ขอเสนอราคา/ }).first().click();
    await page.getByTestId("confirm-submit-order").click();

    const cta = page.getByTestId("submit-order-btn");
    await expect(cta).toBeDisabled();
    await expect(cta).toHaveText(/กำลังส่ง/);
    // Try to double-fire while the request is still pending.
    await cta.click({ force: true }).catch(() => {});
    await cta.click({ force: true }).catch(() => {});

    await page.waitForURL(new RegExp(`/my-orders/${ORDER_ID}`), { timeout: 8000 });
    expect(submitCalls).toBe(1);
  });
});

test.describe("MyOrderDetail — link-token isolation & empty state", () => {
  test("reusing a token against a different order id shows no timeline", async ({ page }) => {
    await seedGuestSession(page);
    // Serve a *different* order id but leave its line_link_token unchanged,
    // so the client-side token check will fail even though the RPC (if
    // called with a wrong token) would also return [].
    const OTHER_ID = "99999999-9999-9999-9999-999999999999";
    await page.route(RPC_ORDER_DETAIL, (route) =>
      route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          ...ORDER_PAYLOAD,
          order: { ...ORDER_PAYLOAD.order, id: OTHER_ID, line_link_token: "different-token-not-a-match" },
        }),
      }),
    );
    await page.route(RPC_PUBLIC_SETTINGS, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ line_url: null }]) })
    );
    // Even if the RPC leaked events, the UI must gate on token match.
    await page.route(RPC_ORDER_EVENTS, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(EVENTS_OK) })
    );

    // Visit OTHER_ID with the ORIGINAL LINK_TOKEN reused from another order.
    await page.goto(`/my-orders/${OTHER_ID}?t=${LINK_TOKEN}`);
    await expect(page.getByRole("heading", { name: /SO-2607-TEST/ })).toBeAttached();
    await expect(page.getByTestId("status-timeline")).toHaveCount(0);
    await expect(page.getByTestId("status-event")).toHaveCount(0);
  });

  test("empty status events renders a friendly placeholder, not a broken UI", async ({ page }) => {
    await seedGuestSession(page);
    await stubOrderDetail(page);
    // RPC returns [] — legit token but no events seeded yet.
    await page.route(RPC_ORDER_EVENTS, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    );

    await page.goto(`/my-orders/${ORDER_ID}?t=${LINK_TOKEN}`);
    await expect(page.getByTestId("status-timeline")).toBeVisible();
    await expect(page.getByTestId("status-timeline-empty")).toBeVisible();
    await expect(page.getByTestId("status-timeline-empty")).toContainText(/ยังไม่มีประวัติสถานะ/);
    await expect(page.getByTestId("status-event")).toHaveCount(0);
  });
});

/**
 * Snapshot integrity: what the guest submits from the cart (per-line price,
 * quantity, and computed grand total) must match exactly what MyOrderDetail
 * renders back from the order-history payload. This guards against
 * regressions where the edge function or the RPC drops prices, rounds
 * totals, or the client shows stale/blank price cells.
 */
test.describe("Cart → order history — price/total snapshot parity", () => {
  test("MyOrderDetail totals equal the cart snapshot at submit time", async ({ page }) => {
    const CART = [
      { product_id: "p1", name: "กระดาษ A4 80 แกรม", code: "P001", unit: "รีม", qty: 3, price: 120 },
      { product_id: "p2", name: "ปากกา 0.5 มม.",   code: "P002", unit: "แท่ง", qty: 5, price: 8   },
    ];
    const expectedSubtotal = CART.reduce((s, it) => s + it.price * it.qty, 0); // 400

    await page.addInitScript(({ gid, cart }) => {
      window.localStorage.setItem("guest_session_v1", JSON.stringify({
        guest_id: gid, name: "คุณทดสอบ", phone: "0812345678", project: "โครงการ", org_name: "รร.ทดสอบ",
      }));
      window.localStorage.setItem("cart_v1", JSON.stringify(cart));
      window.localStorage.setItem("cart_note_v1", "");
    }, { gid: GUEST_ID, cart: CART });

    // Capture what the client actually sent so we can replay it into the
    // order-detail RPC stub. If Cart.tsx drops the price fields, MyOrderDetail
    // would then render zeros and the assertions below would fail — exactly
    // the regression this test exists to catch.
    let submitted: any = null;
    await page.route(FN_ORDER_SUBMIT, (route) => {
      submitted = route.request().postDataJSON();
      route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ ok: true, order_id: ORDER_ID, line_link_token: LINK_TOKEN }),
      });
    });

    // Serve the order detail using the numbers the client sent us.
    await page.route(RPC_PUBLIC_SETTINGS, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ line_url: null }]) })
    );
    await page.route(RPC_ORDER_DETAIL, (route) => {
      const items = (submitted?.items ?? []).map((it: any, idx: number) => ({
        id: `srv-${idx}`,
        product_code: it.code,
        product_name: it.name,
        qty: it.qty,
        unit: it.unit,
        price: it.price,
        total: Number(it.price) * Number(it.qty),
      }));
      const subtotal = items.reduce((s: number, i: any) => s + i.total, 0);
      route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          order: {
            ...ORDER_PAYLOAD.order,
            subtotal, discount: 0, shipping_fee: 0, total: subtotal,
          },
          items,
          organization: null,
        }),
      });
    });
    await page.route(RPC_ORDER_EVENTS, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    );

    await page.goto("/cart");
    // Cart line totals should reflect the snapshot BEFORE submit as well.
    await expect(page.getByTestId("cart-grand-total")).toContainText("400");
    await expect(page.getByTestId("cart-line-total").first()).toContainText("360"); // 3 × 120

    await page.getByRole("button", { name: /ขอเสนอราคา/ }).first().click();
    await page.getByTestId("confirm-submit-order").click();
    await page.waitForURL(new RegExp(`/my-orders/${ORDER_ID}`), { timeout: 8000 });

    // Server received the exact per-line snapshot from the cart.
    expect(submitted?.items).toEqual(expect.arrayContaining(
      CART.map((c) => expect.objectContaining({ product_id: c.product_id, qty: c.qty, price: c.price }))
    ));

    // MyOrderDetail renders those same numbers back to the guest.
    const detail = page.locator("main");
    for (const c of CART) {
      const row = detail.getByText(c.name).locator("xpath=ancestor::tr");
      await expect(row).toContainText(String(c.qty));
      await expect(row).toContainText(String(c.price));
      await expect(row).toContainText(String(c.price * c.qty));
    }
    // Grand total appears in the summary block.
    await expect(detail).toContainText(String(expectedSubtotal));
  });
});