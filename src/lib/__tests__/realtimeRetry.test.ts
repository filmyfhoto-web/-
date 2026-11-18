import { describe, it, expect } from "vitest";
import { realtimeRetryDelay } from "@/lib/realtimeChannel";

describe("realtimeRetryDelay", () => {
  it("grows with attempts and caps at 30s", () => {
    expect(realtimeRetryDelay(1)).toBeLessThanOrEqual(1500);
    expect(realtimeRetryDelay(2)).toBeGreaterThanOrEqual(1500);
    expect(realtimeRetryDelay(20)).toBeLessThanOrEqual(45000);
    expect(realtimeRetryDelay(20)).toBeGreaterThanOrEqual(22500);
  });
});
