import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RequireLineLink, { __resetVerifiedCacheForTests } from "@/components/RequireLineLink";
import { LineCustomerProvider } from "@/contexts/LineCustomerContext";
import { CustomerAccountMenu } from "@/components/layout/CustomerAccountMenu";
import { writeIdToken } from "@/lib/lineSession";

// เฟส 1 ปิดหน้าลูกค้าไว้ — เทสต์ชุดนี้คุมพฤติกรรมตอนเปิดกลับ
vi.mock("@/lib/legacyUi", () => ({ LEGACY_CUSTOMER_UI: true, LEGACY_OPS_MENUS: true }));


const useAuthMock = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

const invokeMock = vi.fn();
const getSessionMock = vi.fn(async () => ({ data: { session: null } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
    auth: { getSession: (...args: unknown[]) => getSessionMock(...(args as [])) },
    rpc: vi.fn(async () => ({ data: [{ line_add_friend_url: "https://line.me/R/ti/p/@shop" }] })),
  },
}));

vi.mock("@/lib/customerLogout", () => ({ logoutCustomer: vi.fn() }));

function renderWithMenu() {
  return render(
    <MemoryRouter initialEntries={["/shop"]}>
      <LineCustomerProvider>
        <RequireLineLink>
          <div>
            <CustomerAccountMenu />
            <span>SECRET_SHOP_CONTENT</span>
          </div>
        </RequireLineLink>
      </LineCustomerProvider>
    </MemoryRouter>,
  );
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

describe("RequireLineLink → LineCustomerProfile hydration", () => {
  it("populates verified profile from bound response (line_user_id + display_name) so account menu renders name/menu items/logout", async () => {
    useAuthMock.mockReturnValue({ isStaffAny: false, loading: false });
    writeIdToken("eyJ.tok.bound");
    invokeMock.mockResolvedValueOnce({
      data: {
        bound: true,
        line_user_id: "Uverified123",
        display_name: "สมชาย ทดสอบ",
        phone: "0812345678",
        customer_id: null,
        customer_source: null,
        customer_name: null,
        verified_at: new Date().toISOString(),
        friend_confirmed: true,
        friend_status: "confirmed",
      },
      error: null,
    });

    renderWithMenu();
    await screen.findByText("SECRET_SHOP_CONTENT");

    // Trigger button carries the verified display name in its aria-label.
    const trigger = await screen.findByRole("button", { name: /บัญชีของ สมชาย ทดสอบ/i });
    expect(trigger).toBeInTheDocument();

    // Visible name label appears in the trigger (menu items are covered
    // in CustomerAccountMenu.test.tsx — this test is scoped to verifying
    // that RequireLineLink hydrates the profile from the server response).
    expect(trigger.getAttribute("title")).toBe("สมชาย ทดสอบ");
    expect(trigger.textContent).toContain("สมชาย ทดสอบ");
  });

  it("unverified callers (401) receive no PII → account menu renders nothing", async () => {
    useAuthMock.mockReturnValue({ isStaffAny: false, loading: false });
    writeIdToken("eyJ.expired");
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: Object.assign(new Error("unauthorized"), { context: { response: { status: 401 } } }),
    });

    renderWithMenu();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /เข้าสู่ระบบด้วย LINE/i })).toBeInTheDocument(),
    );
    // No customer account UI is exposed to unverified callers.
    expect(screen.queryByRole("button", { name: /บัญชีของ/i })).not.toBeInTheDocument();
  });
});