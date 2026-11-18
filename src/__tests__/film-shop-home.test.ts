import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { DASHBOARD_NAV, MODULE_CARDS, WORKSPACE_NAV } from "@/lib/adminNav";
import { LANDING_OPTIONS } from "@/lib/staffLanding";

const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

describe("FILM SHOP เป็นโมดูลแยก — ทางเข้าเดียว", () => {
  const app = src("src/App.tsx");
  const home = src("src/pages/film-shop/FilmShopHome.tsx");

  it("มี route /film-shop และ /film-shop/app/* ที่ป้องกันด้วย RequireStaffAny", () => {
    expect(app).toMatch(/path="\/film-shop" element=\{<RequireStaffAny><FilmShopHome \/><\/RequireStaffAny>\}/);
    expect(app).toMatch(/path="\/film-shop\/app\/\*" element=\{<RequireStaffAny><FilmShopApp \/><\/RequireStaffAny>\}/);
  });

  it("ไม่มี FILM SHOP ในเมนู การ์ดโมดูล และ staff landing", () => {
    for (const item of [...DASHBOARD_NAV, ...WORKSPACE_NAV, ...MODULE_CARDS]) {
      expect(item.to.startsWith("/film-shop")).toBe(false);
    }
    expect(LANDING_OPTIONS.some((o) => (o.value as string).startsWith("/film-shop"))).toBe(false);
    expect(src("src/pages/receipts/StorePicker.tsx")).not.toContain("/film-shop");
    expect(src("src/components/admin/WorkspaceLinksCard.tsx")).not.toContain("/film-shop");
  });

  it("ทางเข้าเดียวคือปุ่มบนแดชบอร์ดแอดมิน", () => {
    const dash = src("src/pages/admin/AdminDashboardHome.tsx");
    expect(dash).toContain('data-testid="ng-hero-filmshop"');
    expect([...dash.matchAll(/to="\/film-shop"/g)]).toHaveLength(1);

    // ไม่มีลิงก์ <Link to="/film-shop"> ที่อื่นในฝั่งแอดมิน/ลูกค้า (นอกโมดูล film-shop เอง)
    const offenders = walk(resolve(process.cwd(), "src"))
      .filter((p) => /\.tsx?$/.test(p))
      .filter((p) => !p.includes("/film-shop/") && !p.includes("__tests__"))
      .filter((p) => !p.endsWith("AdminDashboardHome.tsx"))
      .filter((p) => /to="\/film-shop"/.test(readFileSync(p, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("ไม่มีรายการ “คิวงาน/ติดตามงาน” ในเมนูนำทางกลาง", () => {
    expect(src("src/lib/routeRegistry.ts")).not.toContain("group-queue");
    expect(src("src/pages/receipts/ReceiptsLayout.tsx")).not.toContain("ติดตามงาน");
  });

  it("ใช้ข้อมูลจริงจาก useFilmOrders ไม่มีตัวเลขสมมติ", () => {
    expect(home).toMatch(/useFilmOrders\(\)/);
  });
});

