import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

function read(p: string): string {
  return fs.readFileSync(path.resolve(p), "utf8");
}

describe("Admin nav / route refactor", () => {
  const app = read("src/App.tsx");
  const adminLayout = read("src/components/layout/AdminLayout.tsx");
  const receiptsLayout = read("src/pages/receipts/ReceiptsLayout.tsx");
  const adminHome = read("src/pages/admin/AdminDashboardHome.tsx");
  const adminNav = read("src/lib/adminNav.ts");

  it("keeps legacy /admin/orders links on the current order workspace", () => {
    // /admin/orders (ไม่มี id) ยัง redirect ตามเดิม
    expect(app).toMatch(/path="\/admin\/orders"\s+element={<Navigate to="\/admin\//);
    // /admin/orders/:id เป็นหน้าแก้ปลายทางจริง เพื่อไม่ให้ลิงก์จากไลน์ทิ้ง id + ?export
    expect(app).toMatch(/path="\/admin\/orders\/:id"\s+element={<RequireStaff><AdminOrderDeepLink \/><\/RequireStaff>}/);
    // Dashboard nav no longer lists them
    expect(adminNav).not.toMatch(/\/admin\/orders/);
    expect(adminNav).not.toMatch(/label:\s*"โปรโมชั่นหน้าร้าน"/);
  });


  it("โปรโมชั่น/แคมเปญและทางลัดเว็บแอปถูกรวมไว้ที่ “จัดการหน้าแอพ”", () => {
    expect(app).toMatch(/path="\/admin\/shop-promos"\s+element={<Navigate to="\/admin\/shop-home" replace \/>}/);
    expect(app).toMatch(/path="\/admin\/app-shortcuts"\s+element={<Navigate to="\/admin\/shop-home" replace \/>}/);
    expect(read("src/pages/admin/SettingsHub.tsx")).toMatch(/\/admin\/shop-home/);
  });

  it("dashboard sidebar has exactly the approved entries and no LINE OA inbox", () => {
    const nav = adminNav.split("export const DASHBOARD_NAV")[1].split("];")[0];
    const labels = [...nav.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(labels).toEqual([
      "หน้าหลัก", "ออกเอกสาร", "POS จอสัมผัส",
      "งานและเอกสาร", "สินค้า & สต๊อก", "ลูกค้า",
      "รายงาน", "เครื่องมือ", "ตั้งค่า",
    ]);

    expect(nav).not.toMatch(/LINE OA|inbox/i);
    // “อัพเดตสินค้าและสต๊อก” + “รายการสินค้า” ถูกยุบเป็นทางเข้าเดียว
    expect(adminNav).not.toMatch(/อัพเดตสินค้าและสต๊อก|รายการสินค้า/);
  });

  it("workspace shell keeps a single back-to-dashboard entry, no duplicated nav", () => {
    expect(adminLayout).toMatch(/data-testid="back-button"/);
    expect(adminLayout).toMatch(/กลับหน้าหลัก/);
    expect(adminLayout).not.toMatch(/เมนูหลักมือถือ/);
    expect(adminLayout).not.toMatch(/const NAV_GROUPS/);
  });

  it("dashboard has no LINE OA shortcuts or diagnostics cards", () => {
    expect(adminHome).not.toMatch(/chat\.line\.biz|LINE OA/);
    expect(adminHome).not.toMatch(/NavLoopCard|WorkspaceLinksCard|StaffLineStatusCard/);
  });

  it("removes per-store POS tab from receipts sidebar", () => {
    expect(receiptsLayout).not.toMatch(/{\s*to:\s*"pos"\s*,/);
  });

  it("central POS route exists and old /receipts/:slug/pos redirects", () => {
    expect(app).toMatch(/path="\/pos"\s+element={<RequireStaffAny><PosShell/);
    expect(app).toMatch(/PerStorePosRedirect/);
  });

  it("CentralPOS is a UI-only shared POS (no branch picker, reads canonical products)", () => {
    const pos = read("src/pages/pos/CentralPOS.tsx");
    // No branch picker / per-store providers
    expect(pos).not.toMatch(/BranchPicker/);
    expect(pos).not.toMatch(/StoreSlugProvider/);
    expect(pos).not.toMatch(/TablePrefixProvider/);
    // Reads canonical public.products and categories
    expect(pos).toMatch(/\.from\("products"\)/);
    expect(pos).toMatch(/\.from\("categories"\)/);
    // Stock changes only through the secure checkout RPC, never direct table writes
    expect(pos).toMatch(/rpc\("pos_checkout"/);
    expect(pos).not.toMatch(/\.update\([^)]*stock/);
    // Shortcut to admin products page
    expect(pos).toMatch(/to="\/admin\/products"/);
    // Search + cart UI hooks
    expect(pos).toMatch(/data-testid="pos-search"/);
    expect(pos).toMatch(/data-testid="pos-cart"/);
    // New POS UI: checkout panel + mobile bar
    expect(pos).toMatch(/data-testid="pos-checkout-panel"/);
    expect(pos).toMatch(/data-testid="pos-mobile-bar"/);
    // POS page never mutates stock
    expect(pos).not.toMatch(/\.update\([^)]*stock/);
  });
});

describe("Stock side-effect isolation", () => {
  it("document/PDF code paths never write stock_qty", () => {
    const files = [
      "src/pages/receipts/documents/DocumentForm.tsx",
      "src/pages/receipts/documents/DocumentsList.tsx",
      "src/pages/receipts/documents/PrintDocument.tsx",
      "src/pages/receipts/documents/PrintPreview.tsx",
    ];
    for (const f of files) {
      const src = read(f);
      // stock_qty must never appear in a mutating context in these files
      expect(src).not.toMatch(/stock_qty\s*[:=]/);
      expect(src).not.toMatch(/\.update\([^)]*stock_qty/);
    }
  });
});