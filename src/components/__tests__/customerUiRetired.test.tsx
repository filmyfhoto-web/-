import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ค่าเริ่มต้นของโปรเจกต์ (เฟส 1): หน้าลูกค้าปิด
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null, loading: false }) }));

import RequireLineLink from "@/components/RequireLineLink";
import { RequireCustomerAuth } from "@/components/RouteGuards";
import { LEGACY_CUSTOMER_UI } from "@/lib/legacyUi";

describe("หน้าลูกค้าเลิกใช้ — ย้ายไป LINE MyShop", () => {
  it("สวิตช์ตั้งค่าเป็นปิดโดยค่าเริ่มต้น", () => {
    expect(LEGACY_CUSTOMER_UI).toBe(false);
  });

  it("RequireLineLink แสดงหน้าแจ้งย้าย ไม่ใช่เนื้อหาเดิม", () => {
    render(
      <MemoryRouter>
        <RequireLineLink><div>เนื้อหาร้านค้าเดิม</div></RequireLineLink>
      </MemoryRouter>,
    );
    expect(screen.queryByText("เนื้อหาร้านค้าเดิม")).toBeNull();
    expect(screen.getByRole("heading", { name: /ย้ายไปสั่งซื้อที่ LINE/ })).toBeTruthy();
  });

  it("RequireCustomerAuth แสดงหน้าแจ้งย้าย ไม่เด้งไปหน้าล็อกอิน", () => {
    render(
      <MemoryRouter>
        <RequireCustomerAuth><div>บัญชีลูกค้าเดิม</div></RequireCustomerAuth>
      </MemoryRouter>,
    );
    expect(screen.queryByText("บัญชีลูกค้าเดิม")).toBeNull();
    expect(screen.getByRole("heading", { name: /ย้ายไปสั่งซื้อที่ LINE/ })).toBeTruthy();
  });
});
