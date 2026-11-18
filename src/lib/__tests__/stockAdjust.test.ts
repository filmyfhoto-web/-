import { describe, it, expect } from "vitest";
import { previewAfter, makeIdempotencyKey } from "../stockAdjust";

describe("stockAdjust preview", () => {
  it("add mode increases", () => { expect(previewAfter(5, "add", 3)).toBe(8); });
  it("reduce mode decreases", () => { expect(previewAfter(5, "reduce", 3)).toBe(2); });
  it("set mode overrides", () => { expect(previewAfter(5, "set", 12)).toBe(12); });
  it("idempotency keys unique", () => {
    const a = makeIdempotencyKey(); const b = makeIdempotencyKey();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(10);
  });
});
