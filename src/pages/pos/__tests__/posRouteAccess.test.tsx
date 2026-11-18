/**
 * Route permission contract for the POS workspace: an authorised staff member
 * or admin must reach /pos and /pos/receipt/:id, a customer must not, and a
 * still-loading permission state must show a loader — never "ไม่ได้รับสิทธิ์".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const authState = { user: null as unknown, loading: true, isOwner: false, isAdmin: false, isStaff: false, isStaffAny: false, canEditProduct: false, hasPerm: () => true, perms: {} };

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
  useAuthOptional: () => authState,
}));
vi.mock("@/contexts/GuestContext", () => ({ useGuest: () => ({ session: null }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { RequireStaffAny, RequireStaffPerm } from "@/components/RouteGuards";

function renderGuard(node: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={["/pos/receipt/abc"]}>
      <Routes>
        <Route path="/pos/receipt/:id" element={node} />
        <Route path="/staff/login" element={<div>staff-login</div>} />
        <Route path="/shop" element={<div>shop</div>} />
        <Route path="/admin/home" element={<div>admin-home</div>} />
        <Route path="/staff/home" element={<div>staff-home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const RECEIPT = <div>receipt-page</div>;

beforeEach(() => {
  Object.assign(authState, {
    user: null, loading: true, isOwner: false, isAdmin: false,
    isStaff: false, isStaffAny: false, canEditProduct: false, hasPerm: () => true,
  });
});

describe("POS route access", () => {
  it("shows a loader (not a denial) while permissions load", () => {
    renderGuard(<RequireStaffAny>{RECEIPT}</RequireStaffAny>);
    expect(screen.getByText(/กำลังโหลด/)).toBeInTheDocument();
    expect(screen.queryByText("receipt-page")).toBeNull();
  });

  it("lets POS staff open the printable receipt", () => {
    Object.assign(authState, { user: { id: "u1" }, loading: false, isStaffAny: true });
    renderGuard(<RequireStaffAny>{RECEIPT}</RequireStaffAny>);
    expect(screen.getByText("receipt-page")).toBeInTheDocument();
  });

  it("lets an admin open the printable receipt", () => {
    Object.assign(authState, { user: { id: "u2" }, loading: false, isAdmin: true, isStaff: true, isStaffAny: true });
    renderGuard(<RequireStaffAny>{RECEIPT}</RequireStaffAny>);
    expect(screen.getByText("receipt-page")).toBeInTheDocument();
  });

  it("keeps customers out of the internal receipt", () => {
    Object.assign(authState, { user: { id: "c1" }, loading: false });
    renderGuard(<RequireStaffAny>{RECEIPT}</RequireStaffAny>);
    expect(screen.getByText("shop")).toBeInTheDocument();
  });

  it("sends signed-out visitors to the staff login", () => {
    Object.assign(authState, { user: null, loading: false });
    renderGuard(<RequireStaffAny>{RECEIPT}</RequireStaffAny>);
    expect(screen.getByText("staff-login")).toBeInTheDocument();
  });

  it("does not gate the receipt behind an unrelated module permission", () => {
    // history-only staff must still print; the receipt route uses RequireStaffAny.
    Object.assign(authState, { user: { id: "u3" }, loading: false, isStaffAny: true, hasPerm: (m: string) => m === "pos" });
    renderGuard(<RequireStaffPerm module="pos">{RECEIPT}</RequireStaffPerm>);
    expect(screen.getByText("receipt-page")).toBeInTheDocument();
  });
});
