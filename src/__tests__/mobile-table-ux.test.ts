import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

describe("mobile table UX", () => {
  it("collapses row actions into a three-dot menu on phones", () => {
    const src = read("src/components/table/RowActions.tsx");
    expect(src).toContain("MoreHorizontal");
    expect(src).toContain("DropdownMenu");
    expect(src).toContain("hidden md:flex");
    expect(src).toContain("flex md:hidden");
  });

  it("provides mobile-first search, filter and sort controls", () => {
    const src = read("src/components/table/TableToolbar.tsx");
    expect(src).toContain("onSearchChange");
    expect(src).toContain("filters");
    expect(src).toContain("เรียงลำดับ");
  });

  it("pages large tables with an infinite-scroll sentinel", () => {
    const src = read("src/hooks/useTablePaging.ts");
    expect(src).toContain("IntersectionObserver");
    expect(src).toContain("setSentinel");
    expect(src).toContain("pageSize = 50");
  });

  it("pins header and first column for tall tables without breaking print", () => {
    const css = read("src/index.css");
    expect(css).toContain("[data-table-scroll][data-table-sticky]");
    expect(css).toMatch(/position: sticky;\s*top: 0;/);
    expect(css).toContain("position: static !important");
    const fit = read("src/components/MobileTableFit.tsx");
    expect(fit).toContain("data-table-sticky");
    expect(fit).toContain("STICKY_MIN_ROWS");
  });

  it("turns wide tables into cards on phones and tablets with expandable rows", () => {
    const fit = read("src/components/MobileTableFit.tsx");
    expect(fit).toContain("CARD_WIDE_COLS");
    expect(fit).toContain("cardModeFor");
    expect(fit).toContain("data-card-toggle");
    expect(fit).toContain("data-card-collapsible");
    expect(fit).toContain("ดูเพิ่มเติม");
    expect(fit).toContain("orientationchange");
    const css = read("src/index.css");
    expect(css).toContain("data-card-collapsible");
    expect(css).toContain("[data-card-toggle]");
  });

  it("gives POS a mobile bottom navigation bar", () => {
    const shell = read("src/components/layout/PosShell.tsx");
    expect(shell).toContain("pos-bottom-nav");
    expect(shell).toContain("md:hidden fixed bottom-0");
    expect(shell).toContain("min-h-[3rem]");
  });

  it("offers multi-row selection with bulk actions", () => {
    const src = read("src/components/table/BulkActionBar.tsx");
    expect(src).toContain("allSelected");
    expect(src).toContain("selectedIds");
    expect(src).toContain("Checkbox");
    const page = read("src/pages/pos/PosCustomers.tsx");
    expect(page).toContain("BulkActionBar");
    expect(page).toContain("ส่งออก CSV");
  });

  it("lets users hide, show and reorder columns with persisted prefs", () => {
    const hook = read("src/hooks/useColumnPrefs.ts");
    expect(hook).toContain("localStorage");
    expect(hook).toContain("visibleColumns");
    expect(hook).toContain("move");
    const picker = read("src/components/table/ColumnPicker.tsx");
    expect(picker).toContain("onMove");
    expect(picker).toContain("onReset");
    const page = read("src/pages/pos/PosCustomers.tsx");
    expect(page).toContain("ColumnPicker");
    expect(page).toContain("useColumnPrefs");
  });
});