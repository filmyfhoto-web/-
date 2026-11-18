import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const useAuthMock = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));
vi.mock("@/contexts/GuestContext", () => ({ useGuest: () => ({ session: null }) }));

import { RequireStaff, RequireStaffPerm, RequireStockEdit } from "../RouteGuards";

const base = {
  user: { id: "u1" }, loading: false,
  isOwner: false, isAdmin: false, isStaff: false, isStaffAny: true,
  canEditProduct: true,
  hasPerm: (m: string) => m !== "po",
};

function renderAt(path: string, el: JSX.Element) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={el} />
        <Route path="/staff/login" element={<div>SIGN IN PAGE</div>} />
        <Route path="/staff/home" element={<div>STAFF HOME</div>} />
        <Route path="/pos" element={<div>POS</div>} />
        <Route path="/pos/stock" element={<div>POS STOCK</div>} />
        <Route path="/shop" element={<div>SHOP</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { useAuthMock.mockReset(); useAuthMock.mockReturnValue(base); });

describe("RouteGuards for stock/photo staff", () => {
  it("never bounces a signed-in staff member to the sign-in page", () => {
    renderAt("/admin/dashboard", <RequireStaff><div>ADMIN</div></RequireStaff>);
    expect(screen.queryByText("SIGN IN PAGE")).toBeNull();
    // พนักงานที่ล็อกอินแล้วเห็นหน้าอธิบายสิทธิ์ พร้อมลิงก์กลับหน้าที่ใช้งานได้
    const denied = screen.getByTestId("access-denied");
    expect(denied).toBeInTheDocument();
    expect(denied.querySelector('a[href="/staff/home"]')).toBeTruthy();
  });

  it("sends staff without a module permission to a page they can open", () => {
    renderAt("/pos/purchase-orders", <RequireStaffPerm module="po"><div>PO</div></RequireStaffPerm>);
    const denied = screen.getByTestId("access-denied");
    expect(denied.querySelector('a[href="/staff/home"]')).toBeTruthy();
  });

  it("allows stock staff into stock screens", () => {
    renderAt("/admin/stock", <RequireStockEdit><div>STOCK PAGE</div></RequireStockEdit>);
    expect(screen.getByText("STOCK PAGE")).toBeInTheDocument();
  });

  it("still lands on the single staff home when POS permission is off", () => {
    useAuthMock.mockReturnValue({ ...base, hasPerm: (m: string) => m === "stock" });
    renderAt("/admin/dashboard", <RequireStaff><div>ADMIN</div></RequireStaff>);
    expect(screen.getByTestId("access-denied").querySelector('a[href="/staff/home"]')).toBeTruthy();
  });


  it("still redirects signed-out visitors to the sign-in page", () => {
    useAuthMock.mockReturnValue({ ...base, user: null, isStaffAny: false });
    renderAt("/admin/dashboard", <RequireStaff><div>ADMIN</div></RequireStaff>);
    expect(screen.getByText("SIGN IN PAGE")).toBeInTheDocument();
  });
});
