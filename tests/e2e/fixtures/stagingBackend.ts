import type { Page, Route } from "@playwright/test";
import {
  buildOrderGroupText,
  pickOrderGroupDestinations,
} from "../../../supabase/functions/_shared/orderGroupNotify.ts";

/**
 * Fully in-memory staging backend for the order-lifecycle E2E.
 *
 * NOTHING here touches the real project database: every Supabase auth, REST,
 * RPC and edge-function call the app makes is intercepted and answered from
 * the fixture state below. That keeps the test deterministic and guarantees
 * production data is never read or mutated by CI.
 */

export type StagingProduct = { id: string; code: string; name: string; unit: string; price: number; stock: number };
export type StagingOrder = {
  id: string;
  order_no: string;
  status: string;
  total: number;
  created_at: string;
  guest_name: string;
  items: { product_id: string; qty: number; name: string; price: number }[];
  idempotency_key?: string;
};

export type StagingState = {
  products: StagingProduct[];
  orders: StagingOrder[];
  stockMovements: { product_id: string; qty: number; reason: string; order_id: string }[];
  submits: number;
  /** ห้อง LINE ประเภท order_group ที่แอดมินตั้งค่าไว้ในหน้าตั้งค่า LINE */
  orderGroupChannels: { line_destination_id: string; is_active: boolean; display_name?: string }[];
  /** ข้อความที่ "ถึงกลุ่ม" จริง (ปลายทาง + เนื้อความที่ผู้ใช้เห็นใน LINE) */
  lineGroupMessages: { to: string; text: string }[];
};

export const TEST_PRODUCT: StagingProduct = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "TEST-001",
  name: "กระดาษทดสอบ A4",
  unit: "รีม",
  price: 120,
  stock: 10,
};

const PROJECT_REF = "fdgxvgtmzcgakofswtty";
export const AUTH_STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

const b64u = (o: unknown) =>
  Buffer.from(JSON.stringify(o)).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** Structurally valid but completely fake JWT — signed by nobody, never sent to a real server. */
export function fakeJwt(sub: string) {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60;
  return `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u({ sub, role: "authenticated", exp, aud: "authenticated" })}.e2e`;
}

export function newState(): StagingState {
  return {
    products: [{ ...TEST_PRODUCT }],
    orders: [],
    stockMovements: [],
    submits: 0,
    orderGroupChannels: [],
    lineGroupMessages: [],
  };
}

const json = (body: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  headers: { "access-control-allow-origin": "*" },
  body: JSON.stringify(body),
});

const STAFF_USER = {
  id: "22222222-2222-4222-8222-222222222222",
  aud: "authenticated",
  role: "authenticated",
  email: "staff@e2e.local",
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
};

/** Seed a fake staff session so the guarded /staff routes render. */
export async function seedStaffSession(page: Page) {
  const token = fakeJwt(STAFF_USER.id);
  const session = {
    access_token: token,
    refresh_token: "e2e-refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: STAFF_USER,
  };
  await page.addInitScript(
    ([key, value]) => { try { localStorage.setItem(key as string, value as string); } catch { /* ignore */ } },
    [AUTH_STORAGE_KEY, JSON.stringify(session)] as const,
  );
}

/** Seed the LINE proof the customer checkout attaches to its request. */
export async function seedLineCustomer(page: Page) {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("line_binding", JSON.stringify({ line_user_id: "Ue2e0000000000000000000000000001", display_name: "ลูกค้าทดสอบ" }));
      sessionStorage.setItem("line_id_token", "e2e-id-token");
    } catch { /* ignore */ }
  });
}

export async function seedCart(page: Page, qty = 3) {
  await page.addInitScript(
    ([item]) => { try { localStorage.setItem("cart_v1", JSON.stringify([item])); } catch { /* ignore */ } },
    [{ product_id: TEST_PRODUCT.id, code: TEST_PRODUCT.code, name: TEST_PRODUCT.name, unit: TEST_PRODUCT.unit, qty, price: TEST_PRODUCT.price }] as const,
  );
}

