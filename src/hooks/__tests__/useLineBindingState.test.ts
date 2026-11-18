import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const invokeFn = vi.fn();
const getSession = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: (...a: any[]) => getSession(...a) },
    functions: { invoke: (...a: any[]) => invokeFn(...a) },
  },
}));

vi.mock("@/lib/lineSession", () => ({
  readIdToken: () => "tok",
  clearIdToken: vi.fn(),
}));

import {
  useLineBindingState,
  refreshLineBinding,
  __resetLineBindingStateForTests,
  maskLineUserId,
} from "../useLineBindingState";

const BOUND = {
  data: {
    bound: true,
    line_user_id: "U" + "a".repeat(32),
    display_name: "ลูกค้า A",
    friend_confirmed: true,
    friend_status: "friend",
  },
  error: null,
};

describe("useLineBindingState", () => {
  beforeEach(() => {
    __resetLineBindingStateForTests();
    invokeFn.mockReset();
    getSession.mockResolvedValue({ data: { session: { access_token: "x" } } });
  });

  it("links once and stays linked across route changes without re-asking the server", async () => {
    invokeFn.mockResolvedValue(BOUND);
    const { result } = renderHook(() => useLineBindingState());
    await waitFor(() => expect(result.current.isLinked).toBe(true));
    // Simulate several navigations / remounts inside the freshness window.
    await act(async () => { await refreshLineBinding(); await refreshLineBinding(); });
    renderHook(() => useLineBindingState());
    await waitFor(() => expect(invokeFn).toHaveBeenCalledTimes(1));
    expect(result.current.status).toBe("linked");
  });

  it("shares a single in-flight request between concurrent callers", async () => {
    invokeFn.mockResolvedValue(BOUND);
    await act(async () => {
      await Promise.all([refreshLineBinding(true), refreshLineBinding(true), refreshLineBinding(true)]);
    });
    expect(invokeFn).toHaveBeenCalledTimes(1);
  });

  it("keeps a linked customer linked when the lookup fails transiently", async () => {
    invokeFn.mockResolvedValueOnce(BOUND);
    await act(async () => { await refreshLineBinding(true); });
    invokeFn.mockRejectedValueOnce(new Error("network"));
    await act(async () => { await refreshLineBinding(true); });
    expect((await refreshLineBinding()).status).toBe("linked");
  });

  it("treats a 401 proof as unlinked, not an error", async () => {
    invokeFn.mockResolvedValue({ data: null, error: { context: { response: { status: 401 } } } });
    await act(async () => { await refreshLineBinding(true); });
    expect((await refreshLineBinding()).status).toBe("unlinked");
  });

  it("routes a non-friend binding to the add-friend step", async () => {
    invokeFn.mockResolvedValue({
      data: { bound: true, line_user_id: "U" + "b".repeat(32), friend_confirmed: false, friend_status: "not_friend" },
      error: null,
    });
    await act(async () => { await refreshLineBinding(true); });
    expect((await refreshLineBinding()).status).toBe("needs_friend");
  });

  it("never exposes the full LINE user id", () => {
    const id = "U" + "c".repeat(32);
    const masked = maskLineUserId(id);
    expect(masked).not.toContain(id);
    expect(masked).toContain("…");
  });
});