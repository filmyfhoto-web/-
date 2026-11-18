import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: any[]) => invoke(...a) } },
}));

import { startLineLink, lineErrorMessage, safeNext } from "@/lib/lineOauth";

describe("startLineLink (link mode)", () => {
  beforeEach(() => invoke.mockReset());

  it("asks the server for link mode and never sends a user id", async () => {
    invoke.mockResolvedValue({ data: { ok: true, authorize_url: "https://access.line.me/x" }, error: null });
    const url = await startLineLink("/account/line?linked=1");
    expect(url).toBe("https://access.line.me/x");
    const [fn, opts] = invoke.mock.calls[0];
    expect(fn).toBe("line-oauth-start");
    expect(opts.body.mode).toBe("link");
    expect(opts.body.next).toBe("/account/line?linked=1");
    expect(JSON.stringify(opts.body)).not.toMatch(/user_id/i);
  });

  it("falls back to the link page for an external next", async () => {
    invoke.mockResolvedValue({ data: { ok: true, authorize_url: "https://access.line.me/x" }, error: null });
    await startLineLink("https://evil.example.com/steal");
    expect(invoke.mock.calls[0][1].body.next).toBe("/account/line");
    expect(safeNext("//evil.com", "/account/line")).toBe("/account/line");
  });

  it("surfaces the server error code", async () => {
    invoke.mockResolvedValue({ data: { ok: false, error: "not_authenticated" }, error: null });
    await expect(startLineLink()).rejects.toThrow("not_authenticated");
  });

  it("maps link-specific error codes to Thai messages", () => {
    expect(lineErrorMessage("line_already_linked")).toContain("ผู้ใช้รายอื่น");
    expect(lineErrorMessage("profile_already_linked")).toContain("LINE อื่น");
    expect(lineErrorMessage("not_authenticated")).toContain("เข้าสู่ระบบก่อน");
    expect(lineErrorMessage("link_failed")).toContain("ไม่สำเร็จ");
  });
});