/**
 * Intercept every Supabase call. Routes registered later win in Playwright,
 * so the generic REST fallback is installed first.
 */
export async function installStagingBackend(page: Page, state: StagingState, opts: { staff?: boolean } = {}) {
  // Catch-all: anything not explicitly modelled answers with an empty list.
  await page.route(/\/rest\/v1\/.*/, (r: Route) => r.fulfill(json([])));
  await page.route(/\/rest\/v1\/rpc\/.*/, (r) => r.fulfill(json(null)));

  await page.route(/\/functions\/v1\/.*/, (r) => r.fulfill(json({ ok: true })));


  await page.route(/\/rest\/v1\/products.*/, (r) => r.fulfill(json(state.products.map((p) => ({
    id: p.id, code: p.code, name: p.name, unit: p.unit, price: p.price, stock_qty: p.stock, status: "published", deleted_at: null,
  })))));

  await page.route(/\/rest\/v1\/profiles.*/, (r) =>
    r.fulfill(json(opts.staff ? { id: STAFF_USER.id, full_name: "พนักงานทดสอบ", staff_active: true, cost_visible: true, organizations: null } : null)));

  await page.route(/\/rest\/v1\/user_roles.*/, (r) => r.fulfill(json(opts.staff ? [{ role: "admin" }] : [])));
  await page.route(/\/rest\/v1\/staff_permissions.*/, (r) => r.fulfill(json(null)));

  await page.route(/\/rest\/v1\/guest_orders.*/, async (r) => {
    const req = r.request();
    if (req.method() === "GET") {
      return r.fulfill(json(state.orders.map((o) => ({
        id: o.id, order_no: o.order_no, status: o.status, total: o.total, created_at: o.created_at, customer_name: o.guest_name,
      }))));
    }
    if (req.method() === "PATCH") {
      const id = new URL(req.url()).searchParams.get("id")?.replace("eq.", "");
      const patch = JSON.parse(req.postData() || "{}");
      const order = state.orders.find((o) => o.id === id);
      if (order && typeof patch.status === "string") applyStatus(state, order, patch.status);
      return r.fulfill(json([]));
    }
    return r.fulfill(json([]));
  });

  await page.route(/\/rest\/v1\/rpc\/admin_set_order_status.*/, (r) => {
    const body = JSON.parse(r.request().postData() || "{}");
    const order = state.orders.find((o) => o.id === body.p_order_id);
    if (order) applyStatus(state, order, String(body.p_status));
    return r.fulfill(json(null));
  });

  // ---- Auth -------------------------------------------------------------
  await page.route(/\/auth\/v1\/user.*/, (r) => r.fulfill(json(opts.staff ? STAFF_USER : { error: "no session" }, opts.staff ? 200 : 401)));
  await page.route(/\/auth\/v1\/token.*/, (r) =>
    r.fulfill(json(opts.staff
      ? { access_token: fakeJwt(STAFF_USER.id), refresh_token: "e2e-refresh", token_type: "bearer", expires_in: 3600, user: STAFF_USER }
      : { error: "invalid_grant" }, opts.staff ? 200 : 400)));
  await page.route(/\/auth\/v1\/.*/, (r) => r.fulfill(json({})));

  // ---- Edge functions ---------------------------------------------------
  await page.route(/\/functions\/v1\/line-link-lookup.*/, (r) => r.fulfill(json({
    bound: true,
    friend_confirmed: true,
    friend_status: "friend",
    line_user_id: "Ue2e0000000000000000000000000001",
    display_name: "ลูกค้าทดสอบ",
    customer_id: "cust-e2e",
    customer_name: "ลูกค้าทดสอบ",
    phone: "0800000000",
    picture_url: null,
  })));

  await page.route(/\/functions\/v1\/guest-order-submit.*/, (r) => {
    const body = JSON.parse(r.request().postData() || "{}");
    state.submits += 1;
    const existing = body.idempotency_key && state.orders.find((o) => o.idempotency_key === body.idempotency_key);
    if (existing) return r.fulfill(json({ order_id: existing.id, order_no: existing.order_no }));
    type IncomingItem = { product_id: string; qty: number | string; name: string; price: number | string };
    const items = ((body.items || []) as IncomingItem[]).map((i) => ({ product_id: i.product_id, qty: Number(i.qty), name: i.name, price: Number(i.price) || 0 }));
    const order: StagingOrder = {
      id: `order-e2e-${state.orders.length + 1}`,
      order_no: `E2E-${String(state.orders.length + 1).padStart(4, "0")}`,
      status: "pending_quote",
      total: items.reduce((sum, i) => sum + i.qty * i.price, 0),
      created_at: new Date().toISOString(),
      guest_name: body.name || "ลูกค้าทดสอบ",
      items,
      idempotency_key: body.idempotency_key,
    };
    state.orders.push(order);
    // Server-side fan-out to the configured LINE order group — uses the REAL
    // shared helpers (`pickOrderGroupDestinations` + `buildOrderGroupText`),
    // so the assertion is on the message that actually reaches the group.
    for (const { dest: to } of pickOrderGroupDestinations(state.orderGroupChannels)) {
      state.lineGroupMessages.push({
        to,
        text: buildOrderGroupText(
          {
            orderId: order.id,
            orderNo: order.order_no,
            customerName: order.guest_name,
            itemCount: order.items.length,
            total: order.total || null,
            source: "เว็บแอปลูกค้า",
            createdAt: order.created_at,
          },
          `https://www.filmyynatta.com/admin/customer-purchase-orders?order=${order.id}`,
        ),
      });
    }
    return r.fulfill(json({ order_id: order.id, order_no: order.order_no }));
  });

  // Customer order history — the same rows the admin sees, so status parity
  // between both sides is observable end-to-end.
  await page.route(/\/functions\/v1\/my-line-orders.*/, (r) => r.fulfill(json({
    orders: state.orders.map((o) => ({
      id: o.id,
      order_no: o.order_no,
      status: o.status,
      total: o.total,
      created_at: o.created_at,
      customer_name: o.guest_name,
      items: o.items.map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
    })),
  })));
}

