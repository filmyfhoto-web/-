import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.resolve(p), "utf8");

describe("mobile drawer contrast & layout", () => {
  const css = read("src/index.css");
  const admin = read("src/components/layout/DashboardShell.tsx");
  const staff = read("src/components/layout/StaffLayout.tsx");
  const sheet = read("src/components/ui/sheet.tsx");

  it("nav items default to readable foreground on light surfaces", () => {
    const base = css.slice(css.indexOf(".admin-nav-item {"));
    expect(base).toMatch(/\.admin-nav-item \{\s*color: hsl\(var\(--foreground\)\)/);
    // white-on-navy colors only apply inside the navy sidebar
    expect(css).toMatch(/\.admin-sidebar \.admin-nav-item \{/);
    expect(css).toMatch(/\.admin-sidebar \.admin-nav-group-title \{/);
  });

  it("active/hover states use paired semantic tokens", () => {
    // active item = purple brand gradient + paired brand foreground token
    expect(css).toMatch(/\.admin-nav-item-active \{[^}]*--brand-foreground/);
    expect(css).toMatch(/\.admin-nav-item:hover,\s*\n\s*\.admin-nav-item:focus-visible/);
  });

  it("group titles use a token class instead of opacity", () => {
    expect(admin).toMatch(/admin-nav-group-title/);
    expect(admin).not.toMatch(/tracking-wide opacity-60/);
  });

  for (const [name, src, id] of [
    ["admin", admin, "admin-drawer"],
    ["staff", staff, "staff-drawer"],
  ] as const) {
    it(`${name} drawer is full-height, scrollable, safe-area aware and opaque`, () => {
      expect(src).toMatch(new RegExp(`data-testid="${id}"`));
      expect(src).toMatch(/bg-background text-foreground h-\[100dvh\]/);
      expect(src).toMatch(/flex-1 min-h-0 overflow-y-auto overscroll-contain/);
      expect(src).toMatch(/paddingTop: "env\(safe-area-inset-top\)"/);
      expect(src).toMatch(/paddingBottom: "calc\(0\.75rem \+ env\(safe-area-inset-bottom\)\)"/);
      // drawer closes after navigating
      expect(src).toMatch(/NavList onClick=\{\(\) => setDrawer\(false\)\}/);
    });
  }

  it("drawers carry the cascade-proof data attribute", () => {
    expect(admin).toMatch(/data-mobile-drawer="true"/);
    expect(staff).toMatch(/data-mobile-drawer="true"/);
    expect(staff).toMatch(/admin-nav-item/);
  });

  it("drawer contrast rules live outside @layer and force dark text on white", () => {
    const block = css.slice(css.indexOf("[data-mobile-drawer] {"));
    expect(block).toBeTruthy();
    expect(block).toMatch(/background-color: #ffffff !important/);
    expect(block).toMatch(/color: #1f2937 !important/); // nav items
    expect(block).toMatch(/#475569 !important/); // group titles / muted
    expect(block).toMatch(/opacity: 1 !important/);
    // active + hover states stay legible
    expect(block).toMatch(/\.admin-nav-item-active,[\s\S]*?background-color: #1d4ed8 !important/);
    expect(block).toMatch(/:hover,[\s\S]*?background-color: #e2e8f0 !important/);
    // disabled never disappears
    expect(block).toMatch(/#64748b !important/);
    // dark mode pairs a dark surface with light text
    expect(block).toMatch(/\.dark \[data-mobile-drawer\] \{[\s\S]*?#0b1220 !important[\s\S]*?#f8fafc !important/);
    // never white-on-white
    expect(/\[data-mobile-drawer\][^{]*\{[^}]*color: #ffffff !important;[^}]*background-color: #ffffff/.test(block)).toBe(false);
    // desktop navy sidebar is not targeted by these rules
    expect(block).not.toMatch(/admin-sidebar/);
  });

  it("sheet close button is opaque and above content", () => {
    expect(sheet).toMatch(/z-10[^"]*text-foreground/);
  });
});
