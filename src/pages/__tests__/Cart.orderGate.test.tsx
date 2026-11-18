import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => {
  const actual = await orig<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

const invokeMock = vi.fn();
let authSession: unknown = null;
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invokeMock(...a) },
    rpc: vi.fn(),
    auth: { getSession: async () => ({ data: { session: authSession }, error: null }) },
  },
}));

const cartItems = [{ product_id: "p1", name: "สินค้า A", code: "A1", unit: "ชิ้น", qty: 2, price: 50 }];
vi.mock("@/contexts/CartContext", () => ({
  useCart: () => ({
    items: cartItems, setQty: vi.fn(), remove: vi.fn(), clear: vi.fn(),
    note: "", setNote: vi.fn(),
  }),
}));

const guestSession = { guest_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", name: "ครู", phone: "0812345678", project: "งาน", org_name: "โรงเรียน" };
let activeGuestSession: typeof guestSession | null = guestSession;
vi.mock("@/contexts/GuestContext", () => ({
  useGuest: () => ({ session: activeGuestSession, setSession: vi.fn() }),
  newGuestId: () => "gid-1234567890abcdef",
}));

let idToken: string | null = "id-token-verified";
let binding: { line_user_id: string } | null = { line_user_id: "U0" };
vi.mock("@/lib/lineSession", () => ({
  readIdToken: () => idToken,
  readBinding: () => binding,
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) } }));
vi.mock("@/components/SeoHead", () => ({ default: () => null }));
vi.mock("@/components/layout/CustomerLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// LINE gate: the dialog is exercised in its own suite; here we only need to
// know whether Cart decided to open it (add-friend / recheck) or not.
let gateStatus = "ready";
vi.mock("@/components/customer/LineOrderGate", () => ({
  __esModule: true,
  useOrderGate: () => ({ status: gateStatus, recheck: vi.fn(), binding: {} }),
  mapBindingToGate: (s: string) => s,
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="line-order-gate" /> : null,
}));

import Cart from "../Cart";

function renderCart() {
  const r = render(<MemoryRouter initialEntries={["/cart"]}><Cart /></MemoryRouter>);
  // Checkout ใหม่ถามเฉพาะ หน่วยงาน/โรงเรียน + ที่อยู่ — เติมให้ครบก่อนกดยืนยัน
  if (activeGuestSession) {
    fireEvent.change(screen.getByTestId("cart-school"), { target: { value: "โรงเรียนทดสอบ" } });
    fireEvent.change(screen.getByTestId("cart-address"), { target: { value: "123 หมู่ 4 ต.เชียงกลาง อ.เชียงกลาง จ.น่าน 55160" } });
  }
  return r;
}

beforeEach(() => {
  navigateMock.mockReset();
  invokeMock.mockReset();
  toastError.mockReset();
  idToken = "id-token-verified";
  binding = { line_user_id: "U0" };
  activeGuestSession = guestSession;
  authSession = null;
  gateStatus = "ready";
});

describe("Cart order-submission LINE gate", () => {
  it("keeps submit clickable and shows the missing fields instead of failing silently", async () => {
    activeGuestSession = null;
    renderCart();
    const submit = screen.getByTestId("submit-order-btn");
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);
    expect(await screen.findByTestId("cart-submit-error")).toHaveTextContent("ช่องที่มีข้อความสีแดง");
    expect(screen.getByTestId("cart-name")).toHaveAttribute("data-cart-field-error", "true");
    // ตะกร้าอาจตรวจสถานะการผูก LINE ตอนเปิดหน้า แต่ต้องไม่ส่งคำสั่งซื้อ
    expect(invokeMock).not.toHaveBeenCalledWith("guest-order-submit", expect.anything());

  });

  it("blocks submission and opens the LINE gate when no LINE proof exists", async () => {
    idToken = null; binding = null;
    renderCart();
    fireEvent.click(screen.getByTestId("submit-order-btn"));
    fireEvent.click(await screen.findByTestId("confirm-submit-order"));
    expect(await screen.findByTestId("line-order-gate")).toBeTruthy();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("lets a previously linked customer submit with only a saved session (no re-link)", async () => {
    idToken = null; binding = null;
    authSession = { access_token: "jwt" };
    invokeMock.mockResolvedValue({ data: { ok: true, order_id: "o9", order_no: "SO-9" }, error: null });
    renderCart();
    fireEvent.click(screen.getByTestId("submit-order-btn"));
    fireEvent.click(await screen.findByTestId("confirm-submit-order"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(navigateMock.mock.calls[0][0]).toContain("/my-orders/o9");
  });

  it("submits with id_token + idempotency_key when LINE is verified", async () => {
    invokeMock.mockResolvedValue({ data: { ok: true, order_id: "o1", order_no: "SO-1", line_link_token: "tok" }, error: null });
    renderCart();
    fireEvent.click(screen.getByTestId("submit-order-btn"));
    fireEvent.click(await screen.findByTestId("confirm-submit-order"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    const [fn, opts] = invokeMock.mock.calls[0];
    expect(fn).toBe("guest-order-submit");
    const body = (opts as any).body;
    expect(body.id_token).toBe("id-token-verified");
    expect(typeof body.idempotency_key).toBe("string");
    expect(body.idempotency_key.length).toBeGreaterThanOrEqual(8);
    // Client MUST NOT try to authorize with a spoofable line_user_id field.
    expect(body.line_user_id).toBeUndefined();
  });

  it("dedupes double-click into a single invocation", async () => {
    let resolve!: (v: unknown) => void;
    invokeMock.mockImplementation(() => new Promise((r) => { resolve = r; }));
    renderCart();
    fireEvent.click(screen.getByTestId("submit-order-btn"));
    const confirm = await screen.findByTestId("confirm-submit-order");
    fireEvent.click(confirm);
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    // second click on the primary submit while submitting is disabled
    fireEvent.click(screen.getByTestId("submit-order-btn"));
    fireEvent.click(screen.getByTestId("submit-order-btn"));
    resolve({ data: { ok: true, order_id: "o1", order_no: "SO-1", line_link_token: "t" }, error: null });
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
  });

  it("opens the LINE gate when server returns line_binding_required (403)", async () => {
    invokeMock.mockResolvedValue({ data: { error: "line_binding_required", detail: "กรุณาเพิ่มเพื่อน" }, error: null });
    renderCart();
    fireEvent.click(screen.getByTestId("submit-order-btn"));
    fireEvent.click(await screen.findByTestId("confirm-submit-order"));
    expect(await screen.findByTestId("line-order-gate")).toBeTruthy();
  });

  it("LINE_NOT_FRIEND (fail-closed) opens the add-friend gate and keeps the cart", async () => {
    invokeMock.mockResolvedValue({ data: { error: "LINE_NOT_FRIEND", detail: "กรุณาเพิ่มเพื่อน LINE ของร้านก่อนยืนยันสั่งซื้อ" }, error: null });
    renderCart();
    fireEvent.click(screen.getByTestId("submit-order-btn"));
    fireEvent.click(await screen.findByTestId("confirm-submit-order"));
    expect(await screen.findByTestId("line-order-gate")).toBeTruthy();
    expect(await screen.findByTestId("cart-submit-error")).toHaveTextContent("เพิ่มเพื่อน");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("LINE_FRIEND_CHECK_UNAVAILABLE shows a retry card without losing the cart", async () => {
    invokeMock.mockResolvedValue({ data: { error: "LINE_FRIEND_CHECK_UNAVAILABLE", detail: "ตรวจสอบสถานะเพื่อน LINE ไม่สำเร็จ กรุณาลองตรวจสอบใหม่อีกครั้ง" }, error: null });
    renderCart();
    fireEvent.click(screen.getByTestId("submit-order-btn"));
    fireEvent.click(await screen.findByTestId("confirm-submit-order"));
    expect(await screen.findByTestId("cart-submit-error")).toHaveTextContent("ลองตรวจสอบใหม่");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("LINE_CONFIG_MISSING tells the customer to contact the shop and does not open the gate", async () => {
    invokeMock.mockResolvedValue({ data: { error: "LINE_CONFIG_MISSING", detail: "ร้านยังตั้งค่า LINE ไม่ครบ กรุณาแจ้งร้าน" }, error: null });
    renderCart();
    fireEvent.click(screen.getByTestId("submit-order-btn"));
    fireEvent.click(await screen.findByTestId("confirm-submit-order"));
    expect(await screen.findByTestId("cart-submit-error")).toHaveTextContent("แจ้งร้าน");
    expect(screen.queryByTestId("line-order-gate")).toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("shows friendly toast when server rejects with missing_idempotency_key (400)", async () => {
    invokeMock.mockResolvedValue({ data: { error: "missing_idempotency_key" }, error: null });
    renderCart();
    fireEvent.click(screen.getByTestId("submit-order-btn"));
    fireEvent.click(await screen.findByTestId("confirm-submit-order"));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    // Must NOT navigate away — user just needs to refresh.
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("opens the LINE gate when server returns line_required (401 / expired id_token)", async () => {
    invokeMock.mockResolvedValue({ data: { error: "line_required", detail: "expired" }, error: null });
    renderCart();
    fireEvent.click(screen.getByTestId("submit-order-btn"));
    fireEvent.click(await screen.findByTestId("confirm-submit-order"));
    expect(await screen.findByTestId("line-order-gate")).toBeTruthy();
  });

  it("client never forwards a client-supplied line_user_id (identity spoof rejected at source)", async () => {
    invokeMock.mockResolvedValue({ data: { ok: true, order_id: "o1", order_no: "SO-1", line_link_token: "t" }, error: null });
    renderCart();
    fireEvent.click(screen.getByTestId("submit-order-btn"));
    fireEvent.click(await screen.findByTestId("confirm-submit-order"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    const body = (invokeMock.mock.calls[0][1] as any).body;
    // Only id_token (verified server-side) may prove LINE identity.
    expect(body.line_user_id).toBeUndefined();
    expect(body.verified_line_user_id).toBeUndefined();
    expect(typeof body.id_token).toBe("string");
  });
});