import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type React from "react";

vi.mock("@/components/layout/AdminLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

type InvokeArgs = [string, { body: Record<string, unknown> }];
const invoke = vi.fn(async (..._args: InvokeArgs) => ({ data: { ok: true }, error: null }));

const outboxRow = {
  id: "row-1",
  created_at: "2026-08-05T10:00:00Z",
  sent_at: null,
  event_type: "new_order",
  ref_type: "order",
  ref_id: "11111111-1111-1111-1111-111111111111",
  recipient: "U0123456789abcdef0123456789abcdef",
  status: "failed",
  attempts: 2,
  next_retry_at: null,
  last_error: "line_http_500",
  provider_message_id: null,
  payload: { text: "hello" },
};

const selfTestRow = {
  ...outboxRow,
  id: "row-2",
  event_type: "system_self_test",
  ref_type: "system_self_test",
  recipient: "SELFTEST",
  status: "sent",
  last_error: null,
};

let runRow: Record<string, unknown> = {
  id: "run-1",
  trigger_source: "cron",
  started_at: new Date().toISOString(),
  finished_at: new Date().toISOString(),
  claimed: 3, sent: 2, failed: 1, dead: 0, error: null,
};

vi.mock("@/integrations/supabase/client", () => {
  const builder = (rows: unknown[]) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      limit: async () => ({ data: rows, error: null }),
    };
    return chain;
  };
  return {
    supabase: {
      from: (t: string) => builder(t === "notification_outbox" ? [outboxRow, selfTestRow] : [runRow]),
      functions: { invoke: (...a: InvokeArgs) => invoke(...a) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {},
    },
  };
});

import NotificationCenter from "../NotificationCenter";

/** The readiness probe fires on mount; assertions care about dispatcher calls. */
const dispatchCalls = () => invoke.mock.calls.filter(([fn]) => fn === "notify-dispatch");

describe("NotificationCenter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runRow = {
      id: "run-1", trigger_source: "cron",
      started_at: new Date().toISOString(), finished_at: new Date().toISOString(),
      claimed: 3, sent: 2, failed: 1, dead: 0, error: null,
    };
  });

  it("renders the dispatcher health card from notification_dispatch_runs", async () => {
    render(<NotificationCenter />);
    const card = await screen.findByTestId("dispatch-health");
    expect(card.textContent).toContain("ทำงานปกติ");
    expect(card.textContent).toContain("ระบบทำงานทุก 1 นาที");
    expect(card.textContent).toContain("claimed 3");
    expect(card.textContent).toContain("sent 2");
    expect(card.textContent).toContain("failed 1");
    expect(card.textContent).toContain("dead 0");
  });

  it("confirms before resending and always sends a client_request_id", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<NotificationCenter />);
    fireEvent.click(await screen.findByRole("button", { name: "ส่งใหม่" }));
    await waitFor(() => expect(dispatchCalls().length).toBe(1));
    expect(confirmSpy).toHaveBeenCalled();
    const [fn, opts] = dispatchCalls()[0];
    expect(fn).toBe("notify-dispatch");
    expect(opts.body.action).toBe("enqueue");
    expect(opts.body.client_request_id).toBe("manual:row-1");
    expect(opts.body.outbox_id).toBe("row-1");
    // The browser must never choose a destination.
    expect(opts.body.recipient).toBeUndefined();
    expect(opts.body.text).toBeUndefined();
    confirmSpy.mockRestore();
  });

  it("does not resend when the confirmation is dismissed", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<NotificationCenter />);
    fireEvent.click(await screen.findByRole("button", { name: "ส่งใหม่" }));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect(dispatchCalls()).toHaveLength(0);
    confirmSpy.mockRestore();
  });

  it("shows queue counts and the oldest waiting item", async () => {
    render(<NotificationCenter />);
    const counts = await screen.findByTestId("queue-counts");
    expect(counts.textContent).toContain("ไม่สำเร็จ 1");
    expect(counts.textContent).toContain("รายการค้างนานสุด");
  });

  it("warns when no successful run happened for more than 3 minutes", async () => {
    runRow = {
      ...runRow,
      started_at: new Date(Date.now() - 10 * 60_000).toISOString(),
      finished_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    };
    render(<NotificationCenter />);
    const warn = await screen.findByTestId("stale-warning");
    expect(warn.textContent).toContain("เกิน 3 นาที");
  });

  it("runs the safe self-test through the dispatcher without touching LINE", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<NotificationCenter />);
    fireEvent.click(await screen.findByTestId("selftest-btn"));
    await waitFor(() => expect(dispatchCalls().length).toBe(1));
    const [fn, opts] = dispatchCalls()[0];
    expect(fn).toBe("notify-dispatch");
    expect(opts.body.action).toBe("self_test");
    expect(String(opts.body.client_request_id)).toMatch(/^selftest:/);
    confirmSpy.mockRestore();
  });

  it("reports the dry-run result including duplicate suppression", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    invoke.mockImplementation(async (fn: string) =>
      fn === "notify-dispatch"
        ? { data: { ok: true, rows: 1, claimed: 1, sent: 1, duplicate_suppressed: true }, error: null }
        : { data: { ok: true }, error: null });
    render(<NotificationCenter />);
    fireEvent.click(await screen.findByTestId("selftest-btn"));
    const res = await screen.findByTestId("selftest-result");
    expect(res.textContent).toContain("คิว 1 รายการ");
    expect(res.textContent).toContain("หยิบ 1");
    expect(res.textContent).toContain("ส่ง 1");
    expect(res.textContent).toContain("ไม่เกิดรายการซ้ำ");
    confirmSpy.mockRestore();
  });

  it("asks for confirmation before draining the queue", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<NotificationCenter />);
    fireEvent.click(await screen.findByRole("button", { name: /ส่งคิวที่ค้าง/ }));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect(dispatchCalls()).toHaveLength(0);
    confirmSpy.mockRestore();
  });

  it("hides self-test rows until the operator asks for them", async () => {
    render(<NotificationCenter />);
    expect(await screen.findByText("new_order")).toBeTruthy();
    expect(screen.queryAllByText("system_self_test")).toHaveLength(0);
    fireEvent.click(screen.getByTestId("toggle-tests"));
    expect((await screen.findAllByText("system_self_test")).length).toBeGreaterThan(0);
  });

  it("shows LINE configuration readiness", async () => {
    render(<NotificationCenter />);
    const badge = await screen.findByTestId("line-readiness");
    await waitFor(() => expect(badge.textContent).toContain("ตั้งค่า LINE พร้อมใช้งาน"));
  });
});
