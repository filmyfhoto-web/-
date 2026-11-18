import { describe, expect, it } from "vitest";
import {
  ADMIN_HOME, CUSTOMER_HOME, NO_ACCESS_PATH, STAFF_HOME, WELCOME_PATH,
  resolveRoleHome, shouldRedirect,
} from "@/lib/roleHome";
import { searchSettings, SETTINGS_TABS } from "@/pages/admin/SettingsHub";
import { friendlyLineMessage } from "@/pages/customer/CustomerLogin";

describe("role redirect", () => {
  it("sends signed-out visitors to the three-choice welcome screen", () => {
    expect(resolveRoleHome({ signedIn: false })).toBe(WELCOME_PATH);
    expect(resolveRoleHome({ signedIn: false, isAdmin: true })).toBe(WELCOME_PATH);
  });

  it("sends each role to exactly one home", () => {
    expect(resolveRoleHome({ signedIn: true, isOwner: true })).toBe(ADMIN_HOME);
    expect(resolveRoleHome({ signedIn: true, isAdmin: true })).toBe(ADMIN_HOME);
    expect(resolveRoleHome({ signedIn: true, isStaffAny: true })).toBe(STAFF_HOME);
    expect(resolveRoleHome({ signedIn: true, isCustomer: true })).toBe(CUSTOMER_HOME);
  });

  it("shows a friendly no-access screen instead of looping for role-less users", () => {
    expect(resolveRoleHome({ signedIn: true })).toBe(NO_ACCESS_PATH);
  });

  it("never redirects between two terminal screens (loop prevention)", () => {
    expect(shouldRedirect("/customer/login", WELCOME_PATH)).toBe(false);
    expect(shouldRedirect(WELCOME_PATH, "/staff/login")).toBe(false);
    expect(shouldRedirect(NO_ACCESS_PATH, NO_ACCESS_PATH)).toBe(false);
    expect(shouldRedirect("/", ADMIN_HOME)).toBe(true);
  });
});

describe("settings hub", () => {
  it("has exactly the four required tabs", () => {
    expect(SETTINGS_TABS.map((t) => t.key)).toEqual(["store", "users", "sales", "tools"]);
  });

  it("hides admin-only advanced tools from non-admin staff", () => {
    const staffAdvanced = searchSettings("", false).find((t) => t.key === "tools")!;
    expect(staffAdvanced.entries).toHaveLength(0);
    const adminAdvanced = searchSettings("", true).find((t) => t.key === "tools")!;
    expect(adminAdvanced.entries.length).toBeGreaterThan(0);
  });

  it("filters entries by search query", () => {
    const hits = searchSettings("พนักงาน", true).flatMap((t) => t.entries);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((e) => `${e.label} ${e.desc ?? ""}`.includes("พนักงาน"))).toBe(true);
  });

  it("does not list the same destination in two tabs", () => {
    const all = SETTINGS_TABS.flatMap((t) => t.entries.map((e) => e.to));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("customer LINE errors", () => {
  it("maps technical codes to friendly Thai text without leaking tokens", () => {
    const msg = friendlyLineMessage("id_token_invalid");
    expect(msg).toContain("ไม่สำเร็จ");
    expect(msg).not.toContain("token");
    expect(friendlyLineMessage("access_denied")).toContain("ยกเลิก");
    expect(friendlyLineMessage(null)).toBe("");
  });
});