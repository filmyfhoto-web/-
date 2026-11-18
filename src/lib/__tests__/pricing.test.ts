import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock supabase client BEFORE importing pricing
const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: any[]) => rpcMock(...args) },
}));

import { resolvePrices } from "@/lib/pricing";

describe("resolvePrices — RPC routing", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    try { localStorage.clear(); } catch {}
  });
  afterEach(() => { try { localStorage.clear(); } catch {} });

  it("uses get_prices_by_token when school_token is in session", async () => {
    localStorage.setItem("guest_session_v1", JSON.stringify({
      guest_id: "g", name: "n", phone: "0800000000",
      school_token: "TOKEN_ABC12345",
    }));
    rpcMock.mockResolvedValueOnce({ data: [{ product_id: "p1", price: 12.5, source: "group" }], error: null });

    const r = await resolvePrices(["p1"], null);

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[0][0]).toBe("get_prices_by_token");
    expect(rpcMock.mock.calls[0][1]).toEqual({ p_token: "TOKEN_ABC12345", p_product_ids: ["p1"] });
    expect(r["p1"].price).toBe(12.5);
    expect(r["p1"].source).toBe("group");
  });

  it("token in opts overrides session token and orgId (must NOT fallback to org)", async () => {
    localStorage.setItem("guest_session_v1", JSON.stringify({
      guest_id: "g", name: "n", phone: "0800000000",
      school_token: "SESSION_TOKEN_XX",
    }));
    rpcMock.mockResolvedValueOnce({ data: [], error: null });

    await resolvePrices(["p1"], "ORG-UUID", { schoolToken: "OPT_TOKEN_YYYY" });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[0][0]).toBe("get_prices_by_token");
    expect(rpcMock.mock.calls[0][1].p_token).toBe("OPT_TOKEN_YYYY");
  });

  it("falls back to get_prices_by_org when no token but orgId is present", async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    await resolvePrices(["p1"], "ORG-UUID");
    expect(rpcMock.mock.calls[0][0]).toBe("get_prices_by_org");
    expect(rpcMock.mock.calls[0][1]).toEqual({ p_org_id: "ORG-UUID", p_product_ids: ["p1"] });
  });

  it("falls back to get_my_prices when no token and no orgId", async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    await resolvePrices(["p1"], null);
    expect(rpcMock.mock.calls[0][0]).toBe("get_my_prices");
  });

  it("ignores tokens that look invalid (too short)", async () => {
    localStorage.setItem("guest_session_v1", JSON.stringify({
      guest_id: "g", name: "n", phone: "0800000000",
      school_token: "short",
    }));
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    await resolvePrices(["p1"], null);
    expect(rpcMock.mock.calls[0][0]).toBe("get_my_prices");
  });

  it("returns empty for empty productIds without hitting RPC", async () => {
    const r = await resolvePrices([], null);
    expect(r).toEqual({});
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("marks missing products as 'pending'", async () => {
    rpcMock.mockResolvedValueOnce({ data: [{ product_id: "p1", price: 10, source: "standard" }], error: null });
    const r = await resolvePrices(["p1", "p2"], "ORG");
    expect(r["p1"].source).toBe("standard");
    expect(r["p2"].price).toBeNull();
    expect(r["p2"].source).toBe("pending");
  });
});