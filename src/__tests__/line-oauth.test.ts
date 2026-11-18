import { describe, it, expect } from "vitest";
import { safeNext, lineErrorMessage } from "@/lib/lineOauth";

describe("safeNext rejection", () => {
  it("keeps plain in-app paths", () => {
    expect(safeNext("/shop")).toBe("/shop");
    expect(safeNext("/my-orders?tab=open")).toBe("/my-orders?tab=open");
  });

  it("rejects unsafe targets", () => {
    for (const bad of [
      "https://evil.com/x",
      "//evil.com",
      "/\\evil.com",
      "javascript:alert(1)",
      "shop",
      "",
      null,
      undefined,
      42,
    ]) {
      expect(safeNext(bad as unknown)).toBe("/account");
    }
  });

  it("uses the provided fallback", () => {
    expect(safeNext("https://evil.com", "/shop")).toBe("/shop");
  });
});

describe("login error mapping", () => {
  it("returns friendly Thai copy without leaking codes", () => {
    const cases = ["access_denied", "state_invalid", "verify_failed", "session_failed", "boom"];
    for (const c of cases) {
      const msg = lineErrorMessage(c);
      expect(msg.length).toBeGreaterThan(5);
      expect(msg).not.toContain(c);
      expect(/[ก-๙]/.test(msg)).toBe(true);
    }
  });

  it("is empty when there is no error", () => {
    expect(lineErrorMessage("")).toBe("");
    expect(lineErrorMessage(null)).toBe("");
  });
});