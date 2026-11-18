import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { LEGACY_OPS_MENUS } from "@/lib/legacyUi";

const read = (p: string) => readFileSync(p, "utf8");

describe("phase 2A — retired ops menus", () => {
  it("flag stays off", () => {
    expect(LEGACY_OPS_MENUS).toBe(false);
  });

  it("admin inbox / notification routes are gated behind the flag", () => {
    const app = read("src/App.tsx");
    for (const path of ["/admin/inbox", "/admin/notification-center", "/admin/alert-stats"]) {
      const line = app.split("\n").find((l) => l.includes(`path="${path}"`))!;
      expect(line).toBeTruthy();
      expect(line).toContain("LEGACY_OPS_MENUS");
      expect(line).toContain("Navigate");
    }
  });

  it("admin shells carry no notification bell or inbox link at all", () => {
    for (const f of [
      "src/components/layout/AdminLayout.tsx",
      "src/components/layout/DashboardShell.tsx",
      "src/lib/adminNav.ts",
    ]) {
      const src = read(f);
      expect(src).not.toContain("AdminNotificationCenter");
      expect(src).not.toContain("/admin/inbox");
    }
  });

  it("live panels no longer deep-link into retired pages", () => {
    expect(read("src/components/admin/live/LiveDetailPanel.tsx")).not.toContain("/admin/inbox");
    expect(read("src/pages/admin/Tools.tsx")).not.toContain("/admin/alert-stats");
  });
});
