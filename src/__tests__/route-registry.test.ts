import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  checkNavEntries,
  followRedirects,
  NAV_ENTRIES,
  RETIRED_TARGETS,
  ROUTE_PATHS,
} from "@/lib/routeRegistry";

const app = readFileSync("src/App.tsx", "utf8");
const adminLayout = readFileSync("src/lib/adminNav.ts", "utf8");

/** All literal `path="..."` values declared in the router. */
function routerPaths(): string[] {
  return [...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
}

describe("route registry", () => {
  it("every declared route path really exists in App.tsx", () => {
    const declared = new Set(routerPaths());
    const missing = ROUTE_PATHS.filter((p) => !declared.has(p));
    expect(missing).toEqual([]);
  });

  it("every menu entry resolves to a live, non-legacy page", () => {
    const failing = checkNavEntries().filter((c) => !c.pass);
    expect(failing.map((f) => `${f.to}: ${f.note}`)).toEqual([]);
  });

  it("no menu points at a retired screen", () => {
    const bad = NAV_ENTRIES.filter((e) => RETIRED_TARGETS.includes(followRedirects(e.to).target));
    expect(bad).toEqual([]);
  });

  it("detects redirect loops instead of hanging", () => {
    expect(followRedirects("/a", { "/a": "/b", "/b": "/a" })).toEqual({ target: "/a", loop: true });
  });

  it("flags a menu that points at a removed page", () => {
    const [bad] = checkNavEntries(
      [{ ...NAV_ENTRIES[0], to: "/ไม่มีหน้านี้", resolved: "/ไม่มีหน้านี้" }],
      ROUTE_PATHS,
    );
    expect(bad.pass).toBe(false);
    expect(bad.exists).toBe(false);
  });

  it("covers desktop and mobile for both customer and admin menus", () => {
    for (const surface of ["customer", "admin"] as const) {
      const rows = NAV_ENTRIES.filter((e) => e.surface === surface);
      expect(rows.length).toBeGreaterThan(3);
      expect(rows.some((r) => r.device === "both" || r.device === "mobile")).toBe(true);
      expect(rows.some((r) => r.device === "both" || r.device === "desktop")).toBe(true);
    }
  });

  it("keeps the admin sidebar in sync with the registry", () => {
    const adminTargets = NAV_ENTRIES.filter((e) => e.surface === "admin").map((e) => e.to);
    const missing = adminTargets.filter((t) => !["/admin/home", "/admin/work-docs", "/admin/customer-hub", "/admin/reports", "/admin/settings"].includes(t) && !adminLayout.includes(t));
    expect(missing).toEqual([]);
  });

  it("exposes the routes diagnostics page in the router", () => {
    expect(app).toContain('path="/diagnostics/routes"');
    expect(app).toContain("DiagnosticsRoutes");
  });
});