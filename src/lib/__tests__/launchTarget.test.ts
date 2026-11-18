import { describe, it, expect } from "vitest";
import { launchTarget, type LaunchRole } from "../launchTarget";

const base: LaunchRole = {
  signedIn: true, isOwner: false, isAdmin: false, isStaffAny: false, canPos: false, canStock: false,
};

describe("launchTarget", () => {
  it("sends anonymous users to the right login per installed app", () => {
    const out = { ...base, signedIn: false };
    expect(launchTarget("admin", out)).toBe("/auth");
    expect(launchTarget("staff", out)).toBe("/staff?app=staff");
    expect(launchTarget("customer", out)).toBe("/shop");
  });

  it("opens the admin dashboard for owner/admin from the admin app", () => {
    expect(launchTarget("admin", { ...base, isOwner: true, isStaffAny: true, canPos: true, canStock: true }))
      .toBe("/admin/home");
    expect(launchTarget("admin", { ...base, isAdmin: true, isStaffAny: true, canPos: true, canStock: true }))
      .toBe("/admin/home");
  });

  it("downgrades to a page the role can actually use", () => {
    // admin icon on a stock-only staff phone
    expect(launchTarget("admin", { ...base, isStaffAny: true, canStock: true })).toBe("/pos/stock");
    // staff with POS access
    expect(launchTarget("staff", { ...base, isStaffAny: true, canPos: true, canStock: true })).toBe("/pos");
    // staff with no module perms at all
    expect(launchTarget("staff", { ...base, isStaffAny: true })).toBe("/staff/inbox");
  });

  it("real role wins over a legacy customer icon", () => {
    // Legacy iOS shortcut installed with start_url=/launch?app=customer
    expect(launchTarget("customer", { ...base, isOwner: true, isStaffAny: true })).toBe("/admin/home");
    expect(launchTarget("customer", { ...base, isAdmin: true, isStaffAny: true })).toBe("/admin/home");
    // real customers keep the storefront
    expect(launchTarget("customer", base)).toBe("/shop");
    // staff without admin rights are not pushed into the console
    expect(launchTarget("customer", { ...base, isStaffAny: true, canPos: true })).toBe("/shop");
  });

  it("recovers a signed-out legacy customer icon on an admin device", () => {
    expect(launchTarget("customer", { ...base, signedIn: false, adminDevice: true })).toBe("/auth?app=admin");
    expect(launchTarget("customer", { ...base, signedIn: false })).toBe("/shop");
  });

  it("keeps the admin workspace marker in the legacy recovery login URL", () => {
    const target = launchTarget("customer", { ...base, signedIn: false, adminDevice: true });
    expect(new URLSearchParams(target.split("?")[1]).get("app")).toBe("admin");
  });

  it("sends signed-in non-staff away from staff/admin icons", () => {
    expect(launchTarget("admin", base)).toBe("/shop");
    expect(launchTarget("staff", base)).toBe("/shop");
  });
});