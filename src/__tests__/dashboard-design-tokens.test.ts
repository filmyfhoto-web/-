import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const DASHBOARD_FILES = [
  "src/components/dashboard/ng/DashboardPrimitives.tsx",
  "src/pages/admin/AdminDashboardHome.tsx",
  "src/components/common/DataStates.tsx",
];

const REQUIRED_TOKENS = [
  "--ng-ink", "--ng-muted", "--ng-soft", "--ng-line", "--ng-line-soft", "--ng-divider",
  "--ng-tint", "--ng-tint-hover", "--ng-purple", "--ng-purple-deep", "--ng-purple-tint",
  "--ng-blue", "--ng-orange", "--ng-green", "--ng-pink", "--ng-chip", "--ng-hero-gradient",
];

describe("แดชบอร์ด NATTA GROUP — ล็อกสีด้วย design tokens", () => {
  it("index.css ประกาศ token ครบทุกตัว", () => {
    const css = read("src/index.css");
    for (const t of REQUIRED_TOKENS) expect(css, `ขาด token ${t}`).toContain(`${t}:`);
  });

  it("tailwind.config.ts map token เป็นสี ng.*", () => {
    const cfg = read("tailwind.config.ts");
    expect(cfg).toContain('ink: "hsl(var(--ng-ink))"');
    expect(cfg).toContain('purple: "hsl(var(--ng-purple))"');
    expect(cfg).toContain('"line-soft": "hsl(var(--ng-line-soft))"');
  });

  it("ไฟล์แดชบอร์ดไม่มี hex hardcode เหลืออยู่", () => {
    for (const f of DASHBOARD_FILES) {
      const hits = read(f).match(/#[0-9a-fA-F]{6}\b/g) ?? [];
      expect(hits, `${f} ยังมีสี hardcode: ${hits.join(", ")}`).toHaveLength(0);
    }
  });

  it("ใช้ radius/typography ชุดเดียวกันตามม็อกอัป", () => {
    const prim = read("src/components/dashboard/ng/DashboardPrimitives.tsx");
    expect(prim).toContain("rounded-[16px]");   // การ์ดหลัก
    expect(prim).toContain("rounded-[14px]");   // กล่องเมตริก
    expect(prim).toContain("text-[15px]");      // หัวข้อการ์ด
    expect(prim).toContain("text-[24px]");      // ตัวเลขเมตริก
  });
});
