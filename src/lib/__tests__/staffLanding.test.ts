import { beforeEach, describe, expect, it } from "vitest";
import { getDefaultLanding, resolveLanding, setDefaultLanding } from "@/lib/staffLanding";

describe("staff landing preference", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to auto and follows the role", () => {
    expect(getDefaultLanding()).toBe("auto");
    expect(resolveLanding(true)).toBe("/admin/home");
    expect(resolveLanding(false)).toBe("/pos");
  });

  it("persists an explicit choice", () => {
    setDefaultLanding("/staff/inbox");
    expect(getDefaultLanding()).toBe("/staff/inbox");
    expect(resolveLanding(true)).toBe("/staff/inbox");
  });

  it("ignores unknown stored values", () => {
    localStorage.setItem("staff.defaultLanding", "/evil");
    expect(getDefaultLanding()).toBe("auto");
  });
});