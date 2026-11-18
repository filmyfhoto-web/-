import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn(async () => ({ data: { ok: true }, error: null })) } },
}));

import {
  isRetryableLineError,
  shouldAutoRetryLine,
  getLineRetryCount,
  resetLineRetryCount,
  retryLineLogin,
  MAX_LINE_RETRIES,
} from "@/lib/lineOauth";
import { supabase } from "@/integrations/supabase/client";

describe("LINE login auto-retry", () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetLineRetryCount();
    vi.clearAllMocks();
  });

  it("does not retry errors a restart cannot fix", () => {
    for (const c of ["access_denied", "line_already_linked", "profile_already_linked", "invalid redirect_uri"]) {
      expect(isRetryableLineError(c)).toBe(false);
      expect(shouldAutoRetryLine(c)).toBe(false);
    }
  });

  it("retries transient errors", () => {
    for (const c of ["state_invalid", "token_exchange_failed", "session_failed", ""]) {
      expect(isRetryableLineError(c)).toBe(true);
      expect(shouldAutoRetryLine(c)).toBe(true);
    }
  });

  it("stops after the retry budget and logs safe fields only", async () => {
    (supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (_fn: string, opts: { body: Record<string, unknown> }) => {
        if (opts.body.action === "log") return { data: { ok: true }, error: null };
        return { data: { ok: true, authorize_url: "https://access.line.me/x" }, error: null };
      },
    );
    Object.defineProperty(window, "location", {
      value: { origin: "https://shop.test", assign: vi.fn() },
      writable: true,
    });

    for (let i = 0; i < MAX_LINE_RETRIES; i++) {
      expect(await retryLineLogin("/shop", "state_invalid")).toBe(true);
    }
    expect(getLineRetryCount()).toBe(MAX_LINE_RETRIES);
    expect(await retryLineLogin("/shop", "state_invalid")).toBe(false);
    expect(shouldAutoRetryLine("state_invalid")).toBe(false);

    const logs = (supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[1].body as Record<string, unknown>)
      .filter((b) => b.action === "log");
    expect(logs.length).toBe(MAX_LINE_RETRIES);
    const forbidden = ["handoff", "code", "token_hash", "state", "email", "access_token"];
    for (const b of logs) {
      for (const k of Object.keys(b)) expect(forbidden).not.toContain(k);
      expect(b.step).toBe("client_retry");
      expect(b.next).toBe("/shop");
    }
  });
});
