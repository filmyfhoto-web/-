import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkRateLimit, resetRateLimits, tooManyRequests } from "../../../supabase/functions/_shared/rateLimit";
import { createThrottledRefresh } from "../throttleRefresh";

describe("edge rate limiter", () => {
  beforeEach(() => resetRateLimits());

  it("allows up to the limit inside the window", () => {
    for (let i = 0; i < 5; i++) expect(checkRateLimit("k", { limit: 5, windowMs: 1000 }, 1000 + i).ok).toBe(true);
    expect(checkRateLimit("k", { limit: 5, windowMs: 1000 }, 1005).ok).toBe(false);
  });

  it("recovers after the window slides", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("k2", { limit: 3, windowMs: 1000 }, 1000);
    expect(checkRateLimit("k2", { limit: 3, windowMs: 1000 }, 1500).ok).toBe(false);
    expect(checkRateLimit("k2", { limit: 3, windowMs: 1000 }, 2500).ok).toBe(true);
  });

  it("keys are independent", () => {
    expect(checkRateLimit("a", { limit: 1, windowMs: 1000 }, 0).ok).toBe(true);
    expect(checkRateLimit("b", { limit: 1, windowMs: 1000 }, 0).ok).toBe(true);
    expect(checkRateLimit("a", { limit: 1, windowMs: 1000 }, 0).ok).toBe(false);
  });

  it("429 response carries Retry-After", async () => {
    const res = tooManyRequests({ ok: false, remaining: 0, retryAfterSec: 7 });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("7");
    expect((await res.json()).error).toBe("rate_limited");
  });
});

describe("createThrottledRefresh", () => {
  it("runs immediately then collapses a burst into one trailing call", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const t = createThrottledRefresh(fn, 1000);
    t(); t(); t(); t();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1100);
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
