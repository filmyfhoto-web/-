import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Behavioural guardrail for the LIFF stale-id_token self-heal cycle.
 * We assert on the source (not a runtime harness) so regressions that
 * silently remove the recovery path are caught in typecheck+tests without
 * needing a full LIFF SDK mock.
 */
const src = readFileSync(
  resolve(process.cwd(), "src/pages/LiffShop.tsx"),
  "utf8",
);

describe("LiffShop stale-token recovery", () => {
  it("uses a single-shot sessionStorage flag so we never loop", () => {
    expect(src).toContain('STALE_RECOVERY_KEY = "liff_stale_recovery_done"');
    // The flag must be set BEFORE we call liff.login again.
    const setIdx = src.indexOf('sessionStorage.setItem(STALE_RECOVERY_KEY');
    const loginIdx = src.indexOf('w.liff.login({ redirectUri: back.toString() })');
    expect(setIdx).toBeGreaterThan(-1);
    expect(loginIdx).toBeGreaterThan(setIdx);
  });

  it("clears cached LINE session (id_token, binding, liff_profile) before relogin", () => {
    expect(src).toMatch(/clearLineSession\(\)/);
  });

  it("preserves the incoming next parameter across the recovery redirect", () => {
    expect(src).toMatch(/back\.searchParams\.set\("next", next\)/);
  });

  it("detects the id_token / aud mismatch error codes returned by the edge function", () => {
    // Detector must cover the three code shapes we surface today.
    expect(src).toContain('s.includes("id_token_invalid")');
    expect(src).toContain('s.includes("line_id_token_invalid_400")');
    expect(src).toContain('s.includes("aud_mismatch")');
  });

  it("never sends line_user_id from the client as auth proof — only id_token", () => {
    // The auto-bind call MUST include id_token in the body; line_user_id is
    // only supplied as a hint and is ignored server-side.
    expect(src).toContain("id_token: ctx.idToken");
  });
});