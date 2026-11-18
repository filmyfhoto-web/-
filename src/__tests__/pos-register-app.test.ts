import { describe, it, expect, beforeEach } from "vitest";
import { PWA_APPS, applyPwaManifest, isInstallableApp, resolvePwaApp } from "@/lib/pwaManifest";
import { launchTarget, type LaunchRole } from "@/lib/launchTarget";
import { POS_LOGIN_PATH, readLoginContext } from "@/lib/posLoginContext";

const base: LaunchRole = {
  signedIn: true, isOwner: false, isAdmin: false, isStaffAny: false, canPos: false, canStock: false,
};

beforeEach(() => { document.head.innerHTML = ""; });

describe("POS touch register PWA", () => {
  it("is its own installable app with a distinct manifest, icon and theme", () => {
    expect(isInstallableApp("pos")).toBe(true);
    applyPwaManifest("pos");
    const manifest = document.head.querySelector('link[rel="manifest"]')!.getAttribute("href")!;
    const icon = document.head.querySelector('link[rel="apple-touch-icon"]')!.getAttribute("href")!;
    expect(manifest).toContain("/manifest-pos.webmanifest");
    expect(icon).toContain("/icons/pos-apple-touch.png");
    expect(PWA_APPS.pos.themeColor).not.toBe(PWA_APPS.staff.themeColor);
    expect(PWA_APPS.pos.themeColor).not.toBe(PWA_APPS.admin.themeColor);
    expect(PWA_APPS.pos.startPath).toBe("/pos/register");
  });

  it("never mixes manifests across the four surfaces", () => {
    expect(resolvePwaApp("/pos/register", "staff")).toBe("pos");
    expect(resolvePwaApp("/pos", "staff")).toBe("staff");
    expect(resolvePwaApp("/pos/stock", "staff")).toBe("staff");
    expect(resolvePwaApp("/admin/dashboard", "admin")).toBe("admin");
    expect(resolvePwaApp("/shop", "customer")).toBe("customer");
    expect(resolvePwaApp("/pos/register", "customer", "?app=admin")).toBe("admin");
  });

  it("keeps the pos manifest while the user is on the staff login page", () => {
    // during login the pathname is /staff, but ?app=pos must win
    expect(resolvePwaApp("/staff", "staff", "?app=pos&next=%2Fpos%2Fregister")).toBe("pos");
    expect(resolvePwaApp("/staff/home", "staff", "?app=pos")).toBe("pos");
    applyPwaManifest(resolvePwaApp("/staff", "staff", "?app=pos"));
    expect(document.head.querySelector('link[rel="manifest"]')!.getAttribute("href"))
      .toContain("/manifest-pos.webmanifest");
  });

  it("customer storefront is installable with its own manifest", () => {
    applyPwaManifest("customer");
    expect(document.head.querySelector('link[rel="manifest"]')!.getAttribute("href"))
      .toContain("/manifest-customer.webmanifest");
    expect(isInstallableApp("customer")).toBe(true);
  });

  it("launches the register only for people who may sell", () => {
    // signed out: keep the POS context alive through the staff login round trip
    expect(launchTarget("pos", { ...base, signedIn: false })).toBe(POS_LOGIN_PATH);
    const ctx = readLoginContext(POS_LOGIN_PATH.slice(POS_LOGIN_PATH.indexOf("?")));
    expect(ctx.app).toBe("pos");
    expect(ctx.next).toBe("/pos/register");
    expect(launchTarget("pos", { ...base, isOwner: true })).toBe("/pos/register");
    expect(launchTarget("pos", { ...base, isAdmin: true })).toBe("/pos/register");
    expect(launchTarget("pos", { ...base, isStaffAny: true, canPos: true })).toBe("/pos/register");
    // stock-only staff: no POS permission → a page they can actually use
    expect(launchTarget("pos", { ...base, isStaffAny: true, canStock: true })).toBe("/pos/stock");
    expect(launchTarget("pos", { ...base, isStaffAny: true })).toBe("/staff/inbox");
    // signed in, no staff role at all
    expect(launchTarget("pos", base)).toBe("/shop");
  });
});
