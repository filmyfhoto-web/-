import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { getSession, refreshSession, startAutoRefresh, stopAutoRefresh } = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  startAutoRefresh: vi.fn(),
  stopAutoRefresh: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession, refreshSession, startAutoRefresh, stopAutoRefresh },
  },
}));

import { startSessionKeepAlive } from "../sessionKeepAlive";

describe("sessionKeepAlive", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getSession.mockReset();
    refreshSession.mockReset().mockResolvedValue({ error: null });
    startAutoRefresh.mockReset();
    stopAutoRefresh.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes a session that is close to expiry and checks again while visible", async () => {
    getSession.mockResolvedValue({
      data: { session: { expires_at: Math.floor((Date.now() + 10_000) / 1000) } },
    });
    const cleanup = startSessionKeepAlive();
    await Promise.resolve();
    await Promise.resolve();
    expect(startAutoRefresh).toHaveBeenCalled();
    expect(refreshSession).toHaveBeenCalledTimes(1);

    refreshSession.mockClear();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("does not refresh a session with more than five minutes remaining", async () => {
    getSession.mockResolvedValue({
      data: { session: { expires_at: Math.floor((Date.now() + 10 * 60_000) / 1000) } },
    });
    const cleanup = startSessionKeepAlive();
    await Promise.resolve();
    await Promise.resolve();
    expect(refreshSession).not.toHaveBeenCalled();
    cleanup();
  });
});
