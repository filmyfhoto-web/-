import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.resolve(p), "utf8");

describe("customer bottom nav = 4 tabs (งานของฉัน merged into ฉัน)", () => {
  const layout = read("src/components/layout/CustomerLayout.tsx");
  const app = read("src/App.tsx");

  it("bottom nav has exactly 4 tabs", () => {
    expect(layout).toMatch(/grid-cols-4/);
    const tabs = layout.slice(layout.indexOf("const tabs = ["), layout.indexOf("];", layout.indexOf("const tabs = [")));
    expect(tabs.match(/to: "\//g)?.length).toBe(4);
    for (const t of ["/", "/shop", "/notifications", "/my-account"]) expect(tabs).toContain(`"${t}"`);
    expect(tabs).not.toContain('"/my-orders"');
  });

  it("uses the approved tab labels (no หมวดหมู่ tab)", () => {
    const tabs = layout.slice(layout.indexOf("const tabs = ["), layout.indexOf("];", layout.indexOf("const tabs = [")));
    for (const l of ["หน้าแรก", "สินค้า", "แจ้งเตือน", "ฉัน"]) expect(tabs).toContain(l);
    expect(tabs).not.toContain("หมวดหมู่");
  });

  it("/categories renders the storefront (deep-linked to categories)", () => {
    expect(app).toContain('path="/categories"');
  });
});

describe("จัดการหน้าแอพ is discoverable for staff", () => {
  it("appears in the settings hub (ทางเข้าเดียวหลัง NATTA GROUP redesign)", () => {
    const settings = read("src/pages/admin/SettingsHub.tsx");
    expect(settings).toContain('to: "/admin/shop-home"');
    expect(settings).toContain("จัดการหน้าแอพ");
  });

  it("route is staff-guarded, not redirected away", () => {
    expect(read("src/App.tsx")).toMatch(/path="\/admin\/shop-home"\s+element={<RequireStaff><ShopHomeDesignPage \/><\/RequireStaff>}/);
  });
});