/** Status transition + the stock deduction that must happen exactly once. */
function applyStatus(state: StagingState, order: StagingOrder, next: string) {
  return applyStatusImpl(state, order, next);
}

/**
 * Unlock the customer-side LINE onboarding gate for specs that only care
 * about the page under test. Stubs `line-link-lookup` (the ONLY source of
 * truth for the gate) and seeds the LIFF proof the client attaches.
 */
export async function stubLineGate(page: Page) {
  await seedLineCustomer(page);
  await page.route(/\/functions\/v1\/line-link-lookup.*/, (r) =>
    r.fulfill(json({
      bound: true,
      friend_confirmed: true,
      friend_status: "friend",
      line_user_id: "Ue2e0000000000000000000000000001",
      display_name: "ลูกค้าทดสอบ",
      customer_id: "cust-e2e",
      customer_name: "ลูกค้าทดสอบ",
      phone: "0800000000",
      picture_url: null,
    })),
  );
}

function applyStatusImpl(state: StagingState, order: StagingOrder, next: string) {
  const previous = order.status;
  order.status = next;
  if (next !== "approved" || previous === "approved") return;
  if (state.stockMovements.some((m) => m.order_id === order.id)) return; // idempotent
  for (const item of order.items) {
    const product = state.products.find((p) => p.id === item.product_id);
    if (!product) continue;
    product.stock -= item.qty;
    state.stockMovements.push({ product_id: product.id, qty: -item.qty, reason: "sell_out", order_id: order.id });
  }
}
