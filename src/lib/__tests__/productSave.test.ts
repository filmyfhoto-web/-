import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for the shared saveProduct helper — the single write path
 * every add/edit product form (POS Quick Add, PosStock, Admin Products,
 * Staff intake) funnels through. Guards the price / stock / shop-binding
 * contract so no entry point can drift.
 */

type Call = { table?: string; op?: string; payload?: any; eqArgs?: any[] };
const calls: Call[] = [];
let rpcCalls: Array<{ fn: string; args: any }> = [];
const dupRows: Record<string, any> = {};

function selectChain(table: string, payload?: any) {
  const c: any = {
    _f: {} as Record<string, any>,
    _p: payload,
    eq(k: string, v: any) { c._f[k] = v; return c; },
    async limit(_n: number) {
      const key = `${table}:${Object.entries(c._f).map(([k, v]) => `${k}=${v}`).join(",")}`;
      const row = dupRows[key];
      return { data: row ? [row] : [], error: null };
    },
    async maybeSingle() {
      const key = `${table}:${Object.entries(c._f).map(([k, v]) => `${k}=${v}`).join(",")}`;
      return { data: dupRows[key] ?? null, error: null };
    },
    async single() {
      return { data: { id: "new-id", ...(c._p ?? {}) }, error: null };
    },
  };
  return c;
}

vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => {
    const chain: any = {
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
    };
    return chain;
  };
  const rpc = (fn: string, args: any) => {
    rpcCalls.push({ fn, args });
    return Promise.resolve({ error: null });
  };
  return { supabase: { from, rpc } };
});

beforeEach(() => {
  calls.length = 0;
  rpcCalls = [];
  for (const k of Object.keys(dupRows)) delete dupRows[k];
});

async function loadSave() {
  return (await import("../productSave")).saveProduct;
}

describe("saveProduct — create", () => {
  it("writes products + product_costs + admin_set_product_shops with given values", async () => {
    const saveProduct = await loadSave();
    const saved = await saveProduct({
      mode: "create",
      values: {
        name: "Widget",
        barcode: "111",
        standard_price: 123.45,
        cost_price: 50,
        stock: 7,
        low_stock_threshold: 2,
        active: true,
      },
      shopIds: ["shopA", "shopB"],
    });

    const ins = calls.find((c) => c.table === "products" && c.op === "insert");
    expect(ins?.payload).toMatchObject({
      name: "Widget",
      barcode: "111",
      standard_price: 123.45,
      stock: 7,
      low_stock_threshold: 2,
      active: true,
    });

    const cost = calls.find((c) => c.table === "product_costs" && c.op === "upsert");
    expect(cost?.payload).toMatchObject({ product_id: "new-id", cost_price: 50 });

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toEqual({
      fn: "admin_set_product_shops",
      args: { p_product_id: "new-id", p_store_ids: ["shopA", "shopB"] },
    });

    expect(saved.id).toBe("new-id");
  });

  it("blanks code when it equals the peek FY-code so DB generates one", async () => {
    const saveProduct = await loadSave();
    await saveProduct({
      mode: "create",
      values: { name: "X", standard_price: 0 },
      nextAutoCode: "FY00042",
    });
    const ins = calls.find((c) => c.table === "products" && c.op === "insert");
    expect(ins?.payload.code).toBeNull();
  });
});

describe("saveProduct — update", () => {
  it("updates by id, upserts cost, replaces shop bindings", async () => {
    const saveProduct = await loadSave();
    await saveProduct({
      mode: "update",
      productId: "prod-1",
      values: {
        name: "Widget v2",
        standard_price: 200,
        cost_price: 60,
        stock: 3,
      },
      shopIds: ["shopA"],
    });

    const upd = calls.find((c) => c.table === "products" && c.op === "update");
    expect(upd?.eqArgs).toEqual(["id", "prod-1"]);
    // สต๊อกไม่ถูกเขียนตรงในโหมดแก้ไข — ต้องผ่าน RPC pos_adjust_stock เท่านั้น
    expect(upd?.payload).toMatchObject({ standard_price: 200, name: "Widget v2" });
    expect(upd?.payload).not.toHaveProperty("stock");

    const cost = calls.find((c) => c.table === "product_costs" && c.op === "upsert");
    expect(cost?.payload).toMatchObject({ cost_price: 60 });

    // สต๊อกปรับผ่าน RPC กลาง และผูกร้านผ่าน RPC แยก
    expect(rpcCalls.find((c) => c.fn === "pos_adjust_stock")?.args).toMatchObject({ p_qty: 3, p_mode: "set" });
    expect(rpcCalls.find((c) => c.args?.p_store_ids)?.args).toEqual({ p_product_id: "new-id", p_store_ids: ["shopA"] });
  });

  it("does not touch product_costs when cost_price is undefined (staff form)", async () => {
    const saveProduct = await loadSave();
    await saveProduct({
      mode: "update",
      productId: "prod-1",
      values: { name: "Y", standard_price: 10 },
    });
    expect(calls.find((c) => c.table === "product_costs")).toBeUndefined();
  });

  it("does not touch shops when shopIds is null", async () => {
    const saveProduct = await loadSave();
    await saveProduct({
      mode: "update",
      productId: "prod-1",
      values: { name: "Z", standard_price: 10 },
      shopIds: null,
    });
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("saveProduct — validation", () => {
  it("rejects duplicate barcode before writing anything", async () => {
    dupRows["products:barcode=999"] = { id: "other-id", name: "Existing" };
    const saveProduct = await loadSave();
    await expect(
      saveProduct({
        mode: "create",
        values: { name: "New", barcode: "999", standard_price: 5 },
      }),
    ).rejects.toThrow();
    expect(calls.find((c) => c.op === "insert" || c.op === "update")).toBeUndefined();
  });

  it("rejects negative numeric fields", async () => {
    const saveProduct = await loadSave();
    await expect(
      saveProduct({
        mode: "create",
        values: { name: "Neg", standard_price: -1 },
      }),
    ).rejects.toThrow();
  });
});
