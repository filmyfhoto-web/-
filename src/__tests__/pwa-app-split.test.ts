import { describe, it, expect, beforeEach } from "vitest";
import {
  PWA_APPS, applyPwaManifest, isInstallableApp, resolvePwaApp, installPromptSuppressed,
} from "@/lib/pwaManifest";
import { launchTarget } from "@/lib/launchTarget";
import { resolveHostRedirect, isAdminOnlyPath } from "@/lib/hostMode";

beforeEach(() => {
  document.head.innerHTML = "";
});

describe("installability split", () => {
  it("customer, staff and admin are all installable", () => {
    expect(isInstallableApp("customer")).toBe(true);
    expect(isInstallableApp("staff")).toBe(true);
    expect(isInstallableApp("admin")).toBe(true);
    expect(isInstallableApp("receipts")).toBe(true);
    expect(isInstallableApp("film-shop")).toBe(true);
  });

  it("customer surface gets its own manifest and install signals", () => {
    applyPwaManifest("staff");
    expect(document.head.querySelector('link[rel="manifest"]')).not.toBeNull();
    applyPwaManifest("customer");
    expect(document.head.querySelector('link[rel="manifest"]')!.getAttribute("href"))
      .toContain("/manifest-customer.webmanifest");
    expect(document.head.querySelector('meta[name="apple-mobile-web-app-capable"]')).not.toBeNull();
    expect(document.head.querySelector('meta[name="mobile-web-app-capable"]')).not.toBeNull();
    expect(installPromptSuppressed()).toBe(false);
  });

  it("staff and admin get distinct manifests, icons, names and themes", () => {
    applyPwaManifest("staff");
    const staffManifest = document.head.querySelector('link[rel="manifest"]')!.getAttribute("href")!;
    const staffIcon = document.head.querySelector('link[rel="apple-touch-icon"]')!.getAttribute("href")!;
    applyPwaManifest("admin");
    const adminManifest = document.head.querySelector('link[rel="manifest"]')!.getAttribute("href")!;
    const adminIcon = document.head.querySelector('link[rel="apple-touch-icon"]')!.getAttribute("href")!;
    expect(staffManifest).toContain("/manifest-staff.webmanifest");
    expect(adminManifest).toContain("/manifest-admin.webmanifest");
    expect(staffIcon).toContain("/icons/staff-apple-touch.png");
    expect(adminIcon).toContain("/icons/admin-apple-touch.png");
    expect(PWA_APPS.staff.themeColor).not.toBe(PWA_APPS.admin.themeColor);
    expect(PWA_APPS.staff.appleTitle).not.toBe(PWA_APPS.admin.appleTitle);
    expect(installPromptSuppressed()).toBe(false);
  });

  it("never serves the staff manifest on admin paths (and vice versa)", () => {
    expect(resolvePwaApp("/admin/dashboard", "admin")).toBe("admin");
    expect(resolvePwaApp("/pos", "staff")).toBe("staff");
    expect(resolvePwaApp("/shop", "customer")).toBe("customer");
    expect(resolvePwaApp("/receipts", "staff")).toBe("receipts");
    expect(resolvePwaApp("/film-shop", "staff")).toBe("film-shop");
    expect(resolvePwaApp("/admin/dashboard", "customer", "?app=staff")).toBe("staff");
  });

  it("receipt and Film Shop links keep distinct launch targets", () => {
    const staff = { signedIn: true, isOwner: false, isAdmin: false, isStaffAny: true, canPos: false, canStock: false };
    expect(launchTarget("receipts", staff)).toBe("/receipts");
    expect(launchTarget("film-shop", staff)).toBe("/admin/home");
    expect(PWA_APPS.receipts.manifest).toBe("/manifest-receipts.webmanifest");
    expect(PWA_APPS["film-shop"].startPath).toBe("/admin/home");
    const signedOut = { ...staff, signedIn: false };
    expect(launchTarget("receipts", signedOut)).toContain("next=%2Freceipts");
    expect(launchTarget("film-shop", signedOut)).toContain("next=%2Freceipts%2Ffilm");
  });
});

describe("cross-role URL access", () => {
  it("staff workspace cannot render admin-only paths", () => {
    expect(isAdminOnlyPath("/admin/settings")).toBe(true);
    expect(resolveHostRedirect("staff", "/admin/settings")).toBe("/pos");
    expect(resolveHostRedirect("staff", "/admin/staff-permissions")).toBe("/pos");
  });

  it("admin icon on a non-staff account never opens the admin dashboard", () => {
    const base = { signedIn: true, isOwner: false, isAdmin: false, isStaffAny: false, canPos: false, canStock: false };
    expect(launchTarget("admin", base)).toBe("/shop");
    expect(launchTarget("admin", { ...base, isStaffAny: true, canPos: true })).toBe("/pos");
    expect(launchTarget("admin", { ...base, isOwner: true })).toBe("/admin/home");
  });
});

describe("workspace stays separate through login redirects", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("keeps the POS app when /pos/register bounces to /staff/login", () => {
    expect(resolvePwaApp("/pos/register", "staff")).toBe("pos");
    expect(resolvePwaApp("/staff/login", "staff")).toBe("pos");
  });

  it("keeps the admin app when an admin path bounces to a login page", () => {
    expect(resolvePwaApp("/admin/home", "admin")).toBe("admin");
    expect(resolvePwaApp("/auth", "admin")).toBe("admin");
  });

  it("never leaks a remembered workspace onto the customer storefront", () => {
    expect(resolvePwaApp("/pos/register", "staff")).toBe("pos");
    expect(resolvePwaApp("/shop", "customer")).toBe("customer");
  });
});
