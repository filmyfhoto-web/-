import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { RequireStaffPerm } from "@/components/RouteGuards";

const authState = {
  user: { id: "u1", email: "a@b.c" } as unknown,
  loading: false,
  isOwner: false,
  isAdmin: false,
  isStaff: false,
  isStaffAny: false,
  hasPerm: (_m: string) => false,
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
  useAuthOptional: () => authState,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/pos/register" element={<RequireStaffPerm module="pos"><div>REGISTER</div></RequireStaffPerm>} />
        <Route path="/shop" element={<div>SHOP</div>} />
        <Route path="/admin/home" element={<div>ADMIN HOME</div>} />
        <Route path="/staff/home" element={<div>STAFF HOME</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  Object.assign(authState, {
    user: { id: "u1", email: "a@b.c" },
    loading: false, isOwner: false, isAdmin: false, isStaff: false, isStaffAny: false,
    hasPerm: () => false,
  });
});

describe("/pos/register route guard", () => {
  it("blocks a signed-in customer typing the URL directly", async () => {
    renderAt("/pos/register");
    await waitFor(() => expect(screen.getByText("SHOP")).toBeTruthy());
    expect(screen.queryByText("REGISTER")).toBeNull();
  });

  it("blocks staff without the POS permission", async () => {
    Object.assign(authState, { isStaffAny: true, hasPerm: () => false });
    renderAt("/pos/register");
    // พนักงานที่ไม่มีสิทธิ์ POS จะเห็นหน้า “ไม่มีสิทธิ์เข้าถึง” พร้อมทางกลับหน้าที่ใช้ได้
    // (ไม่เด้งออกเงียบ ๆ) และต้องไม่เห็นหน้าเครื่องคิดเงินเด็ดขาด
    await waitFor(() => expect(screen.getByText("กลับหน้าที่ใช้งานได้")).toBeTruthy());
    expect(screen.getByText("กลับหน้าที่ใช้งานได้").getAttribute("href")).toBe("/staff/home");
    expect(screen.queryByText("REGISTER")).toBeNull();
  });


  it("allows staff with POS permission and owners/admins", async () => {
    Object.assign(authState, { isStaffAny: true, hasPerm: (m: string) => m === "pos" });
    renderAt("/pos/register");
    expect(screen.getByText("REGISTER")).toBeTruthy();

    Object.assign(authState, { isOwner: true, isAdmin: true, isStaffAny: true, hasPerm: () => true });
    renderAt("/pos/register");
    expect(screen.getAllByText("REGISTER").length).toBeGreaterThan(0);
  });

  it("shows a loader instead of a forbidden flash while auth resolves", () => {
    Object.assign(authState, { loading: true });
    renderAt("/pos/register");
    expect(screen.queryByText("REGISTER")).toBeNull();
    expect(screen.queryByText("SHOP")).toBeNull();
  });
});
