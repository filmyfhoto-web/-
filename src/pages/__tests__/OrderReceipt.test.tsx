import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { LineCustomerProfile } from "@/contexts/LineCustomerContext";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => {
  const actual = await orig<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

const rpcMock = vi.fn();
const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

// Guest session is empty — the LINE customer has NO guest session.
vi.mock("@/contexts/GuestContext", () => ({
  useGuest: () => ({ session: null, setSession: vi.fn(), clear: vi.fn() }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ profile: null }) }));
vi.mock("@/contexts/CartContext", () => ({ useCart: () => ({ count: 0 }) }));
vi.mock("@/hooks/useRealtimeTable", () => ({ useRealtimeTables: () => ({ live: false }) }));
vi.mock("@/components/SeoHead", () => ({ default: () => null }));
vi.mock("@/components/InstallPrompt", () => ({ LiveDot: () => null }));
vi.mock("@/components/layout/CustomerLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

let mockProfile: LineCustomerProfile | null = null;
vi.mock("@/contexts/LineCustomerContext", () => ({
  useLineCustomer: () => ({ profile: mockProfile, setProfile: vi.fn(), clear: vi.fn() }),
}));

vi.mock("@/lib/lineSession", () => ({
  readIdToken: () => "id-token-123",
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("html2canvas", () => ({ default: vi.fn() }));
vi.mock("jspdf", () => ({ default: vi.fn() }));

import OrderReceipt from "../OrderReceipt";

function renderPage(id = "ord-1") {
  return render(
    <MemoryRouter initialEntries={[`/my-orders/${id}/receipt`]}>
      <Routes>
        <Route path="/my-orders/:id/receipt" element={<OrderReceipt />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  navigateMock.mockReset();
  rpcMock.mockReset();
  invokeMock.mockReset();
  rpcMock.mockResolvedValue({ data: [{ store_name: "ร้านทดสอบ" }], error: null });
  mockProfile = {
    line_user_id: "U-owner",
    display_name: "ลูกค้า LINE",
    customer_id: null,
    customer_source: null,
    customer_name: null,
    phone: null,
    picture_url: null,
    verified_at: new Date().toISOString(),
  };
});

describe("OrderReceipt (LINE customer, no guest session)", () => {
  it("loads receipt via my-line-orders detail using id_token only (no client-supplied identity)", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        order: {
          id: "ord-1",
          order_no: "N-001",
          receipt_no: "R-001",
          receipt_issued_at: "2026-07-20T00:00:00Z",
          total: 100,
        },
        items: [],
        organization: null,
      },
      error: null,
    });
    renderPage("ord-1");
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    const [fn, opts] = invokeMock.mock.calls[0];
    expect(fn).toBe("my-line-orders");
    const body = (opts as any).body;
    expect(body).toMatchObject({ action: "detail", order_id: "ord-1", id_token: "id-token-123" });
    // Guard: no client-supplied ownership fields leak into the request.
    expect(body.phone).toBeUndefined();
    expect(body.customer_id).toBeUndefined();
    expect(body.line_user_id).toBeUndefined();
    expect(body.guest_id).toBeUndefined();
    // Does NOT redirect to /shop just because guest session is empty.
    expect(navigateMock).not.toHaveBeenCalledWith("/shop");
    // Legacy RPC must not run when a LINE proof is present.
    expect(rpcMock).not.toHaveBeenCalledWith("get_guest_order_receipt", expect.anything());
    await waitFor(() => expect(screen.getByText("R-001")).toBeInTheDocument());
  });

  it("shows Thai 'not issued yet' state when receipt_issued_at is missing", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        order: { id: "ord-2", order_no: "N-002", receipt_issued_at: null },
        items: [],
        organization: null,
      },
      error: null,
    });
    renderPage("ord-2");
    await waitFor(() =>
      expect(screen.getByText(/ยังไม่ได้ออกใบเสร็จ/)).toBeInTheDocument(),
    );
  });

  it("shows forbidden state when the server rejects ownership of another customer's order", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { error: "forbidden" },
      error: null,
    });
    renderPage("ord-someone-else");
    await waitFor(() =>
      expect(screen.getByText(/ไม่มีสิทธิ์ดูใบเสร็จ/)).toBeInTheDocument(),
    );
    // Ensure we never fell back to the legacy guest RPC to try to bypass.
    expect(rpcMock).not.toHaveBeenCalledWith("get_guest_order_receipt", expect.anything());
  });
});
