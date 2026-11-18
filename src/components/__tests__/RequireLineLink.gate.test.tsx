import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RequireLineLink, { __resetVerifiedCacheForTests } from "@/components/RequireLineLink";
import { writeIdToken } from "@/lib/lineSession";

// --- Mocks ---
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

function renderGate() {
  return render(
    <MemoryRouter initialEntries={["/shop"]}>
      <RequireLineLink>
        <div>SECRET_SHOP_CONTENT</div>
      </RequireLineLink>
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

describe("RequireLineLink", () => {
  it("bypasses for staff without any binding", async () => {
    useAuthMock.mockReturnValue({ isStaffAny: true, loading: false });
    renderGate();
    expect(await screen.findByText("SECRET_SHOP_CONTENT")).toBeInTheDocument();
  });

  it("does NOT call line-link-lookup when no id_token/session — shows onboarding immediately", async () => {
    useAuthMock.mockReturnValue({ isStaffAny: false, loading: false });
    renderGate();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /เข้าสู่ระบบด้วย LINE/i })).toBeInTheDocument(),
    );
    expect(invokeMock).not.toHaveBeenCalled();
    expect(screen.queryByText("SECRET_SHOP_CONTENT")).not.toBeInTheDocument();
  });

  it("expired/401 lookup with stored id_token → shows login onboarding and clears stale token (not network error)", async () => {
    useAuthMock.mockReturnValue({ isStaffAny: false, loading: false });
    writeIdToken("eyJ.expired.token");
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: Object.assign(new Error("unauthorized"), { context: { response: { status: 401 } } }),
    });
    renderGate();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /เข้าสู่ระบบด้วย LINE/i })).toBeInTheDocument(),
    );
    expect(screen.queryByText(/โปรดตรวจสอบการเชื่อมต่ออินเทอร์เน็ต/)).not.toBeInTheDocument();
    // stale token wiped so retry CTA can recover
    expect(sessionStorage.getItem("line_id_token")).toBeNull();
  });

  it("FORGED sessionStorage (line_binding + line_friendship_hint=true) does NOT unlock when server unbound", async () => {
    useAuthMock.mockReturnValue({ isStaffAny: false, loading: false });
    sessionStorage.setItem("line_binding", JSON.stringify({ line_user_id: "Uforged", status: "linked" }));
    sessionStorage.setItem("line_friendship_hint", JSON.stringify({ is_friend: true, checked_at: "now" }));
    // Attacker forges an old-style verified mark and huge ttl_ms too — must be ignored.
    sessionStorage.setItem(
      "line_verified_at",
      JSON.stringify({ line_user_id: "Uforged", at: new Date().toISOString(), ttl_ms: 9_999_999_999 }),
    );
    invokeMock.mockResolvedValueOnce({ data: { bound: false, friend_confirmed: false, friend_status: "unknown" }, error: null });
    renderGate();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /เข้าสู่ระบบด้วย LINE/i })).toBeInTheDocument(),
    );
    expect(screen.queryByText("SECRET_SHOP_CONTENT")).not.toBeInTheDocument();
  });

  it("unlocks ONLY when server returns bound=true AND friend_confirmed=true", async () => {
    useAuthMock.mockReturnValue({ isStaffAny: false, loading: false });
    writeIdToken("eyJ.tok.1");
    invokeMock.mockResolvedValueOnce({ data: { bound: true, friend_confirmed: true, friend_status: "confirmed" }, error: null });
    renderGate();
    expect(await screen.findByText("SECRET_SHOP_CONTENT")).toBeInTheDocument();
  });

  it("shows add-friend step when server bound but friend_status='not_friend'", async () => {
    useAuthMock.mockReturnValue({ isStaffAny: false, loading: false });
    writeIdToken("eyJ.tok.2");
    invokeMock.mockResolvedValueOnce({ data: { bound: true, friend_confirmed: false, friend_status: "not_friend" }, error: null });
    renderGate();
    await waitFor(() => expect(screen.getByText(/เพิ่มเพื่อน LINE ของร้าน/)).toBeInTheDocument());
    expect(screen.queryByText("SECRET_SHOP_CONTENT")).not.toBeInTheDocument();
  });

  it("keeps the shop usable on friend_status='unknown' after a verified binding", async () => {
    useAuthMock.mockReturnValue({ isStaffAny: false, loading: false });
    writeIdToken("eyJ.tok.3");
    invokeMock.mockResolvedValueOnce({ data: { bound: true, friend_confirmed: false, friend_status: "unknown" }, error: null });
    renderGate();
    expect(await screen.findByText("SECRET_SHOP_CONTENT")).toBeInTheDocument();
  });

  it("keeps the shop usable on friend_status='config_missing' after a verified binding", async () => {
    useAuthMock.mockReturnValue({ isStaffAny: false, loading: false });
    writeIdToken("eyJ.tok.4");
    invokeMock.mockResolvedValueOnce({ data: { bound: true, friend_confirmed: false, friend_status: "config_missing" }, error: null });
    renderGate();
    expect(await screen.findByText("SECRET_SHOP_CONTENT")).toBeInTheDocument();
  });

  it("attaches stored LIFF id_token to line-link-lookup body", async () => {
    useAuthMock.mockReturnValue({ isStaffAny: false, loading: false });
    writeIdToken("eyJ.fake.token");
    invokeMock.mockResolvedValueOnce({ data: { bound: true, friend_confirmed: true, friend_status: "confirmed" }, error: null });
    renderGate();
    await screen.findByText("SECRET_SHOP_CONTENT");
    expect(invokeMock).toHaveBeenCalledWith("line-link-lookup", { body: { id_token: "eyJ.fake.token" } });
  });

  it("falls back to the LINE connect screen on network error", async () => {
    useAuthMock.mockReturnValue({ isStaffAny: false, loading: false });
    writeIdToken("eyJ.tok.5");
    invokeMock.mockRejectedValue(new Error("network down"));
    renderGate();
    await waitFor(() => expect(screen.getByText(/เชื่อมต่อไม่เสถียร/)).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.queryByText("SECRET_SHOP_CONTENT")).not.toBeInTheDocument();
  });
});