import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");

describe("workspace separation: Receipt & Delivery vs POS", () => {
  it("/pos route in App.tsx is NOT wrapped in AdminLayout / ReceiptsLayout", () => {
    const app = read("src/App.tsx");
    const posLine = app.split("\n").find((l) => l.includes('path="/pos"'));
    expect(posLine).toBeTruthy();
    expect(posLine!).not.toMatch(/AdminLayout/);
    expect(posLine!).not.toMatch(/ReceiptsLayout/);
  });

  it("CentralPOS shell does not import AdminLayout or ReceiptsLayout", () => {
    const pos = read("src/pages/pos/CentralPOS.tsx");
    expect(pos).not.toMatch(/AdminLayout/);
    expect(pos).not.toMatch(/ReceiptsLayout/);
  });

  it("POS shell provides a link back to the admin home", () => {
    const shell = read("src/components/layout/PosShell.tsx");
    expect(shell).toMatch(/to="\/admin\/home"/);
    expect(shell).not.toMatch(/Receipt &amp; Delivery/);
  });

  it("admin dashboard never embeds the POS component (single dashboard only)", () => {
    const dash = read("src/pages/admin/AdminDashboardHome.tsx");
    expect(dash).not.toMatch(/CentralPOS|from ["']@?\.?.*pos\/CentralPOS/);
    expect(() => read("src/pages/admin/Dashboard.tsx")).toThrow();
  });

  it("receipts dashboard never embeds the POS component", () => {
    const dash = read("src/pages/receipts/dashboard/Dashboard.tsx");
    expect(dash).not.toMatch(/CentralPOS|from ["'].*pos\/CentralPOS/);
  });

  it("dashboard nav keeps ออกเอกสาร and POS จอสัมผัส entries", () => {
    const nav = read("src/lib/adminNav.ts");
    expect(nav).toMatch(/to: "\/receipts", label: "ออกเอกสาร"/);
    expect(nav).toMatch(/to: "\/pos\/register", label: "POS จอสัมผัส"/);
  });

  it("workspace shell never renders the dashboard sidebar", () => {
    const layout = read("src/components/layout/AdminLayout.tsx");
    expect(layout).not.toMatch(/admin-sidebar/);
    expect(layout).toMatch(/DASHBOARD|STOCK_TABS/);
  });

  it("shared product/customer sources remain canonical public tables (no duplicate POS tables)", () => {
    const pos = read("src/pages/pos/CentralPOS.tsx");
    // Reads canonical public.products via supabase.from("products" | v_pos_catalog)
    expect(pos).toMatch(/supabase\.from\(/);
    expect(pos).not.toMatch(/pos_products|pos_customers/);
  });
});
