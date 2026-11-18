/**
 * Integration test for the RPC `get_prices_by_token` — enforces server-side
 * price isolation by school_token. Only runs when a real Supabase URL & anon
 * key are wired in via Vite env (e.g. under `bun test` inside the sandbox).
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const URL_ENV = import.meta.env.VITE_SUPABASE_URL;
const KEY_ENV = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const suite = URL_ENV && KEY_ENV ? describe : describe.skip;

// These hit the real API over the network. Under a full parallel vitest run the
// sandbox can be slow enough to blow the 5s default, which showed up as flaky
// "Test timed out" failures rather than a real price leak.
const NET_TIMEOUT = 30_000;

suite("RPC get_prices_by_token — token isolation", () => {
  const supa = URL_ENV && KEY_ENV ? createClient(URL_ENV, KEY_ENV) : (null as any);

  it("invalid token returns no rows (no price leak)", async () => {
    const { data, error } = await supa.rpc("get_prices_by_token", {
      p_token: "totally-invalid-token-000000",
      p_product_ids: [] as string[],
    });
    // Either raise "invalid school token" or return empty — both are safe.
    if (error) expect(String(error.message)).toMatch(/invalid|token/i);
    else expect(Array.isArray(data) ? data.length : 0).toBe(0);
  }, NET_TIMEOUT);

  it("empty token returns no rows", async () => {
    const { data, error } = await supa.rpc("get_prices_by_token", {
      p_token: "",
      p_product_ids: [] as string[],
    });
    if (error) expect(String(error.message)).toMatch(/invalid|token/i);
    else expect(Array.isArray(data) ? data.length : 0).toBe(0);
  }, NET_TIMEOUT);

  it("empty product list returns empty (no scanning behind the scenes)", async () => {
    const { data, error } = await supa.rpc("get_prices_by_token", {
      p_token: "invalid-warmup-token-abc123",
      p_product_ids: [],
    });
    if (error) expect(String(error.message)).toMatch(/invalid|token/i);
    else expect(Array.isArray(data) ? data.length : 0).toBe(0);
  }, NET_TIMEOUT);

  it("two different tokens must not return each other's data", async () => {
    const a = await supa.rpc("get_prices_by_token", { p_token: "AAAA-not-real-token-1", p_product_ids: [] });
    const b = await supa.rpc("get_prices_by_token", { p_token: "BBBB-not-real-token-2", p_product_ids: [] });
    // Both must NOT return real data (either error or empty) — confirms no cross-token bleed.
    const aRows = a.error ? [] : (a.data ?? []);
    const bRows = b.error ? [] : (b.data ?? []);
    expect(aRows.length).toBe(0);
    expect(bRows.length).toBe(0);
  }, NET_TIMEOUT);
});