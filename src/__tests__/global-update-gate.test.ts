import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const gate = readFileSync("src/components/AppUpdateGate.tsx", "utf8");
const app = readFileSync("src/App.tsx", "utf8");

describe("global app update gate", () => {
  it("is mounted once for customer, staff, POS and admin routes", () => {
    expect(app).toContain("<AppUpdateGate />");
    expect(gate).toContain('return "POS"');
    expect(gate).toContain('return "แอดมิน"');
    expect(gate).toContain('return "พนักงาน"');
    expect(gate).toContain('return "ลูกค้า"');
  });

  it("updates silently (no orange banner) and still exposes safe and force refresh", () => {
    expect(gate).not.toContain('data-testid="global-update-banner"');
    expect(gate).toContain("refreshAppAssets");
    expect(gate).toContain("forceUpdateApp");
    // ป้ายเวอร์ชันลอยมุมจอถูกเอาออกแล้ว (ทั้งลูกค้า พนักงาน และแอดมิน)
    expect(gate).not.toContain('data-testid="global-version-badge"');
    expect(gate).toContain("ui:open-update-dialog");

  });
});