import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.resolve(p), "utf8");

describe("build stamp is visible on both shells", () => {
  it("customer layout renders the build stamp", () => {
    const src = read("src/components/layout/CustomerLayout.tsx");
    expect(src).toMatch(/BuildStamp/);
  });

  it("admin layout renders the build stamp", () => {
    const src = read("src/components/layout/AdminLayout.tsx");
    expect(src).toMatch(/<BuildStamp/);
  });

  it("the stamp reads from the shared build info, never a hard-coded string", () => {
    const src = read("src/components/common/BuildStamp.tsx");
    expect(src).toMatch(/from "@\/lib\/buildInfo"/);
    expect(src).toMatch(/data-testid="build-stamp"/);
    expect(src).toMatch(/BUILD_INFO\.version/);
    expect(src).toMatch(/BUILD_INFO\.builtAt/);
  });
});

describe("menu targets never point at removed pages", () => {
  const app = read("src/App.tsx");
  const admin = read("src/components/layout/DashboardShell.tsx");
  const adminNav = read("src/lib/adminNav.ts");
  const customer = read("src/components/layout/CustomerLayout.tsx");

  const linkTargets = (src: string) =>
    Array.from(src.matchAll(/(?:to[:=]\s*"|to="?)(\/[a-z0-9\-/:]*)"/gi)).map((m) => m[1]);

  it("every admin + customer menu path has a route or redirect in App.tsx", () => {
    const paths = [...new Set([...linkTargets(admin), ...linkTargets(customer)])]
      .filter((p) => p !== "/" && !p.includes(":"));
    const missing = paths.filter((p) => !app.includes(`path="${p}"`));
    expect(missing, `menu links without a route: ${missing.join(", ")}`).toEqual([]);
  });

  it("dashboard nav is one shared list for desktop sidebar and mobile drawer", () => {
    const groupNav = adminNav.split("export const DASHBOARD_NAV")[1].split("];")[0];
    const app2 = read("src/App.tsx");
    for (const p of new Set(linkTargets(groupNav))) {
      expect(app2, `dashboard menu link without a route: ${p}`).toContain(`path="${p}"`);
    }
    // เมนูเดียว ใช้ร่วมกันทั้ง sidebar และ drawer — ไม่มี bottom bar ซ้ำ
    expect(admin).toContain("DASHBOARD_NAV");
    expect(admin).not.toContain("เมนูหลักมือถือ");
    // Customer: four tabs in the bottom nav (งานของฉัน ถูกรวมเข้าแท็บ “ฉัน”)
    const tabs = customer.split("const tabs = [")[1].split("];")[0];
    expect(tabs.split("\n").filter((l) => /to:\s*"/.test(l)).length).toBe(4);
  });
});