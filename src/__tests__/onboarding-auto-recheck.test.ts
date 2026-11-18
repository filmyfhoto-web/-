import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * หน้าเพิ่มเพื่อน LINE พร้อม QR (OnboardingGate) ถูกเลิกใช้แล้ว
 * เพราะระบบไม่บังคับผูก LINE ก่อนสั่งซื้ออีกต่อไป — ลูกค้าเข้าหน้าร้านได้ทันที
 * เทสต์นี้กันไม่ให้ประตูกันหน้าร้านกลับมาโดยไม่ตั้งใจ
 */
const read = (p: string) => readFileSync(p, "utf8");

describe("เส้นทางลูกค้าไม่มีประตูกัน LINE แล้ว", () => {
  it("ไฟล์หน้า QR เดิมถูกลบออกจากโปรเจกต์", () => {
    expect(existsSync("src/components/onboarding/OnboardingGate.tsx")).toBe(false);
  });

  it("ไม่มีโค้ดไหนอ้างถึง OnboardingGate อีก", () => {
    const hits = execSync("git grep -l OnboardingGate -- src || true", { encoding: "utf8" })
      .split("\n")
      .filter((f) => f && f !== "src/__tests__/onboarding-auto-recheck.test.ts");
    expect(hits).toEqual([]);
  });

  it("RequireLineLink ปล่อยผ่านตรง ๆ ไม่เรนเดอร์ประตูกัน", () => {
    const src = read("src/components/RequireLineLink.tsx");
    expect(src).toContain("return <>{children}</>");
    expect(src).not.toContain("friendshipRequired");
  });

  it("หน้าร้านลูกค้าบังคับโหลดบิลด์ล่าสุด กันเครื่องที่ค้างหน้าจอรุ่นเก่า", () => {
    expect(read("src/pages/Shop.tsx")).toContain("useFreshBuildOnMount()");
  });
});
