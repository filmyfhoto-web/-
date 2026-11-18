import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * fetchLoginRole must mirror the canonical permission rules exactly:
 *  - client: AuthContext DEFAULT_PERMS = { pos: true, stock: true, ... }
 *  - database: has_staff_perm() COALESCEs a missing row to true for pos/stock
 * Owners/admins always pass; a non-staff account never gains POS/stock.
 */

type Row = Record<string, unknown> | null;
const state: { roles: { role: string }[]; profile: Row; perm: Row } = {
  roles: [], profile: { staff_active: true }, perm: null,
};

vi.mock("@/integrations/supabase/client", () => {
  const table = (name: string) => ({
    select: () => ({
      eq: () => {
        if (name === "user_roles") return Promise.resolve({ data: state.roles, error: null });
        return { maybeSingle: () => Promise.resolve({ data: name === "profiles" ? state.profile : state.perm, error: null }) };
      },
    }),
  });
  return { supabase: { from: (n: string) => table(n) } };
});

const { fetchLoginRole } = await import("@/lib/fetchLoginRole");

beforeEach(() => {
  state.roles = [];
  state.profile = { staff_active: true };
  state.perm = null;
});

describe("fetchLoginRole canonical permissions", () => {
  it("owner: full access", async () => {
    state.roles = [{ role: "owner" }];
    const r = await fetchLoginRole("u1");
    expect(r).toMatchObject({ isOwner: true, isStaffAny: true, canPos: true, canStock: true });
  });

  it("admin: full access", async () => {
    state.roles = [{ role: "admin" }];
    const r = await fetchLoginRole("u1");
    expect(r).toMatchObject({ isAdmin: true, isStaffAny: true, canPos: true, canStock: true });
  });

  it("staff with can_pos=true keeps the register", async () => {
    state.roles = [{ role: "stock_staff" }];
    state.perm = { can_pos: true, can_stock: false };
    const r = await fetchLoginRole("u1");
    expect(r).toMatchObject({ isOwner: false, isStaffAny: true, canPos: true, canStock: false });
  });

  it("staff with can_pos=false is refused the register", async () => {
    state.roles = [{ role: "stock_staff" }];
    state.perm = { can_pos: false, can_stock: true };
    const r = await fetchLoginRole("u1");
    expect(r.canPos).toBe(false);
    expect(r.canStock).toBe(true);
  });

  it("staff with NO permission row gets the canonical defaults (pos+stock on)", async () => {
    state.roles = [{ role: "photo_staff" }];
    state.perm = null;
    const r = await fetchLoginRole("u1");
    expect(r).toMatchObject({ isStaffAny: true, canPos: true, canStock: true });
  });

  it("a disabled employee loses every capability", async () => {
    state.roles = [{ role: "stock_staff" }];
    state.profile = { staff_active: false };
    const r = await fetchLoginRole("u1");
    expect(r).toMatchObject({ active: false, isStaffAny: false, canPos: false, canStock: false });
  });

  it("a plain customer never gains POS/stock from a missing row", async () => {
    state.roles = [];
    state.perm = null;
    const r = await fetchLoginRole("u1");
    expect(r).toMatchObject({ isStaffAny: false, canPos: false, canStock: false });
  });

  it("no uid → nothing", async () => {
    expect(await fetchLoginRole(undefined)).toEqual({ active: false, isStaffAny: false });
  });
});
