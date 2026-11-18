import { describe, it, expect, beforeEach } from "vitest";
import { resolvePwaApp, deviceWorkspace, isAdminWorkspaceDevice } from "@/lib/pwaManifest";

describe("persistent admin workspace marker", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("remembers the admin workspace across app restarts", () => {
    expect(isAdminWorkspaceDevice()).toBe(false);
    resolvePwaApp("/admin/home", "admin");
    expect(deviceWorkspace()).toBe("admin");
    sessionStorage.clear(); // iOS killed the standalone window
    expect(isAdminWorkspaceDevice()).toBe(true);
    expect(resolvePwaApp("/auth", "customer")).toBe("admin");
  });

  it("never persists the customer workspace over an admin device", () => {
    resolvePwaApp("/admin/home", "admin");
    resolvePwaApp("/shop", "customer");
    expect(deviceWorkspace()).toBe("admin");
  });

  it("uses the admin manifest on both public admin install routes", () => {
    expect(resolvePwaApp("/install/admin", "customer")).toBe("admin");
    expect(resolvePwaApp("/install-admin", "customer")).toBe("admin");
    expect(deviceWorkspace()).toBe("admin");
  });
});
