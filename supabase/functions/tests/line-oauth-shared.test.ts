// Focused tests for the server-side LINE OAuth helpers (state/nonce/PKCE +
// safe return path + id_token claim validation).
import { describe, it, expect } from "vitest";
import {
  allowedOrigin,
  safeNextPath,
  pkceChallenge,
  randomToken,
  validateIdTokenClaims,
  LINE_ISSUER,
} from "../_shared/lineOauth.ts";

const PROJECT_ID = "fc0147af-4678-4fa7-b23f-43d82e8ddfe9";

describe("allowedOrigin", () => {
  it("accepts controlled custom domains", () => {
    expect(allowedOrigin("https://www.filmyynatta.com")).toBe("https://www.filmyynatta.com");
    expect(allowedOrigin("https://filmyynatta.com")).toBe("https://filmyynatta.com");
    expect(allowedOrigin("https://nattafilmyy.today")).toBe("https://nattafilmyy.today");
    expect(allowedOrigin("https://shop.nattafilmyy.today")).toBe("https://shop.nattafilmyy.today");
    expect(allowedOrigin("https://yynatta-admin.com")).toBe("https://yynatta-admin.com");
  });
  it("accepts this project's production and preview Lovable hosts", () => {
    expect(allowedOrigin("https://www-filmyynatta-com.lovable.app")).toBe(
      "https://www-filmyynatta-com.lovable.app",
    );
    expect(allowedOrigin(`https://id-preview--${PROJECT_ID}.lovable.app`)).toBe(
      `https://id-preview--${PROJECT_ID}.lovable.app`,
    );
    expect(allowedOrigin(`https://abc123--${PROJECT_ID}.lovableproject.com`)).toBe(
      `https://abc123--${PROJECT_ID}.lovableproject.com`,
    );
    expect(allowedOrigin(`https://${PROJECT_ID}.lovableproject.com`)).toBe(
      `https://${PROJECT_ID}.lovableproject.com`,
    );
    expect(allowedOrigin("http://localhost:8080")).toBe("http://localhost:8080");
    expect(allowedOrigin("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
  });
  it("rejects other Lovable projects and foreign or insecure origins", () => {
    expect(allowedOrigin("https://app.lovable.app")).toBeNull();
    expect(allowedOrigin("https://id-preview--00000000-0000-0000-0000-000000000000.lovable.app")).toBeNull();
    expect(allowedOrigin(`https://${PROJECT_ID}-evil.lovable.app`)).toBeNull();
    expect(allowedOrigin(`https://${PROJECT_ID}.evil.com`)).toBeNull();
    expect(allowedOrigin("https://evil.com")).toBeNull();
    expect(allowedOrigin("http://filmyynatta.com")).toBeNull();
    expect(allowedOrigin("https://filmyynatta.com.evil.com")).toBeNull();
    expect(allowedOrigin("https://nattafilmyy.today.evil.com")).toBeNull();
    expect(allowedOrigin(null)).toBeNull();
  });
});

describe("edge function jwt config", () => {
  it("marks both public LINE OAuth functions as verify_jwt = false", async () => {
    const fs = await import("node:fs");
    const toml = fs.readFileSync("supabase/config.toml", "utf8");
    for (const fn of ["line-oauth-start", "line-oauth-callback"]) {
      const re = new RegExp(`\\[functions\\.${fn}\\][\\s\\S]*?verify_jwt\\s*=\\s*false`);
      expect(re.test(toml)).toBe(true);
    }
  });
});

describe("safeNextPath", () => {
  it("keeps in-app paths and rejects the rest", () => {
    expect(safeNextPath("/shop")).toBe("/shop");
    expect(safeNextPath("https://evil.com")).toBe("/account");
    expect(safeNextPath("//evil.com")).toBe("/account");
    expect(safeNextPath("/\\evil.com")).toBe("/account");
    expect(safeNextPath("/a\nb")).toBe("/account");
    expect(safeNextPath("/x?y=1#z")).toBe("/x?y=1#z");
    expect(safeNextPath("javascript:alert(1)")).toBe("/account");
    expect(safeNextPath("/" + "a".repeat(600))).toBe("/account");
    expect(safeNextPath(undefined)).toBe("/account");
  });
});

describe("state / nonce / PKCE", () => {
  it("generates unique high-entropy values", () => {
    const set = new Set(Array.from({ length: 50 }, () => randomToken(32)));
    expect(set.size).toBe(50);
    expect(randomToken(32).length).toBeGreaterThanOrEqual(40);
  });
  it("derives a deterministic S256 challenge", async () => {
    const v = "abc123";
    const a = await pkceChallenge(v);
    const b = await pkceChallenge(v);
    expect(a).toBe(b);
    expect(a).not.toContain("=");
    expect(a).not.toBe(await pkceChallenge("abc124"));
  });
});

describe("id_token claim validation", () => {
  const now = 1_700_000_000;
  const base = { iss: LINE_ISSUER, sub: "U1", aud: "chan", exp: now + 60, nonce: "n1" };
  const opts = { channelId: "chan", nonce: "n1", now };

  it("accepts a valid token", () => {
    expect(validateIdTokenClaims(base, opts)).toEqual({ ok: true });
  });
  it("rejects wrong issuer, audience, nonce, expiry and missing sub", () => {
    expect(validateIdTokenClaims({ ...base, iss: "https://evil" }, opts)).toMatchObject({ ok: false });
    expect(validateIdTokenClaims({ ...base, aud: "other" }, opts)).toMatchObject({ ok: false });
    expect(validateIdTokenClaims({ ...base, nonce: "n2" }, opts)).toMatchObject({ ok: false, error: "id_token_nonce_mismatch" });
    expect(validateIdTokenClaims({ ...base, exp: now - 1 }, opts)).toMatchObject({ ok: false, error: "id_token_expired" });
    expect(validateIdTokenClaims({ ...base, sub: undefined }, opts)).toMatchObject({ ok: false });
  });
});