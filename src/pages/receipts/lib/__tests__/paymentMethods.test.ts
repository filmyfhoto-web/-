import { describe, it, expect, vi, beforeEach } from "vitest";

const fromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: any[]) => fromMock(...args) },
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import {
  DEFAULT_PAYMENT_METHODS,
  mapPaymentMethodRows,
  fetchPaymentMethods,
} from "../paymentMethods";

function builder(result: { data: any; error: any }) {
  const chain: any = {};
  ["select", "eq", "order"].forEach((m) => {
    chain[m] = vi.fn(() => (m === "order" ? Promise.resolve(result) : chain));
  });
  return chain;
}

beforeEach(() => fromMock.mockReset());

describe("mapPaymentMethodRows", () => {
  it("maps name -> { code, name } and drops blanks", () => {
    expect(mapPaymentMethodRows([{ name: "เงินสด" }, { name: "" }, { name: null }, { name: "  โอน  " }])).toEqual([
      { code: "เงินสด", name: "เงินสด" },
      { code: "โอน", name: "โอน" },
    ]);
  });
  it("returns [] for null/undefined", () => {
    expect(mapPaymentMethodRows(null)).toEqual([]);
    expect(mapPaymentMethodRows(undefined)).toEqual([]);
  });
});

describe("fetchPaymentMethods", () => {
  it("returns mapped rows from supabase", async () => {
    fromMock.mockReturnValue(builder({ data: [{ name: "Cash" }, { name: "Transfer" }], error: null }));
    const out = await fetchPaymentMethods("store-1");
    expect(out).toEqual([
      { code: "Cash", name: "Cash" },
      { code: "Transfer", name: "Transfer" },
    ]);
  });

  it("falls back to defaults when DB returns no active rows", async () => {
    fromMock.mockReturnValue(builder({ data: [], error: null }));
    const out = await fetchPaymentMethods("store-1");
    expect(out).toEqual(DEFAULT_PAYMENT_METHODS);
  });

  it("throws on supabase error (caller handles fallback + toast)", async () => {
    fromMock.mockReturnValue(
      builder({ data: null, error: { message: 'column "code" does not exist' } }),
    );
    await expect(fetchPaymentMethods("store-1")).rejects.toMatchObject({
      message: expect.stringContaining("code"),
    });
  });

  it("only selects safe columns (no `code`) to match table schema", async () => {
    const chain = builder({ data: [], error: null });
    fromMock.mockReturnValue(chain);
    await fetchPaymentMethods("store-1");
    expect(chain.select).toHaveBeenCalledWith("name");
  });
});