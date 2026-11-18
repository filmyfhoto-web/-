import { describe, it, expect, beforeEach } from "vitest";
import {
  getHostMode,
  resolveHostRedirect,
  isAdminPath,
  isAdminOnlyPath,
  isStaffPath,
  isCustomerPath,
  homePathFor,
} from "@/lib/hostMode";

beforeEach(() => {
  try { window.localStorage.removeItem("__hostMode"); } catch { /* ignore */ }
});

describe("hostMode", () => {
  it("maps admin subdomain to admin", () => {
    expect(getHostMode("admin.filmyynatta.com")).toBe("admin");
  });
  it("maps staff subdomain to staff", () => {
    expect(getHostMode("staff.filmyynatta.com")).toBe("staff");
  });
  it("legacy yynatta-admin.com no longer counts as admin", () => {
    expect(getHostMode("yynatta-admin.com")).toBe("customer");
  });
  it("maps www + apex to customer", () => {
    expect(getHostMode("www.filmyynatta.com")).toBe("customer");
    expect(getHostMode("filmyynatta.com")).toBe("customer");
  });
  it("preview host defaults to customer", () => {
    expect(getHostMode("id-preview--abc.lovable.app")).toBe("customer");
  });
  it("localStorage override forces admin on non-admin host", () => {
    window.localStorage.setItem("__hostMode", "admin");
    expect(getHostMode("localhost")).toBe("admin");
  });
  it("localStorage override supports staff", () => {
    window.localStorage.setItem("__hostMode", "staff");
    expect(getHostMode("localhost")).toBe("staff");
  });
});

describe("resolveHostRedirect", () => {
  it("customer host keeps serving staff/admin paths as fallback", () => {
    // Path fallback stays on so www.filmyynatta.com/pos and /admin-login
    // keep working while the dedicated subdomains' DNS propagates.
    expect(resolveHostRedirect("customer", "/admin/dashboard")).toBeNull();
    expect(resolveHostRedirect("admin", "/shop")).toBeNull();
  });
  it("root path redirects per mode", () => {
    // "/" is delegated to the role-aware landing router.
    expect(resolveHostRedirect("customer", "/")).toBeNull();
    expect(resolveHostRedirect("admin", "/")).toBeNull();
    expect(resolveHostRedirect("staff", "/")).toBeNull();
  });
  it("allows in-mode paths", () => {
    expect(resolveHostRedirect("customer", "/shop")).toBeNull();
    expect(resolveHostRedirect("admin", "/admin/dashboard")).toBeNull();
    expect(resolveHostRedirect("staff", "/pos")).toBeNull();
    expect(resolveHostRedirect("staff", "/pos/stock")).toBeNull();
    expect(resolveHostRedirect("staff", "/receipts")).toBeNull();
  });
  it("staff host never serves admin-only or customer paths", () => {
    expect(resolveHostRedirect("staff", "/admin/dashboard")).toBe("/pos");
    expect(resolveHostRedirect("staff", "/admin-login")).toBe("/pos");
    expect(resolveHostRedirect("staff", "/shop")).toBe("/pos");
    expect(resolveHostRedirect("staff", "/cart")).toBe("/pos");
  });
  it("never loops: redirect targets are stable under a second pass", () => {
    (["admin", "staff", "customer"] as const).forEach((mode) => {
      const paths = ["/", "/admin/dashboard", "/pos", "/shop", "/cart", "/receipts", "/auth"];
      paths.forEach((p) => {
        const first = resolveHostRedirect(mode, p);
        if (!first) return;
        expect(resolveHostRedirect(mode, first)).toBeNull();
      });
    });
  });
  it("home path per mode", () => {
    expect(homePathFor("staff")).toBe("/staff/home");
    expect(homePathFor("admin")).toBe("/admin/home");
    expect(homePathFor("customer")).toBe("/shop");
  });
  it("classifies paths", () => {
    expect(isAdminPath("/admin/x")).toBe(true);
    expect(isCustomerPath("/shop")).toBe(true);
    expect(isAdminPath("/shop")).toBe(false);
    expect(isAdminOnlyPath("/pos")).toBe(false);
    expect(isAdminOnlyPath("/admin/staff")).toBe(true);
    expect(isStaffPath("/pos/stock")).toBe(true);
    expect(isStaffPath("/admin/staff")).toBe(false);
  });
});