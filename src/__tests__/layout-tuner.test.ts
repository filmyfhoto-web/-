import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DEFAULT_LAYOUT_PREF, applyToAllPages, clampFontScale, getBlockOrder, getLayoutPref,
  hasPageOverride, moveInOrder, normalizePath, resetLayoutPref, setBlockOrder, setLayoutPref,
} from "@/lib/layoutPref";

const read = (p: string) => readFileSync(p, "utf8");

describe("layout preferences", () => {
  beforeEach(() => localStorage.clear());

  it("keeps the font scale inside 80–150%", () => {
    expect(clampFontScale(0.1)).toBe(0.8);
    expect(clampFontScale(9)).toBe(1.5);
    expect(clampFontScale(1.234)).toBe(1.23);
  });

  it("normalises dynamic paths so ids do not fragment the settings", () => {
    expect(normalizePath("/admin/orders/8b276bab-1111-2222-3333-444455556666")).toBe("/admin/orders");
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("/film-shop/app?p=quick-doc")).toBe("/film-shop/app");
  });

  it("stores settings per page and falls back to the device default", () => {
    setLayoutPref("/welcome", { fontScale: 1.25, width: "wide" });
    expect(getLayoutPref("/welcome").fontScale).toBe(1.25);
    expect(getLayoutPref("/welcome").width).toBe("wide");
    expect(hasPageOverride("/welcome")).toBe(true);
    // หน้าอื่นยังเป็นค่ามาตรฐาน
    expect(getLayoutPref("/admin")).toEqual(DEFAULT_LAYOUT_PREF);
  });

  it("can push the current page settings to every page, and reset back", () => {
    setLayoutPref("/welcome", { fontScale: 1.3, density: "roomy" });
    applyToAllPages("/welcome");
    expect(getLayoutPref("/admin").fontScale).toBe(1.3);
    expect(getLayoutPref("/admin").density).toBe("roomy");
    resetLayoutPref("/welcome", true);
    expect(getLayoutPref("/admin")).toEqual(DEFAULT_LAYOUT_PREF);
  });

  it("remembers a custom block order and keeps new blocks visible", () => {
    setBlockOrder("/", "home", ["tutorial", "hero"]);
    expect(getBlockOrder("/", "home", ["hero", "tutorial", "contact"]))
      .toEqual(["tutorial", "hero", "contact"]);
    expect(moveInOrder(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });
});

describe("layout tuner UI wiring", () => {
  it("mounts the floating tuner app-wide", () => {
    const app = read("src/App.tsx");
    expect(app).toContain("<LayoutTuner />");
  });

  it("offers font size, width, density, arrange mode and reset", () => {
    const tuner = read("src/components/common/LayoutTuner.tsx");
    for (const id of [
      "layout-tuner-button", "layout-font-range", "layout-width-${w.key}",
      "layout-density-${d.key}", "layout-arrange-toggle", "layout-apply-all", "layout-reset",
    ]) expect(tuner).toContain(id);
  });


  it("never changes printed documents", () => {
    const css = read("src/index.css");
    expect(css).toContain("--ui-font-scale");
    expect(css).toContain("html[data-text-size=\"large\"] { font-size: 100% !important; }");
  });

  it("lets the home page blocks be re-ordered", () => {
    expect(read("src/pages/Welcome.tsx")).toContain("<SortableStack stackKey=\"home\"");
  });
});
