import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const linkRow = {
  id: "link-1", user_id: "user-1",
  line_user_id: "U0123456789abcdef0123456789abcdef",
  display_name: "Admin", link_token: "tok", linked_at: "2026-08-01T00:00:00Z",
};

type OutboxRow = { status: string; sent_at: string | null; last_error: string | null; created_at: string } | null;
let outboxRow: OutboxRow = { status: "sent", sent_at: "2026-08-05T10:00:00Z", last_error: null, created_at: "2026-08-05T10:00:00Z" };
type InvokeArgs = [string, { body: Record<string, unknown> }];
const invoke = vi.fn(async (..._args: InvokeArgs) => ({ data: { ok: true }, error: null }));

vi.mock("@/film-shop/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/film-shop/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: true, loading: false }) }));

vi.mock("@/film-shop/lib/supabase", () => {
  const chain = (result: unknown) => {
    const c: Record<string, unknown> = {
      select: () => c, eq: () => c, order: () => c, limit: () => c, update: () => c,
      maybeSingle: async () => ({ data: result, error: null }),
      then: undefined,
    };
    return c;
  };
  return {
    supabase: {
      from: (t: string) => chain(t === "notification_outbox" ? outboxRow : linkRow),
      functions: { invoke: (...a: InvokeArgs) => invoke(...a) },
    },
  };
});

import { LineAccountLink } from "../LineAccountLink";

describe("LineAccountLink — test status comes from the server, never localStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    outboxRow = { status: "sent", sent_at: "2026-08-05T10:00:00Z", last_error: null, created_at: "2026-08-05T10:00:00Z" };
  });

  it("shows the test as successful when the server outbox row is sent", async () => {
    render(<LineAccountLink />);
    await waitFor(() => expect(screen.getByText(/ทดสอบส่งข้อความสำเร็จ/).className).toContain("text-foreground"));
    expect(localStorage.getItem("line_test_sent_ok")).toBeNull();
  });

  it("does not claim success when the server has no test row", async () => {
    outboxRow = null;
    render(<LineAccountLink />);
    await waitFor(() => expect(screen.getByRole("button", { name: /ส่งข้อความทดสอบ/ })).toBeTruthy());
    expect(screen.getByText(/ทดสอบส่งข้อความสำเร็จ/).className).toContain("text-muted-foreground");
  });

  it("enqueues the test through the outbox with a client_request_id and writes no localStorage flag", async () => {
    outboxRow = null;
    render(<LineAccountLink />);
    fireEvent.click(await screen.findByRole("button", { name: /ส่งข้อความทดสอบ/ }));
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    const [fn, opts] = invoke.mock.calls[0];
    expect(fn).toBe("notify-dispatch");
    expect(opts.body.action).toBe("enqueue");
    expect(opts.body.ref_type).toBe("admin_line_test");
    expect(String(opts.body.client_request_id)).toContain("admin_line_test:user-1");
    expect(localStorage.length).toBe(0);
  });
});
