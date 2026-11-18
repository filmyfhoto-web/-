import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderHook, act } from "@testing-library/react";
import { createOnceGuard, useSubmitGuard } from "@/hooks/useSubmitGuard";
import { resolveRoleHome, shouldRedirect, NO_ACCESS_PATH, WELCOME_PATH } from "@/lib/roleHome";
import { lineErrorMessage } from "@/lib/lineOauth";

const app = readFileSync("src/App.tsx", "utf8");

describe("role/auth routing shell", () => {
  it("keeps /no-access as a public terminal screen (no auth bounce, no loop)", () => {
    expect(app).toMatch(/path="\/no-access" element=\{<NoAccess \/>\}/);
    expect(shouldRedirect(NO_ACCESS_PATH, WELCOME_PATH)).toBe(false);
    expect(resolveRoleHome({ signedIn: true })).toBe(NO_ACCESS_PATH);
  });

  it("sends signed-out customers on /account to the LINE login with a safe next", () => {
    expect(app).toMatch(/path="\/account" element=\{<RequireCustomerAuth>/);
    const guards = readFileSync("src/components/RouteGuards.tsx", "utf8");
    expect(guards).toMatch(/\/customer\/login\?next=/);
    expect(guards).toMatch(/!raw\.startsWith\("\/\/"\)/);
  });

  it("exposes public legal routes at both aliases", () => {
    for (const p of ["/privacy", "/terms", "/privacy-policy", "/terms-of-use"]) {
      expect(app).toContain(`path="${p}"`);
    }
  });

  it("keeps Orders and Promotions navigation hidden", () => {
    expect(app).toMatch(/path="\/admin\/orders" element=\{<Navigate/);
    expect(app).not.toMatch(/element=\{<Promotions/);
  });

  it("never uses a LIFF shop link as the customer login fallback", () => {
    const gate = readFileSync("src/components/RequireLineLink.tsx", "utf8");
    expect(gate).not.toMatch(/assign\(`\/l\/shop/);
    expect(gate).toMatch(/\/customer\/login\?next=/);
  });
});

describe("LINE OAuth error mapping", () => {
  it("returns friendly Thai text and leaks no technical token wording", () => {
    for (const code of ["id_token_invalid", "state_expired", "state_replay", "nonce_mismatch"]) {
      const msg = lineErrorMessage(code);
      expect(msg.length).toBeGreaterThan(0);
      expect(msg).not.toMatch(/token|state|nonce/i);
    }
    expect(lineErrorMessage("access_denied")).toContain("ยกเลิก");
  });
});

describe("duplicate submit guard", () => {
  it("ignores a second call while the first is still running", async () => {
    let calls = 0;
    const { result } = renderHook(() => useSubmitGuard());
    let release!: () => void;
    const pending = new Promise<void>((r) => { release = r; });
    await act(async () => {
      void result.current.run(async () => { calls++; await pending; });
      void result.current.run(async () => { calls++; });
    });
    expect(calls).toBe(1);
    await act(async () => { release(); });
    expect(calls).toBe(1);
  });

  it("createOnceGuard dedupes by key and re-allows after completion", async () => {
    const once = createOnceGuard();
    let n = 0;
    const p = once("pay:1", async () => { n++; await Promise.resolve(); return "a"; });
    const dup = await once("pay:1", async () => { n++; return "b"; });
    await p;
    expect(dup).toBeUndefined();
    expect(n).toBe(1);
    await once("pay:1", async () => { n++; return "c"; });
    expect(n).toBe(2);
  });
});

describe("documents never mutate stock", () => {
  it("stock RPCs are only called from POS/stock/PO surfaces, not the document editor", () => {
    const editor = readFileSync("src/pages/receipts/documents/DocumentPreview.tsx", "utf8");
    expect(editor).not.toMatch(/rds_apply_document_stock|adjust_stock|rpc\("pos_/);
  });
});
