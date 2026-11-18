import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const refresh = vi.fn();
const useAuthMock = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/contexts/GuestContext", () => ({ useGuest: () => ({ session: null }) }));

import { RequireStaff, RequireOwner, RequireStaffAny } from "../RouteGuards";

const base = {
  user: { id: "u1" },
  loading: false,
  roles: [] as string[],
  loadError: true,
  isOwner: false,
  isAdmin: false,
  isStaff: false,
  isStaffAny: false,
  canEditProduct: false,
  hasPerm: () => true,
  refresh,
};

function renderAt(el: JSX.Element) {
  return render(
    <MemoryRouter initialEntries={["/admin/home"]}>
      <Routes>
        <Route path="/admin/home" element={el} />
        <Route path="/staff/login" element={<div>SIGN IN PAGE</div>} />
        <Route path="/shop" element={<div>SHOP</div>} />
        <Route path="/no-access" element={<div>NO ACCESS</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { useAuthMock.mockReset(); useAuthMock.mockReturnValue(base); });

describe("route guards when the role query fails", () => {
  it.each([
    ["RequireStaff", <RequireStaff key="a"><div>ADMIN</div></RequireStaff>],
    ["RequireOwner", <RequireOwner key="b"><div>OWNER</div></RequireOwner>],
    ["RequireStaffAny", <RequireStaffAny key="c"><div>STAFF</div></RequireStaffAny>],
  ])("%s shows a retry screen instead of bouncing the user out", (_name, el) => {
    renderAt(el);
    expect(screen.getByTestId("role-load-failed")).toBeInTheDocument();
    expect(screen.queryByText("SIGN IN PAGE")).toBeNull();
    expect(screen.queryByText("NO ACCESS")).toBeNull();
    expect(screen.queryByText("SHOP")).toBeNull();
  });

  it("still decides normally once roles are known", () => {
    useAuthMock.mockReturnValue({ ...base, loadError: false, roles: ["owner"], isOwner: true, isAdmin: true, isStaff: true, isStaffAny: true });
    renderAt(<RequireStaff><div>ADMIN PAGE</div></RequireStaff>);
    expect(screen.getByText("ADMIN PAGE")).toBeInTheDocument();
  });

  it("keeps cached roles authoritative when a later refresh fails", () => {
    useAuthMock.mockReturnValue({ ...base, loadError: true, roles: ["owner"], isOwner: true, isAdmin: true, isStaff: true, isStaffAny: true });
    renderAt(<RequireOwner><div>OWNER PAGE</div></RequireOwner>);
    expect(screen.getByText("OWNER PAGE")).toBeInTheDocument();
  });
});
