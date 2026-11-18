import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import RequireLineLink, { __resetVerifiedCacheForTests } from "@/components/RequireLineLink";
import { writeIdToken } from "@/lib/lineSession";

// เฟส 1 ปิดหน้าลูกค้าไว้ — เทสต์ชุดนี้คุมพฤติกรรมตอนเปิดกลับ
vi.mock("@/lib/legacyUi", () => ({ LEGACY_CUSTOMER_UI: true, LEGACY_OPS_MENUS: true }));


// Every customer surface listed in the requirement below is proxied by
// this test through the REAL RequireLineLink gate to prove:
//   - anonymous direct URL access shows the onboarding gate
//   - authenticated (server-verified) access renders the protected marker
//   - staff bypass still works
//   - after logout, /shop back-navigation cannot show cached content
//
// We stub the page bodies with a unique protected marker per route so we
// can assert the marker never appears in the anonymous case.

const useAuthMock = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));

const invokeMock = vi.fn();
const getSessionMock = vi.fn(async () => ({ data: { session: null } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invokeMock(...a) },
    auth: { getSession: (...a: unknown[]) => getSessionMock(...(a as [])) },
    rpc: vi.fn(async () => ({ data: [{ line_add_friend_url: "https://line.me/R/ti/p/@shop" }] })),
  },
}));

const PROTECTED_ROUTES = [
  { path: "/shop", marker: "SHOP_CONTENT" },
  { path: "/cart", marker: "CART_CONTENT" },
  { path: "/shop/account", marker: "SHOP_ACCOUNT_CONTENT" },
  { path: "/my-account", marker: "MY_ACCOUNT_CONTENT" },
  { path: "/my-orders", marker: "MY_ORDERS_CONTENT" },
  { path: "/my-orders/:id", marker: "MY_ORDER_DETAIL_CONTENT" },
  { path: "/my-orders/:id/receipt", marker: "MY_ORDER_RECEIPT_CONTENT" },
  { path: "/quote-status/:id", marker: "QUOTE_STATUS_CONTENT" },
] as const;

function renderRoute(initial: string, path: string, marker: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route
          path={path}
          element={
            <RequireLineLink>
              <div>{marker}</div>
            </RequireLineLink>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function concreteUrl(path: string) {
  return path.replace(":id", "ord-1");
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  __resetVerifiedCacheForTests();
  useAuthMock.mockReset();
  invokeMock.mockReset();
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue({ data: { session: null } } as any);
});

describe("Customer route gate — anonymous direct access is denied", () => {
  for (const { path, marker } of PROTECTED_ROUTES) {
    it(`${path} — no id_token, no supabase session → onboarding, never renders content`, async () => {
      useAuthMock.mockReturnValue({ isStaffAny: false, loading: false });
      renderRoute(concreteUrl(path), path, marker);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /เข้าสู่ระบบด้วย LINE/i })).toBeInTheDocument(),
      );
      expect(screen.queryByText(marker)).not.toBeInTheDocument();
      // Client-supplied identity must not have been sent.
      expect(invokeMock).not.toHaveBeenCalled();
    });
  }
});

describe("Customer route gate — server-verified access", () => {
  for (const { path, marker } of PROTECTED_ROUTES) {
    it(`${path} — bound+friend server response renders protected content`, async () => {
      useAuthMock.mockReturnValue({ isStaffAny: false, loading: false });
      writeIdToken("eyJ.ok.tok");
      invokeMock.mockResolvedValueOnce({
        data: { bound: true, friend_confirmed: true, friend_status: "confirmed" },
        error: null,
      });
      renderRoute(concreteUrl(path), path, marker);
      expect(await screen.findByText(marker)).toBeInTheDocument();
      // Ownership call must carry the verified id_token, never a client
      // line_user_id / phone / customer_id.
      const [, opts] = invokeMock.mock.calls[0];
      expect((opts as any).body).toEqual({ id_token: "eyJ.ok.tok" });
    });
  }
});

describe("Customer route gate — expired proof & logout", () => {
  it("401 from lookup with stale id_token → onboarding + stale token cleared, no content leaked", async () => {
    useAuthMock.mockReturnValue({ isStaffAny: false, loading: false });
    writeIdToken("eyJ.expired.tok");
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: Object.assign(new Error("unauthorized"), { context: { response: { status: 401 } } }),
    });
    renderRoute("/my-orders", "/my-orders", "MY_ORDERS_CONTENT");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /เข้าสู่ระบบด้วย LINE/i })).toBeInTheDocument(),
    );
    expect(sessionStorage.getItem("line_id_token")).toBeNull();
    expect(screen.queryByText("MY_ORDERS_CONTENT")).not.toBeInTheDocument();
  });

  it("after logoutCustomer wipes proof, /shop navigation must re-run the gate and show onboarding", async () => {
    // Simulate a prior verified session, then logout, then re-render /shop.
    useAuthMock.mockReturnValue({ isStaffAny: false, loading: false });
    writeIdToken("eyJ.ok.tok");
    invokeMock.mockResolvedValueOnce({
      data: { bound: true, friend_confirmed: true, friend_status: "confirmed" },
      error: null,
    });
    const first = renderRoute("/shop", "/shop", "SHOP_CONTENT");
    expect(await screen.findByText("SHOP_CONTENT")).toBeInTheDocument();
    first.unmount();

    // Logout wipes proofs + verified cache.
    // @ts-expect-error jsdom re-assign
    window.location = { ...window.location, replace: vi.fn() };
    const { logoutCustomer } = await import("@/lib/customerLogout");
    logoutCustomer();
    __resetVerifiedCacheForTests(); // production path relies on full reload; simulate here.

    // Back navigation to /shop must NOT render cached protected content.
    invokeMock.mockReset();
    renderRoute("/shop", "/shop", "SHOP_CONTENT");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /เข้าสู่ระบบด้วย LINE/i })).toBeInTheDocument(),
    );
    expect(screen.queryByText("SHOP_CONTENT")).not.toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("staff bypass is preserved on every protected customer route", async () => {
    useAuthMock.mockReturnValue({ isStaffAny: true, loading: false });
    for (const { path, marker } of PROTECTED_ROUTES) {
      __resetVerifiedCacheForTests();
      const { unmount } = renderRoute(concreteUrl(path), path, marker);
      expect(await screen.findByText(marker)).toBeInTheDocument();
      expect(invokeMock).not.toHaveBeenCalled();
      unmount();
    }
  });
});