import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { BUILD_INFO } from "@/lib/buildInfo";
import { assetCacheNames } from "@/lib/appUpdate";

const register = readFileSync("src/pages/pos/PosRegister.tsx", "utf8");
const portal = readFileSync("src/pages/StaffPortal.tsx", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };

describe("POS register v2 visual contract", () => {
  it("ships the new light convenience-store layout, not the dark/orange one", () => {
    expect(register).toContain('data-pos-ui="v2"');
    expect(register).toContain("bg-slate-100 text-slate-900");
    expect(register).not.toContain("bg-slate-950 text-slate-50");
  });

  it("has a blue top bar with บาทคงค้าง and the huge total", () => {
    expect(register).toContain('data-testid="pos-topbar"');
    expect(register).toContain("bg-blue-700 text-white");
    expect(register).toContain("บาทคงค้าง");
    expect(register).toContain('data-testid="pos-net-total"');
  });

  it("has a green command panel and a blue table head", () => {
    expect(register).toContain('data-testid="pos-command-panel"');
    expect(register).toContain("bg-emerald-600");
    expect(register).toContain('data-testid="pos-table-head"');
    for (const col of ["บาร์โค้ด", "รายการสินค้า", "จำนวน", "ราคาต่อหน่วย", "ส่วนลด", "รวมเงิน"]) {
      expect(register).toContain(col);
    }
  });

  it("has a blue numpad rail and a big red รวมยอด button", () => {
    expect(register).toContain('data-testid="pos-numpad-panel"');
    expect(register).toContain("bg-blue-800 p-2");
    expect(register).toMatch(/data-testid="pos-checkout"[\s\S]{0,400}bg-red-600/);
    expect(register).toContain("รวมยอด");
  });

  it("has the colored function bar and navy footer", () => {
    expect(register).toContain('data-testid="pos-function-bar"');
    for (const id of ["pos-fn-exit", "pos-fn-reprint", "pos-fn-member", "pos-fn-gift", "pos-fn-void", "pos-fn-search"]) {
      expect(register).toContain(`testid="${id}"`);
    }
    expect(register).toMatch(/data-testid="pos-footer"[\s\S]{0,200}bg-blue-950|bg-blue-950[\s\S]{0,200}data-testid="pos-footer"/);
  });

  it("shows the running version so users can confirm the new build", () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(register).toContain('data-testid="pos-version"');
    expect(register).toContain("POS v{BUILD_INFO.version}");
    expect(BUILD_INFO.version).toBe(pkg.version);
  });

  it("keeps mixed payment genuinely disabled with no handler", () => {
    const m = register.match(/data-testid="pos-pay-split"[\s\S]{0,400}?\/>|data-testid="pos-pay-split"[\s\S]{0,600}?<\/button>/)!;
    expect(m[0]).toContain("disabled");
    expect(m[0]).not.toContain("onClick");
  });

  it("offers a safe 'load latest version' command", () => {
    expect(register).toContain(`testid="pos-check-update"`);
    expect(register).toContain("refreshAppAssets");
  });
});

describe("asset-only cache refresh", () => {
  it("clears build asset caches but never data/auth stores", () => {
    const kept = ["api-read", "supabase-auth", "user-data"];
    const names = ["workbox-precache-v2-https://x/", "static-assets", "pwa-assets", "html-nav", "images", ...kept];
    const dropped = assetCacheNames(names);
    expect(dropped).toContain("static-assets");
    expect(dropped).toContain("pwa-assets");
    for (const k of kept) expect(dropped).not.toContain(k);
  });
});

describe("portal POS entry point", () => {
  it("shows a prominent 🏪 POS card linking to /launch?app=pos with the new badge", () => {
    expect(portal).toContain('data-testid="portal-pos"');
    expect(portal).toContain('to="/launch?app=pos"');
    expect(portal).toContain("เปิด POS");
    expect(portal).toContain("ใหม่ v{BUILD_INFO.version}");
    expect(portal).toContain("🏪");
  });

  it("keeps the staff 📦 and admin 🖥️ doors intact", () => {
    expect(portal).toContain('data-testid="portal-staff"');
    expect(portal).toContain('data-testid="portal-admin"');
  });
});
