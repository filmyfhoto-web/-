import { describe, it, expect, vi } from "vitest";
import { withRetry, withRetryQuery, _isRetryable } from "../supabaseRetry";

describe("supabaseRetry", () => {
  it("returns immediately on success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    expect(await withRetry(fn)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries transient errors then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockRejectedValueOnce(Object.assign(new Error("bad gateway"), { status: 502 }))
      .mockResolvedValue("ok");
    expect(await withRetry(fn, { backoffMs: [1, 1, 1] })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-retryable errors", async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error("forbidden"), { status: 403 }));
    await expect(withRetry(fn, { backoffMs: [1] })).rejects.toThrow("forbidden");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("classifies retryable conditions", () => {
    expect(_isRetryable(Object.assign(new Error("x"), { status: 503 }))).toBe(true);
    expect(_isRetryable(new Error("network error"))).toBe(true);
    expect(_isRetryable(new Error("Unauthorized"))).toBe(false);
    expect(_isRetryable(null)).toBe(false);
  });

  it("withRetryQuery retries supabase-shape responses", async () => {
    let calls = 0;
    const build = () => {
      calls++;
      if (calls < 2) {
        return Promise.resolve({ data: null, error: { message: "fetch failed" } });
      }
      return Promise.resolve({ data: [{ id: 1 }], error: null });
    };
    const res = await withRetryQuery<any>(build, { backoffMs: [1, 1, 1] });
    expect(calls).toBe(2);
    expect(res.data).toEqual([{ id: 1 }]);
  });
});