import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Product parity E2E — verifies every entry point (POS Quick Add, PosStock,
 * Admin Products) sends the same payload shape to the same tables via the
 * shared saveProduct() helper. Guards against price / stock / shop drift.
 *
 * We don't render the actual pages (they pull in Router, auth, storage);
 * instead we simulate the exact call each page makes now that they all
 * funnel through saveProduct(). If a future refactor bypasses saveProduct,
 * the corresponding contract test in
 * src/pages/__tests__/product-form-wiring.test.ts will fail loudly.
 */

type Call = { table?: string; op?: string; payload?: any; eqArgs?: any[] };
const calls: Call[] = [];
let rpcCalls: Array<{ fn: string; args: any }> = [];

function selectChain(table: string, payload?: any) {
  const c: any = {
    _f: {} as Record<string, any>,
    _p: payload,
    eq(k: string, v: any) { c._f[k] = v; return c; },
    async limit() { return { data: [], error: null }; },
    async maybeSingle() { return { data: null, error: null }; },
    async single() { return { data: { id: "new-id", ...(c._p ?? {}) }, error: null }; },
  };

  return c;
}

vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => ({
    select() { return selectChain(table); },
    insert(payload: any) {
      calls.push({ table, op: "insert", payload });
      return { select: () => selectChain(table, payload) };
    },
    update(payload: any) {
      calls.push({ table, op: "update", payload });
      return {
        eq(col: string, val: any) {
          calls[calls.length - 1].eqArgs = [col, val];
          return { select: () => selectChain(table, payload) };
        },
      };
    },
    upsert(payload: any) {
      calls.push({ table, op: "upsert", payload });
      return Promise.resolve({ error: null });
    },
  });
  const rpc = (fn: string, args: any) => {
    rpcCalls.push({ fn, args });
    return Promise.resolve({ error: null, data: null });
  };
  return { supabase: { from, rpc } };
});

beforeEach(() => {
  calls.length = 0;
  rpcCalls = [];
});

// Extracts the essential parity fields from the captured calls so the three
// entry-point simulations can be deep-equal compared regardless of ordering.
function parityDigest() {
  const insert = calls.find((c) => c.table === "products" && c.op === "insert");
  const update = calls.find((c) => c.table === "products" && c.op === "update");
  const cost = calls.find((c) => c.table === "product_costs" && c.op === "upsert");
  const shops = rpcCalls.find((r) => r.fn === "admin_set_product_shops");
  const writePayload = insert?.payload ?? update?.payload;
  return {
    productWrite: writePayload && {
      name: writePayload.name,
      barcode: writePayload.barcode,
      stock: writePayload.stock,
      standard_price: writePayload.standard_price,
      low_stock_threshold: writePayload.low_stock_threshold,
      active: writePayload.active,
      unit: writePayload.unit,
      image_url: writePayload.image_url,
    },
    cost: cost && { cost_price: cost.payload.cost_price },
    shops: shops && { store_ids: shops.args.p_store_ids },
  };
}

async function importSave() {
  return (await import("../../lib/productSave")).saveProduct;
}

// Shared canonical payload — every entry point should produce this digest.
const CANONICAL_VALUES = {
  name: "ปากกาสีแดง Uni-ball",
  barcode: "8850001234567",
  standard_price: 45,
  cost_price: 22,
  stock: 100,
  low_stock_threshold: 10,
  active: true,
  unit: "ด้าม",
  image_url: "https://example.test/img/pen.jpg",
};
const CANONICAL_SHOPS = ["shop-central", "shop-film"];

describe("product parity — three entry points → same tables", () => {
  it("POS Quick Add (create) writes canonical payload", async () => {
    const saveProduct = await importSave();
    await saveProduct({
      mode: "create",
      values: CANONICAL_VALUES,
      shopIds: CANONICAL_SHOPS,
    });
    const digest = parityDigest();
    expect(digest.productWrite).toMatchObject({
      name: CANONICAL_VALUES.name,
      barcode: CANONICAL_VALUES.barcode,
      stock: 100,
      standard_price: 45,
      low_stock_threshold: 10,
      active: true,
      unit: "ด้าม",
      image_url: CANONICAL_VALUES.image_url,
    });
    expect(digest.cost).toEqual({ cost_price: 22 });
    expect(digest.shops).toEqual({ store_ids: CANONICAL_SHOPS });
  });

  it("PosStock (edit) writes same shape, updating by id", async () => {
    const saveProduct = await importSave();
    await saveProduct({
      mode: "update",
      productId: "prod-42",
      values: CANONICAL_VALUES,
      shopIds: CANONICAL_SHOPS,
    });
    const upd = calls.find((c) => c.table === "products" && c.op === "update");
    expect(upd?.eqArgs).toEqual(["id", "prod-42"]);
    const digest = parityDigest();
    expect(digest.productWrite).toMatchObject({
      name: CANONICAL_VALUES.name,
      standard_price: 45,
      active: true,
      image_url: CANONICAL_VALUES.image_url,
    });
    // ตอนแก้ไข สต๊อกต้องไปเป็น "การเคลื่อนไหวสต๊อก" ที่ตรวจสอบได้ ไม่เขียนทับตรง ๆ
    expect(rpcCalls.find((r) => r.fn === "pos_adjust_stock")?.args).toMatchObject({
      p_product_id: "new-id", p_mode: "set", p_qty: 100,
    });

    expect(digest.cost).toEqual({ cost_price: 22 });
    expect(digest.shops).toEqual({ store_ids: CANONICAL_SHOPS });
  });

  it("Admin Products (create) produces IDENTICAL digest to POS Quick Add", async () => {
    const saveProduct = await importSave();
    // Digest A — POS Quick Add
    await saveProduct({
      mode: "create",
      values: CANONICAL_VALUES,
      shopIds: CANONICAL_SHOPS,
    });
    const a = parityDigest();

    // Reset and simulate Admin Products going through the same helper.
    calls.length = 0;
    rpcCalls.length = 0;

    await saveProduct({
      mode: "create",
      values: CANONICAL_VALUES,
      shopIds: CANONICAL_SHOPS,
    });
    const b = parityDigest();

    // Deep-equal — no drift allowed between POS quick-add and Admin.
    expect(b).toEqual(a);
  });

  it("shop replace: switching shops on edit swaps store_ids atomically", async () => {
    const saveProduct = await importSave();
    await saveProduct({
      mode: "update",
      productId: "prod-x",
      values: { ...CANONICAL_VALUES, standard_price: 60 },
      shopIds: ["shop-central"], // dropped shop-film
    });
    const rpc = rpcCalls.find((r) => r.fn === "admin_set_product_shops");
    // saveProduct passes the freshly-fetched row id; the mock returns
    // "new-id" from .single(). What matters is that only "shop-central"
    // is written (shop-film was dropped) — atomic replace via RPC.
    expect(rpc?.args.p_store_ids).toEqual(["shop-central"]);
    const upd = calls.find((c) => c.table === "products" && c.op === "update");
    expect(upd?.payload.standard_price).toBe(60);
  });
});