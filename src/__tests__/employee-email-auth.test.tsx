/**
 * Employee email sign-in / authorization.
 *
 * The database is the real gate (has_role/is_staff/has_staff_perm now require
 * profiles.staff_active); these tests lock the client mirror so a disabled or
 * unapproved account can never render staff UI.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

type Row = Record<string, any>;
let profileRow: Row | null = null;
let roleRows: Row[] = [];

const authCallbacks: any[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const table = (name: string) => {
    const result =
      name === "profiles" ? { data: profileRow, error: null }
      : name === "user_roles" ? { data: roleRows, error: null }
      : { data: null, error: null };
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => result,
      then: (res: any) => Promise.resolve(result).then(res),
    };
    return chain;
  };
  return {
    supabase: {
      from: (name: string) => table(name),
      rpc: async () => ({ data: null, error: null }),
      functions: { invoke: async () => ({ data: null, error: null }) },
      auth: {
        getSession: async () => ({ data: { session: { user: { id: "u1" } } } }),
        onAuthStateChange: (cb: any) => {
          authCallbacks.push(cb);
          return { data: { subscription: { unsubscribe: () => {} } } };
        },
        signOut: async () => ({ error: null }),
      },
    },
  };
});

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { RequireStaffAny, RequireOwner } from "@/components/RouteGuards";

vi.mock("@/contexts/GuestContext", () => ({ useGuest: () => ({ session: null }) }));

function Probe() {
  const { isStaffAny, isStaff, isOwner, loading } = useAuth();
  if (loading) return <div>LOADING</div>;
  return (
    <div>
      <span data-testid="staffAny">{String(isStaffAny)}</span>
      <span data-testid="staff">{String(isStaff)}</span>
      <span data-testid="owner">{String(isOwner)}</span>
    </div>
  );
}

function renderApp(ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={["/staff/home"]}>
      <AuthProvider>
        <Routes>
          <Route path="/staff/home" element={<>{ui}</>} />
          <Route path="/staff/login" element={<div>LOGIN_PAGE</div>} />
          <Route path="/shop" element={<div>SHOP_PAGE</div>} />
          <Route path="/no-access" element={<div>NO_ACCESS_PAGE</div>} />
          <Route path="/admin/home" element={<div>ADMIN_HOME</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  profileRow = null;
  roleRows = [];
});

describe("employee email authentication & authorization", () => {
  it("approved, active employee is treated as staff", async () => {
    profileRow = { id: "u1", email: "somchai@shop.co", staff_active: true };
    roleRows = [{ role: "stock_staff" }];
    renderApp(<Probe />);
    await waitFor(() => expect(screen.getByTestId("staffAny").textContent).toBe("true"));
    expect(screen.getByTestId("owner").textContent).toBe("false");
  });

  it("unknown / unapproved email (no staff role) is denied staff areas", async () => {
    profileRow = { id: "u1", email: "stranger@gmail.com", staff_active: true };
    roleRows = [{ role: "customer" }];
    renderApp(<RequireStaffAny><div>STAFF_PAGE</div></RequireStaffAny>);
    await waitFor(() => expect(screen.getByText("SHOP_PAGE")).toBeInTheDocument());
    expect(screen.queryByText("STAFF_PAGE")).toBeNull();
  });

  it("disabled employee loses every staff capability", async () => {
    profileRow = { id: "u1", email: "left@shop.co", staff_active: false };
    roleRows = [{ role: "admin" }];
    renderApp(<Probe />);
    await waitFor(() => expect(screen.getByTestId("staffAny").textContent).toBe("false"));
    expect(screen.getByTestId("staff").textContent).toBe("false");
  });

  it("disabled employee is bounced out of staff routes", async () => {
    profileRow = { id: "u1", email: "left@shop.co", staff_active: false };
    roleRows = [{ role: "stock_staff" }];
    renderApp(<RequireStaffAny><div>STAFF_PAGE</div></RequireStaffAny>);
    await waitFor(() => expect(screen.getByText("SHOP_PAGE")).toBeInTheDocument());
  });

  it("employee cannot open owner-only account management", async () => {
    profileRow = { id: "u1", email: "somchai@shop.co", staff_active: true };
    roleRows = [{ role: "stock_staff" }];
    renderApp(<RequireOwner><div>STAFF_ADMIN_PAGE</div></RequireOwner>);
    await waitFor(() => expect(screen.queryByText("STAFF_ADMIN_PAGE")).toBeNull());
  });

  it("owner can open account management", async () => {
    profileRow = { id: "u1", email: "owner@shop.co", staff_active: true };
    roleRows = [{ role: "owner" }];
    renderApp(<RequireOwner><div>STAFF_ADMIN_PAGE</div></RequireOwner>);
    await waitFor(() => expect(screen.getByText("STAFF_ADMIN_PAGE")).toBeInTheDocument());
  });

  it("customer LINE session (no staff role) still signs in and keeps a user", async () => {
    profileRow = { id: "u1", line_user_id: "U123", staff_active: true };
    roleRows = [{ role: "customer" }];
    renderApp(<Probe />);
    await waitFor(() => expect(screen.getByTestId("staffAny").textContent).toBe("false"));
    // no crash, no forced sign-out: the customer context is untouched
    expect(screen.getByTestId("staff").textContent).toBe("false");
  });
});