import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { RequireStaff, RequireStockEdit, RequireOwner } from "@/components/RouteGuards";

// Mock AuthContext.useAuth — return whatever the current test set on the module var.
let mockAuth: any = { user: null, loading: false, isStaff: false, isStaffAny: false, isOwner: false, canEditProduct: false };
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockAuth,
}));
// GuestContext isn't used by these guards but is imported transitively — stub it.
vi.mock("@/contexts/GuestContext", () => ({
  useGuest: () => ({ session: null }),
}));

function renderGuarded(Guard: React.ComponentType<{ children: React.ReactNode }>, path = "/admin/dashboard") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/dashboard" element={<Guard><div>ADMIN_PAGE</div></Guard>} />
        <Route path="/shop" element={<div>SHOP_PAGE</div>} />
        <Route path="/no-access" element={<div>NO_ACCESS_PAGE</div>} />
        <Route path="/staff/login" element={<div>LOGIN_PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("role-based admin route access", () => {
  it("admin (isStaff=true) reaches /admin/dashboard", () => {
    mockAuth = { user: { id: "u1" }, loading: false, isStaff: true, isStaffAny: true, isOwner: false, canEditProduct: true };
    renderGuarded(RequireStaff);
    expect(screen.getByText("ADMIN_PAGE")).toBeInTheDocument();
  });

  it("logged-in customer (isStaff=false) is sent to the friendly no-access screen", () => {
    mockAuth = { user: { id: "u2" }, loading: false, isStaff: false, isStaffAny: false, isOwner: false, canEditProduct: false };
    renderGuarded(RequireStaff);
    expect(screen.getByText("NO_ACCESS_PAGE")).toBeInTheDocument();
    expect(screen.queryByText("ADMIN_PAGE")).toBeNull();
  });

  it("guest (no user) is redirected to the staff sign-in page", () => {
    mockAuth = { user: null, loading: false, isStaff: false, isStaffAny: false, isOwner: false, canEditProduct: false };
    renderGuarded(RequireStaff);
    expect(screen.getByText("LOGIN_PAGE")).toBeInTheDocument();
  });

  it("RequireStockEdit blocks customer and lets stock-editing staff through", () => {
    mockAuth = { user: { id: "u3" }, loading: false, isStaff: false, isStaffAny: false, isOwner: false, canEditProduct: false };
    const { unmount } = renderGuarded(RequireStockEdit);
    expect(screen.getByText("NO_ACCESS_PAGE")).toBeInTheDocument();
    unmount();
    mockAuth = { user: { id: "u4" }, loading: false, isStaff: true, isStaffAny: true, isOwner: false, canEditProduct: true };
    renderGuarded(RequireStockEdit);
    expect(screen.getByText("ADMIN_PAGE")).toBeInTheDocument();
  });

  it("RequireOwner blocks non-owner staff", () => {
    mockAuth = { user: { id: "u5" }, loading: false, isStaff: true, isStaffAny: true, isOwner: false, canEditProduct: true };
    render(
      <MemoryRouter initialEntries={["/admin/dashboard"]}>
        <Routes>
          <Route path="/admin/dashboard" element={<RequireOwner><div>OWNER_ONLY</div></RequireOwner>} />
          <Route path="/admin/dashboard" element={<div>DASH</div>} />
        </Routes>
      </MemoryRouter>,
    );
    // Navigate("/admin/dashboard") from RequireOwner points back to same path — the redirect prevents OWNER_ONLY from rendering.
    expect(screen.queryByText("OWNER_ONLY")).toBeNull();
  });
});