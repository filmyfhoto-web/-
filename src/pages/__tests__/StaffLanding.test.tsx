import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "@/lib/head";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const useAuthMock = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    auth: { verifyOtp: vi.fn() },
  },
}));

import StaffLanding from "@/pages/StaffLanding";

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <StaffLanding />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  window.history.replaceState({}, "", "/staff");
  useAuthMock.mockReset();
});

describe("StaffLanding", () => {
  it("shows the LINE login CTA for signed-out visitors", () => {
    useAuthMock.mockReturnValue({
      user: null, roles: [], isOwner: false, isAdmin: false, isStaffAny: false,
      signOut: vi.fn(), loading: false,
    });
    renderPage();
    fireEvent.click(screen.getByTestId("staff-advanced-toggle"));
    expect(screen.getByTestId("staff-line-login")).toBeInTheDocument();
  });

  it("shows staff shortcuts when signed in as staff", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "s@x.com" }, roles: ["stock_staff"],
      isOwner: false, isAdmin: false, isStaffAny: true,
      signOut: vi.fn(), loading: false,
    });
    renderPage();
    expect(screen.getByTestId("shortcut-/pos")).toBeInTheDocument();
    expect(screen.getByTestId("shortcut-/pos/staff")).toBeInTheDocument();
    expect(screen.queryByTestId("shortcut-/admin/dashboard")).toBeNull();
  });

  it("shows owner-only approval shortcut for owners", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "o@x.com" }, roles: ["owner"],
      isOwner: true, isAdmin: false, isStaffAny: true,
      signOut: vi.fn(), loading: false,
    });
    renderPage();
    expect(screen.getByTestId("shortcut-/admin/staff-line")).toBeInTheDocument();
  });
});