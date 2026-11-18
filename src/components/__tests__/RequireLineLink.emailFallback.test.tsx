import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RequireLineLink, { __resetVerifiedCacheForTests } from "@/components/RequireLineLink";

// เฟส 1 ปิดหน้าลูกค้าไว้ — เทสต์ชุดนี้คุมพฤติกรรมตอนเปิดกลับ
vi.mock("@/lib/legacyUi", () => ({ LEGACY_CUSTOMER_UI: true, LEGACY_OPS_MENUS: true }));


const useAuthMock = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));

const invokeMock = vi.fn();
const getSessionMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invokeMock(...a) },
    auth: { getSession: () => getSessionMock() },
    rpc: vi.fn(async () => ({ data: [] })),
  },
}));

function renderGate() {
  return render(
    <MemoryRouter initialEntries={["/shop"]}>
      <RequireLineLink><div>SHOP_CONTENT</div></RequireLineLink>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  __resetVerifiedCacheForTests();
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({ isStaffAny: false, loading: false });
  invokeMock.mockReset();
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue({ data: { session: { user: { id: "u1" } } } } as any);
});

describe("LINE binding is mandatory for customers", () => {
  it("blocks an e-mail-authenticated customer with no LINE binding", async () => {
    invokeMock.mockResolvedValueOnce({ data: { bound: false }, error: null });
    renderGate();
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("SHOP_CONTENT")).not.toBeInTheDocument());
    expect(screen.queryByTestId("line-fallback-banner")).not.toBeInTheDocument();
  });

  it("blocks when the LINE lookup fails with 401", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: Object.assign(new Error("unauthorized"), { context: { response: { status: 401 } } }),
    });
    renderGate();
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("SHOP_CONTENT")).not.toBeInTheDocument());
  });

  it("blocks (retry screen) when the LINE lookup is unreachable", async () => {
    invokeMock.mockRejectedValueOnce(new Error("network down"));
    renderGate();
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("SHOP_CONTENT")).not.toBeInTheDocument());
  });

  it("lets a bound customer through", async () => {
    invokeMock.mockResolvedValueOnce({ data: { bound: true, friend_confirmed: true, line_user_id: "U1" }, error: null });
    renderGate();
    expect(await screen.findByText("SHOP_CONTENT")).toBeInTheDocument();
  });

  it("still requires sign-in when there is no session at all", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } } as any);
    renderGate();
    await waitFor(() => expect(screen.queryByText("SHOP_CONTENT")).not.toBeInTheDocument());
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
